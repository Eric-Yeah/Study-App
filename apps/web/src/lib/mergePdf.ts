import { CONFIG, fitOnA4, fitWithin } from '@study/core';
import { decodeImage, type DecodedImage } from './decodeImage';

export interface MergedPdf {
  blob: Blob;
  pages: number;
}

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/** Foto als JPEG für das PDF: Ausrichtung übernehmen, längste Kante höchstens CONFIG.pdf.imageEdge, weißer Hintergrund. */
async function photoToJpeg(file: File): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  let bitmap: DecodedImage;
  try {
    bitmap = await decodeImage(file, { fromImage: true });
  } catch {
    throw new Error(`„${file.name}“ konnte nicht gelesen werden. Nimm ein JPEG, PNG oder eine PDF.`);
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, CONFIG.pdf.imageEdge);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Das Bild konnte nicht verarbeitet werden.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap.source, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Das Bild konnte nicht umgewandelt werden.'))), 'image/jpeg', CONFIG.pdf.imageQuality),
    );
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally {
    bitmap.close();
  }
}

/**
 * Fügt PDFs und Fotos in der Reihenfolge der Liste zu einem PDF zusammen, nur im Browser und ohne KI.
 * PDF-Seiten werden unverändert übernommen (Text bleibt Text), Fotos kommen auf eine A4-Seite.
 * pdf-lib wird erst hier nachgeladen.
 */
export async function mergeToPdf(files: File[], onProgress?: (done: number, total: number, name: string) => void): Promise<MergedPdf> {
  if (files.length === 0) throw new Error('Wähle zuerst Dateien aus.');
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i, files.length, file.name);
    if (isPdf(file)) {
      let source;
      try {
        source = await PDFDocument.load(await file.arrayBuffer());
      } catch {
        throw new Error(`„${file.name}“ konnte nicht gelesen werden. Ist die PDF beschädigt oder mit einem Passwort geschützt?`);
      }
      for (const page of await out.copyPages(source, source.getPageIndices())) out.addPage(page);
    } else if (file.type.startsWith('image/')) {
      const photo = await photoToJpeg(file);
      const image = await out.embedJpg(photo.bytes);
      const place = fitOnA4(photo.width, photo.height, CONFIG.pdf.a4);
      const page = out.addPage([place.pageWidth, place.pageHeight]);
      page.drawImage(image, { x: place.x, y: place.y, width: place.width, height: place.height });
    } else {
      throw new Error(`„${file.name}“ ist weder ein Bild noch eine PDF.`);
    }
    if (out.getPageCount() > CONFIG.pdf.maxPages) {
      throw new Error(`Das sind mehr als ${CONFIG.pdf.maxPages} Seiten. Füge weniger auf einmal zusammen.`);
    }
  }

  onProgress?.(files.length, files.length, 'Speichern');
  const bytes = await out.save({ useObjectStreams: true });
  if (bytes.byteLength > CONFIG.pdf.maxBytes) {
    throw new Error('Das PDF wäre größer als 30 MB. Füge weniger Seiten auf einmal zusammen.');
  }
  return { blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), pages: out.getPageCount() };
}
