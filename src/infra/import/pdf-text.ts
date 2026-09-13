import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

type TextItem = {
  str?: string;
  transform?: number[];
  hasEOL?: boolean;
};

/**
 * Extract PDF text in content-stream order (similar to `pdftotext -raw`).
 * Spatial Y-sorting breaks multi-column bank statements like Mercado Pago.
 */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(data) }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let buf = "";
    let lastY: number | null = null;

    for (const raw of content.items) {
      const item = raw as TextItem;
      if (!item.str) continue;
      const y: number | null = item.transform ? Math.round(item.transform[5]) : lastY;
      const gap = lastY !== null && y !== null ? Math.abs(y - lastY) : 0;
      if ((lastY !== null && gap > 2) || item.hasEOL) {
        if (buf.trim()) lines.push(collapseSpaces(buf));
        buf = "";
      } else if (buf && needsSpace(buf, item.str)) {
        buf += " ";
      }
      buf += item.str;
      if (y !== null) lastY = y;
    }
    if (buf.trim()) lines.push(collapseSpaces(buf));
    pages.push(lines.join("\n"));
  }

  return pages.join("\n");
}

function collapseSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function needsSpace(prev: string, next: string) {
  if (!prev || !next) return false;
  if (/\s$/.test(prev) || /^\s/.test(next)) return false;
  if (/^[.,;:!?)\]%]/.test(next)) return false;
  return true;
}
