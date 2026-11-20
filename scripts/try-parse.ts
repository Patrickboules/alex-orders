// Try the menu parser from the command line.
//   npx tsx --env-file=.env scripts/try-parse.ts <image|pdf path, several images, or URL>
// Prints the parsed menu JSON (prices in piasters) and per-page results.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { countItems, parseMenu } from "../lib/parse";
import type { ParseInput } from "../lib/types";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".avif": "image/avif",
};

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: npx tsx --env-file=.env scripts/try-parse.ts <path-or-url> [more images...]");
    process.exit(1);
  }

  let input: ParseInput;
  if (/^https?:\/\//i.test(args[0])) {
    input = { kind: "link", url: args[0] };
  } else if (args.length === 1 && path.extname(args[0]).toLowerCase() === ".pdf") {
    input = { kind: "pdf", file: { buffer: await readFile(args[0]), name: path.basename(args[0]) } };
  } else {
    input = {
      kind: "images",
      files: await Promise.all(
        args.map(async (p) => ({
          buffer: await readFile(p),
          mimeType: MIME[path.extname(p).toLowerCase()] ?? "application/octet-stream",
          name: path.basename(p),
        })),
      ),
    };
  }

  const started = Date.now();
  const result = await parseMenu(input, (done, total) => {
    process.stderr.write(`progress: ${done}/${total} (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(JSON.stringify(result.menu, null, 2));
  console.log("\nPages:", JSON.stringify(result.pages));
  console.log(
    `Categories: ${result.menu.categories.length}, items: ${countItems(result.menu)}, time: ${seconds}s`,
  );
}

main().catch((err) => {
  console.error("Parse failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
