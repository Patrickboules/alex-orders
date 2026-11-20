import type { NextRequest } from "next/server";
import { findAdminByToken } from "@/lib/data/admins";
import { getRestaurant, saveDraftMenu } from "@/lib/data/restaurants";
import { countItems, LinkError, parseMenu, PdfTooLongError } from "@/lib/parse";
import { uploadFile } from "@/lib/storage";
import type { ParseInput, ParsePageResult, SourceFile } from "@/lib/types";

export const maxDuration = 300;

const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|avif|gif)$/i;

type ParseResponse =
  | { ok: true; pages: ParsePageResult[]; itemCount: number }
  | { ok: false; error: string; pages?: ParsePageResult[] };

function fail(error: string, status: number, pages?: ParsePageResult[]) {
  return Response.json({ ok: false, error, ...(pages ? { pages } : {}) } satisfies ParseResponse, { status });
}

function isImage(f: File): boolean {
  return f.type.startsWith("image/") || ((!f.type || f.type === "application/octet-stream") && IMAGE_EXT.test(f.name));
}

function isPdf(f: File): boolean {
  return f.type === "application/pdf" || ((!f.type || f.type === "application/octet-stream") && /\.pdf$/i.test(f.name));
}

function guessImageType(f: File): string {
  if (f.type.startsWith("image/")) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "heic" || ext === "heif") return `image/${ext}`;
  return `image/${ext ?? "jpeg"}`;
}

export async function POST(request: NextRequest) {
  // ---- auth ----
  const token = request.cookies.get("admin_token")?.value;
  const admin = token ? await findAdminByToken(token) : null;
  if (!admin) return fail("Not signed in", 401);

  // ---- form ----
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected a multipart form upload", 400);
  }
  const restaurantId = String(form.get("restaurantId") ?? "").trim();
  const kind = String(form.get("kind") ?? "").trim();
  if (!restaurantId) return fail("Missing restaurant", 400);
  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) return fail("Restaurant not found", 404);

  const files = [...form.getAll("files"), ...form.getAll("files[]")].filter(
    (f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && f.size > 0,
  );

  let input: ParseInput;
  let uploads: { buffer: Buffer; name: string; type: string; source: SourceFile["type"] }[] = [];
  let linkSource: SourceFile | null = null;

  if (kind === "images") {
    if (files.length === 0) return fail("Choose at least one photo", 400);
    if (files.length > MAX_IMAGES) return fail(`You can upload at most ${MAX_IMAGES} photos`, 400);
    for (const f of files) {
      if (!isImage(f)) return fail(`"${f.name}" is not an image (use JPG, PNG, WEBP or HEIC)`, 400);
      if (f.size > MAX_IMAGE_BYTES) return fail(`"${f.name}" is too large (max 10 MB)`, 400);
    }
    uploads = await Promise.all(
      files.map(async (f) => ({
        buffer: Buffer.from(await f.arrayBuffer()),
        name: f.name,
        type: guessImageType(f),
        source: "image" as const,
      })),
    );
    input = {
      kind: "images",
      files: uploads.map((u) => ({ buffer: u.buffer, mimeType: u.type, name: u.name })),
    };
  } else if (kind === "pdf") {
    if (files.length !== 1) return fail("Choose one PDF file", 400);
    const f = files[0];
    if (!isPdf(f)) return fail(`"${f.name}" is not a PDF`, 400);
    if (f.size > MAX_PDF_BYTES) return fail(`"${f.name}" is too large (max 20 MB)`, 400);
    const buffer = Buffer.from(await f.arrayBuffer());
    uploads = [{ buffer, name: f.name, type: "application/pdf", source: "pdf" }];
    input = { kind: "pdf", file: { buffer, name: f.name } };
  } else if (kind === "link") {
    const url = String(form.get("url") ?? "").trim();
    if (!/^https?:\/\//i.test(url)) return fail("Enter a link starting with http:// or https://", 400);
    linkSource = { url, type: "link" };
    input = { kind: "link", url };
  } else {
    return fail("Unknown upload type", 400);
  }

  // ---- upload sources + parse in parallel ----
  try {
    const [sourceFiles, result] = await Promise.all([
      Promise.all(
        uploads.map(async (u) => ({ url: await uploadFile(u.buffer, u.name, u.type), type: u.source })),
      ),
      parseMenu(input),
    ]);
    const itemCount = countItems(result.menu);
    if (itemCount === 0) {
      return fail(
        result.pages.every((p) => !p.ok)
          ? "Could not read the menu. Try clearer photos or another file."
          : "No menu items were found.",
        422,
        result.pages,
      );
    }
    await saveDraftMenu(restaurantId, result.menu, linkSource ? [linkSource] : sourceFiles);
    return Response.json({ ok: true, pages: result.pages, itemCount } satisfies ParseResponse);
  } catch (err) {
    if (err instanceof LinkError || err instanceof PdfTooLongError) return fail(err.message, 400);
    const message = (err as Error).message ?? "";
    if (/Invalid PDF|InvalidPDF|PDF header/i.test(message)) return fail("That PDF could not be opened", 400);
    console.error("[api/parse] failed:", err);
    return fail("Parsing failed. Please try again.", 500);
  }
}
