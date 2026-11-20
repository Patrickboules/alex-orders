// Menu parsing pipeline: input (images / PDF / link) -> pages -> NVIDIA model -> merged Menu.
// Not marked "server-only" so scripts/try-parse.ts can run it from the CLI;
// it is only ever imported by server code in the app.

import { nanoid } from "nanoid";
import { z } from "zod";
import type { Menu, MenuCategory, MenuItem, ParseInput, ParsePageResult, ParseResult } from "../types";
import { prepareImage } from "./images";
import { fetchLink, LinkError } from "./link";
import { callMenuModel, extractJson } from "./nvidia";
import { renderPdf } from "./pdf";

export { LinkError } from "./link";
export { PdfTooLongError, MAX_PDF_PAGES } from "./pdf";

const CONCURRENCY = 4;
const READ_ERROR = "Could not read";

// ---------- model output schema (lenient, prices in EGP) ----------

const priceSchema = z.preprocess((v) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const western = v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
    const m = western.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : 0;
  }
  return 0;
}, z.number().finite().nonnegative().max(1_000_000));

const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined));

const rawVariantSchema = z.object({
  name: z.coerce.string(),
  price: priceSchema.optional().default(0),
});

const rawItemSchema = z.object({
  name: z.coerce.string(),
  description: optionalText,
  price: priceSchema.optional().nullable(),
  variants: z.array(rawVariantSchema).nullable().optional(),
});

const rawCategorySchema = z.object({
  name: z.coerce.string().optional().default("Menu"),
  items: z.array(rawItemSchema).default([]),
});

export const rawMenuSchema = z.object({
  categories: z.array(rawCategorySchema),
});

export type RawMenu = z.infer<typeof rawMenuSchema>;

// ---------- pages ----------

interface PageJob {
  page: number; // 1-based
  images: string[]; // data URLs
  text?: string;
  error?: string; // pre-failed (e.g. undecodable image)
}

async function imageJob(page: number, buffer: Buffer | Uint8Array, text?: string): Promise<PageJob> {
  try {
    const img = await prepareImage(buffer);
    return { page, images: [img.dataUrl], text };
  } catch {
    if (text && text.trim().length > 20) return { page, images: [], text };
    return { page, images: [], error: READ_ERROR };
  }
}

async function buildJobs(input: ParseInput): Promise<PageJob[]> {
  switch (input.kind) {
    case "images":
      return Promise.all(input.files.map((f, i) => imageJob(i + 1, f.buffer)));
    case "pdf":
      return pdfJobs(input.file.buffer);
    case "link": {
      const content = await fetchLink(input.url);
      if (content.kind === "image") return [await imageJob(1, content.buffer)];
      if (content.kind === "pdf") return pdfJobs(content.buffer);
      const jobs: PageJob[] = [];
      if (content.text.trim().length > 30) jobs.push({ page: 1, images: [], text: content.text });
      for (const img of content.images) jobs.push(await imageJob(jobs.length + 1, img.buffer));
      if (jobs.length === 0) throw new LinkError("That page has no readable menu text or images");
      return jobs;
    }
  }
}

async function pdfJobs(buffer: Buffer | Uint8Array): Promise<PageJob[]> {
  const pdf = await renderPdf(buffer);
  return Promise.all(
    pdf.pages.map((p) => {
      if (p.image) return imageJob(p.page, p.image, p.text || undefined);
      if (p.text.length > 20) return Promise.resolve<PageJob>({ page: p.page, images: [], text: p.text });
      return Promise.resolve<PageJob>({ page: p.page, images: [], error: READ_ERROR });
    }),
  );
}

// ---------- model call with validation + one retry ----------

async function readPage(job: PageJob): Promise<RawMenu> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = await callMenuModel({
        images: job.images,
        text: job.text,
        extraInstruction:
          attempt > 0
            ? "Your previous answer was not valid JSON in the required shape. Reply with ONLY the JSON object, starting with { and ending with }."
            : undefined,
      });
      return rawMenuSchema.parse(extractJson(content));
    } catch (err) {
      lastError = err;
      if (/\b429\b/.test(String((err as Error).message))) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastError;
}

async function runPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------- merge + normalize ----------

const toPiasters = (egp: number) => Math.round(egp * 100);

function normalizeItem(raw: RawMenu["categories"][number]["items"][number]): MenuItem | null {
  const name = raw.name.trim();
  if (!name) return null;
  const variants = (raw.variants ?? [])
    .map((v) => ({ id: nanoid(), name: v.name.trim(), price: toPiasters(v.price) }))
    .filter((v) => v.name);
  let price = raw.price != null && raw.price > 0 ? toPiasters(raw.price) : 0;
  if (price === 0 && variants.length > 0) price = variants[0].price;
  const item: MenuItem = { id: nanoid(), name, price };
  if (raw.description) item.description = raw.description;
  if (variants.length > 0) item.variants = variants;
  return item;
}

export function mergeMenus(menus: RawMenu[]): Menu {
  const byName = new Map<string, MenuCategory>();
  const seenItems = new Map<string, Set<string>>();
  for (const menu of menus) {
    for (const cat of menu.categories) {
      const catName = cat.name.trim() || "Menu";
      const key = catName.toLocaleLowerCase();
      let target = byName.get(key);
      if (!target) {
        target = { id: nanoid(), name: catName, items: [] };
        byName.set(key, target);
        seenItems.set(key, new Set());
      }
      const seen = seenItems.get(key)!;
      for (const rawItem of cat.items) {
        const item = normalizeItem(rawItem);
        if (!item) continue;
        const dedupeKey = `${item.name.toLocaleLowerCase()}|${item.price}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        target.items.push(item);
      }
    }
  }
  return { categories: [...byName.values()].filter((c) => c.items.length > 0) };
}

// ---------- entry point ----------

export async function parseMenu(
  input: ParseInput,
  onProgress?: (done: number, total: number) => void,
): Promise<ParseResult> {
  const jobs = await buildJobs(input);
  const total = jobs.length;
  let done = 0;
  onProgress?.(0, total);

  const outcomes = await runPool(jobs, CONCURRENCY, async (job) => {
    let result: { menu?: RawMenu; page: ParsePageResult };
    if (job.error) {
      result = { page: { page: job.page, ok: false, error: job.error } };
    } else {
      try {
        const menu = await readPage(job);
        result = { menu, page: { page: job.page, ok: true } };
      } catch (err) {
        if (process.env.NODE_ENV !== "production" || process.env.PARSE_DEBUG) {
          console.error(`[parse] page ${job.page} failed:`, (err as Error).message);
        }
        result = { page: { page: job.page, ok: false, error: READ_ERROR } };
      }
    }
    done++;
    onProgress?.(done, total);
    return result;
  });

  const menu = mergeMenus(outcomes.flatMap((o) => (o.menu ? [o.menu] : [])));
  return { menu, pages: outcomes.map((o) => o.page) };
}

export function countItems(menu: Menu): number {
  return menu.categories.reduce((n, c) => n + c.items.length, 0);
}
