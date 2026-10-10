import { CONFIG } from '@study/core';
import { downloadDocument } from './worksheetApi';

/**
 * Fügt mehrere gespeicherte PDFs in der gegebenen Reihenfolge zu einem Lernordner zusammen. Die PDFs werden
 * nacheinander geladen und kopiert, nie alle gleichzeitig im Speicher. Nur im Browser.
 */
export async function buildFolder(paths: string[], onProgress?: (done: number, total: number) => void): Promise<{ blob: Blob; pages: number }> {
  if (paths.length === 0) throw new Error('Es gibt keine PDFs zum Zusammenfügen.');
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  for (let i = 0; i < paths.length; i++) {
    onProgress?.(i, paths.length);
    const source = await PDFDocument.load(await (await downloadDocument(paths[i])).arrayBuffer());
    for (const page of await out.copyPages(source, source.getPageIndices())) out.addPage(page);
    if (out.getPageCount() > CONFIG.pdf.folderMaxPages) {
      throw new Error(`Das wären mehr als ${CONFIG.pdf.folderMaxPages} Seiten. Wähle ein Fach oder eine Q-Phase aus, damit der Ordner kleiner wird.`);
    }
  }
  onProgress?.(paths.length, paths.length);
  const bytes = await out.save({ useObjectStreams: true });
  return { blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), pages: out.getPageCount() };
}

/** Speichert ein PDF unter dem Dateinamen (Download). */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
