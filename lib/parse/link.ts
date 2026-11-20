// SSRF-safe URL fetching for the "link" menu source.
//
// - Only http/https URLs without embedded credentials.
// - Every hostname is resolved and every resolved address is checked against a
//   block list of private/loopback/link-local/reserved ranges. The check runs
//   inside the socket's `lookup`, so the connection goes to exactly the address
//   that was checked (no DNS-rebinding gap).
// - Redirects are followed manually (max 5), re-checking every hop.
// - 15 s timeout per request, 20 MB body cap.

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import { imageSize } from "./images";

export const LINK_TIMEOUT_MS = 15_000;
export const LINK_MAX_BYTES = 20 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MAX_PAGE_IMAGES = 5;
const MAX_IMAGE_CANDIDATES = 12;
const MIN_IMAGE_EDGE = 500;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 alex-orders-menu-fetcher";

export class LinkError extends Error {}

// ---------- IP block list ----------

const blockList = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockList.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blockList.addSubnet(addr, prefix, "ipv6");
}

export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return blockList.check(address, "ipv4");
  if (family === 6) {
    const lower = address.toLowerCase();
    // IPv4-mapped / compatible (::ffff:a.b.c.d, ::a.b.c.d)
    const mapped = lower.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blockList.check(mapped[1], "ipv4");
    const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return blockList.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, "ipv4");
    }
    return blockList.check(address, "ipv6");
  }
  return true; // not an IP at all
}

// `lookup` replacement that refuses blocked addresses.
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, family: options.family ?? 0 }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0) return callback(new LinkError("Host did not resolve"), "", 0);
    if (list.some((a) => isBlockedAddress(a.address))) {
      return callback(new LinkError("That address is not allowed"), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

function validateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new LinkError("That doesn't look like a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new LinkError("Only http and https links are allowed");
  }
  if (url.username || url.password) throw new LinkError("Links with credentials are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isBlockedAddress(host)) throw new LinkError("That address is not allowed");
  if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) {
    throw new LinkError("That address is not allowed");
  }
  return url;
}

// ---------- low-level safe GET ----------

export interface FetchedResource {
  url: string; // final URL after redirects
  contentType: string; // lower-cased mime type without parameters
  buffer: Buffer;
}

function requestOnce(
  url: URL,
  maxBytes: number,
  deadline: number,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new LinkError("The link took too long to load"));

    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: safeLookup,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/pdf,image/*;q=0.9,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "ar,en;q=0.8",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, headers: res.headers, body: Buffer.alloc(0) });
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > maxBytes) {
          res.destroy();
          return reject(new LinkError("The file at that link is too large (max 20 MB)"));
        }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());

        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            reject(new LinkError("The file at that link is too large (max 20 MB)"));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
        stream.on("error", (e) => reject(e));
        res.on("aborted", () => reject(new LinkError("The connection was interrupted")));
      },
    );
    // Hard deadline for the whole request (connect + headers + body), not just idle time.
    const timer = setTimeout(() => {
      reject(new LinkError("The link took too long to load"));
      req.destroy();
    }, remaining);
    req.on("close", () => clearTimeout(timer));
    req.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.end();
  });
}

/** GET a URL with SSRF protection, manual redirects, timeout and size cap. */
export async function safeFetch(
  rawUrl: string,
  opts: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<FetchedResource> {
  const maxBytes = opts.maxBytes ?? LINK_MAX_BYTES;
  const deadline = Date.now() + (opts.timeoutMs ?? LINK_TIMEOUT_MS);
  let url = validateUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      res = await requestOnce(url, maxBytes, deadline);
    } catch (err) {
      if (err instanceof LinkError) throw err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOTFOUND" || code === "EAI_AGAIN") throw new LinkError("Could not find that website");
      throw new LinkError(`Could not load that link (${code ?? (err as Error).message})`);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.location;
      if (!loc) throw new LinkError(`The link redirected without a destination (${res.status})`);
      url = validateUrl(new URL(loc, url).toString());
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      throw new LinkError(`The link returned an error (HTTP ${res.status})`);
    }
    const contentType = String(res.headers["content-type"] ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    return { url: url.toString(), contentType: sniffType(res.body, contentType), buffer: res.body };
  }
  throw new LinkError("The link redirected too many times");
}

function sniffType(buf: Buffer, declared: string): string {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP")
    return "image/webp";
  if (buf.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("latin1");
    return brand.startsWith("avi") ? "image/avif" : "image/heic";
  }
  if (declared) return declared;
  const head = buf.subarray(0, 512).toString("utf8").toLowerCase();
  if (head.includes("<html") || head.includes("<!doctype html")) return "text/html";
  return "application/octet-stream";
}

// ---------- HTML handling ----------

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function extractVisibleText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/td|\/th)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 40_000);
}

export function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const add = (raw: string | undefined) => {
    if (!raw) return;
    const v = decodeEntities(raw.trim());
    if (!v || v.startsWith("data:")) return;
    try {
      const abs = new URL(v, baseUrl);
      if (abs.protocol === "http:" || abs.protocol === "https:") urls.push(abs.toString());
    } catch {
      /* ignore */
    }
  };
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["']og:image["'][^>]*>/gi)) {
    add(m[0].match(/content=["']([^"']+)["']/i)?.[1]);
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const srcset = tag.match(/\s(?:data-)?srcset=["']([^"']+)["']/i)?.[1];
    if (srcset) {
      // pick the last (usually largest) candidate
      const last = srcset.split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean).pop();
      add(last);
    }
    add(tag.match(/\s(?:data-src|data-lazy-src|data-original)=["']([^"']+)["']/i)?.[1]);
    add(tag.match(/\ssrc=["']([^"']+)["']/i)?.[1]);
  }
  return [...new Set(urls)].filter((u) => !/\.svg(\?|$)/i.test(u) && !/(logo|icon|sprite|favicon|avatar)/i.test(u));
}

// ---------- public API ----------

export type LinkContent =
  | { kind: "image"; url: string; buffer: Buffer; contentType: string }
  | { kind: "pdf"; url: string; buffer: Buffer }
  | { kind: "html"; url: string; text: string; images: { url: string; buffer: Buffer; contentType: string }[] };

/** Fetches a menu link and classifies it as image, PDF or HTML page. */
export async function fetchLink(rawUrl: string): Promise<LinkContent> {
  const res = await safeFetch(rawUrl);
  if (res.contentType.startsWith("image/")) {
    return { kind: "image", url: res.url, buffer: res.buffer, contentType: res.contentType };
  }
  if (res.contentType === "application/pdf") {
    return { kind: "pdf", url: res.url, buffer: res.buffer };
  }
  if (res.contentType.includes("html") || res.contentType.startsWith("text/")) {
    const html = res.buffer.toString("utf8");
    const text = res.contentType.includes("html") ? extractVisibleText(html) : html.slice(0, 40_000);
    const candidates = res.contentType.includes("html")
      ? extractImageUrls(html, res.url).slice(0, MAX_IMAGE_CANDIDATES)
      : [];
    const images: { url: string; buffer: Buffer; contentType: string }[] = [];
    // Fetch candidates a few at a time; keep only large ones.
    for (let i = 0; i < candidates.length && images.length < MAX_PAGE_IMAGES; i += 4) {
      const batch = await Promise.all(
        candidates.slice(i, i + 4).map(async (u) => {
          try {
            const img = await safeFetch(u, { maxBytes: 10 * 1024 * 1024 });
            if (!img.contentType.startsWith("image/")) return null;
            const size = await imageSize(img.buffer);
            if (!size || Math.max(size.width, size.height) < MIN_IMAGE_EDGE) return null;
            return { url: img.url, buffer: img.buffer, contentType: img.contentType };
          } catch {
            return null;
          }
        }),
      );
      for (const b of batch) if (b && images.length < MAX_PAGE_IMAGES) images.push(b);
    }
    return { kind: "html", url: res.url, text, images };
  }
  throw new LinkError(`That link isn't a menu page, image or PDF (${res.contentType || "unknown type"})`);
}
