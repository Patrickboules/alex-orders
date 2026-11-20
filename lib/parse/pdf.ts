import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";
import { MAX_EDGE } from "./images";

export const MAX_PDF_PAGES = 15;

export interface PdfPage {
  page: number; // 1-based
  image?: Buffer; // PNG; undefined if rendering failed
  text: string; // text layer ('' when the PDF is scanned)
  error?: string;
}

export interface RenderedPdf {
  totalPages: number;
  pages: PdfPage[];
}

export class PdfTooLongError extends Error {
  constructor(public pages: number) {
    super(`PDF has ${pages} pages; the maximum is ${MAX_PDF_PAGES}`);
  }
}

/**
 * Renders up to 15 pages of a PDF to PNG (long edge ~1600px) and extracts each
 * page's text layer. Throws PdfTooLongError for longer PDFs and a generic error
 * if the file is not a readable PDF.
 */
export async function renderPdf(buffer: Buffer | Uint8Array): Promise<RenderedPdf> {
  // pdf.js may transfer/detach the buffer it gets, so always pass a copy.
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  try {
    const totalPages = pdf.numPages;
    if (totalPages > MAX_PDF_PAGES) throw new PdfTooLongError(totalPages);

    let texts: string[] = [];
    try {
      texts = (await extractText(pdf, { mergePages: false })).text;
    } catch {
      texts = [];
    }

    const pages: PdfPage[] = [];
    for (let n = 1; n <= totalPages; n++) {
      const text = (texts[n - 1] ?? "").trim();
      try {
        const page = await pdf.getPage(n);
        const vp = page.getViewport({ scale: 1 });
        const longEdge = Math.max(vp.width, vp.height) || MAX_EDGE;
        const scale = Math.min(4, MAX_EDGE / longEdge);
        const png = await renderPageAsImage(pdf, n, {
          scale,
          canvasImport: () => import("@napi-rs/canvas"),
        });
        pages.push({ page: n, image: Buffer.from(png), text });
      } catch (err) {
        pages.push({ page: n, text, error: (err as Error).message });
      }
    }
    return { totalPages, pages };
  } finally {
    await pdf.loadingTask.destroy().catch(() => {});
  }
}
