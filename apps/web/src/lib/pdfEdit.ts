import type { PageEdit } from '@study/core';
import { loadPdfjs } from './pdfjs';

/** Baut aus dem PDF ein neues mit den bearbeiteten Seiten (Reihenfolge, Drehung, ohne gelöschte). Nur im Browser. */
export async function applyPageEdits(pdf: Blob, edits: readonly PageEdit[]): Promise<Blob> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const source = await PDFDocument.load(await pdf.arrayBuffer());
  const out = await PDFDocument.create();
  const pages = await out.copyPages(source, edits.map((e) => e.source));
  pages.forEach((page, i) => {
    if (edits[i].rotation) page.setRotation(degrees((page.getRotation().angle + edits[i].rotation) % 360));
    out.addPage(page);
  });
  const bytes = await out.save({ useObjectStreams: true });
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/**
 * Kleine Vorschaubilder aller Seiten (JPEG als Data-URL), eine nach der anderen. `onThumb` wird nach jeder Seite
 * aufgerufen, damit die Anzeige schon während des Renderns wächst. `cancelled` bricht ab, wenn die Ansicht weg ist.
 */
export async function renderThumbnails(
  pdf: Blob,
  width: number,
  onThumb: (index: number, url: string) => void,
  cancelled: () => boolean,
): Promise<number> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
  const doc = await task.promise;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      if (cancelled()) break;
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      onThumb(i - 1, canvas.toDataURL('image/jpeg', 0.6));
      page.cleanup();
    }
    return doc.numPages;
  } finally {
    void task.destroy();
  }
}
