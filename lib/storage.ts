import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";

/** Keeps letters, digits, dot, dash, underscore; collapses the rest. */
export function safeFilename(filename: string): string {
  const base = path.basename(filename || "file").normalize("NFKD");
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|-+$/g, "")
    .slice(-80);
  return cleaned || "file";
}

/**
 * Stores a file and returns its public URL. Uses Vercel Blob when
 * BLOB_READ_WRITE_TOKEN is set; otherwise writes to public/uploads/ (dev fallback).
 */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<string> {
  const name = `${nanoid(12)}-${safeFilename(filename)}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`uploads/${name}`, buffer, {
      access: "public",
      contentType: contentType || undefined,
      addRandomSuffix: false,
    });
    return blob.url;
  }

  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buffer);
  return `/uploads/${name}`;
}
