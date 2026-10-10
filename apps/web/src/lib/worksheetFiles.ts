import { CONFIG, fitWithin, isBlankPage, needsOcr, splitKnownFiles, textKey } from '@study/core';
import { loadPdfjs } from './pdfjs';
import { resizeImage } from './resizeImage';

/** Eine Seite, bereit zum Hochladen: Text direkt, Bilder schon verkleinert. */
export type PreparedPage = { type: 'text'; text: string } | { type: 'image'; blob: Blob };

export interface Progress {
  done: number;
  total: number;
  label: string;
}

/** Was vor dem Hochladen aussortiert wurde, damit nichts doppelt oder für nichts bezahlt wird. */
export interface Skipped {
  files: number;
  blank: number;
  duplicate: number;
}

export interface Prepared {
  pages: PreparedPage[];
  fileHashes: string[]; // Hashes der verarbeiteten Dateien, werden an der Notiz gespeichert
  skipped: Skipped;
}

/** SHA-256 als Hex. Gibt null zurück, wenn der Browser es nicht kann (zum Beispiel ohne https), dann wird nicht aussortiert. */
async function sha256(data: Blob): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await crypto.subtle.digest('SHA-256', await data.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** Ist das Bild praktisch leer? Bei jedem Fehler gilt es als nicht leer, damit nie eine beschriebene Seite verloren geht. */
async function isBlankImage(blob: Blob): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, CONFIG.ai.blankGridEdge);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return false;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      const { data } = ctx.getImageData(0, 0, width, height);
      const gray = new Uint8Array(width * height);
      for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      return isBlankPage(gray, { delta: CONFIG.ai.blankInkDelta, maxInkShare: CONFIG.ai.blankInkShare });
    } finally {
      bitmap.close();
    }
  } catch {
    return false;
  }
}

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/**
 * Liest eine PDF seitenweise. Hat eine Seite genug Text (CONFIG.ai.minCharsPerPage), bleibt sie Text.
 * Sonst (Scan, Foto im PDF) wird sie als Bild gerendert und durch resizeImage geschickt.
 * pdfjs-dist wird erst hier nachgeladen, damit die App sonst klein bleibt.
 */
async function readPdf(file: File, onPage: (page: number, pages: number) => void): Promise<PreparedPage[]> {
  const pdfjs = await loadPdfjs();

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    if (doc.numPages > CONFIG.ai.maxPagesPerUpload) {
      throw new Error(`„${file.name}“ hat ${doc.numPages} Seiten. Pro Upload sind höchstens ${CONFIG.ai.maxPagesPerUpload} Seiten erlaubt.`);
    }
    const pages: PreparedPage[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      onPage(i, doc.numPages);
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
      if (!needsOcr(text, CONFIG.ai.minCharsPerPage)) {
        pages.push({ type: 'text', text: text.replace(/[ \t]+/g, ' ').trim() });
      } else {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(CONFIG.ai.maxEdge / Math.max(base.width, base.height), 3);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        const png = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Eine PDF-Seite konnte nicht gerendert werden.'))), 'image/png'),
        );
        pages.push({ type: 'image', blob: await resizeImage(png) });
      }
      page.cleanup();
    }
    return pages;
  } finally {
    void task.destroy();
  }
}

/**
 * Bereitet die gewählten Dateien vor (Bilder verkleinern, PDFs lesen) und sortiert aus, was nichts bringt:
 * Dateien, die schon in einer Notiz stecken (`known` sind deren Hashes), leere Seiten und gleiche Seiten.
 * Hochgeladen wird erst danach.
 */
export async function preparePages(files: File[], known: Iterable<string>, onProgress: (p: Progress) => void): Promise<Prepared> {
  const skipped: Skipped = { files: 0, blank: 0, duplicate: 0 };
  onProgress({ done: 0, total: files.length, label: 'Dateien prüfen' });
  const hashed = await Promise.all(files.map(async (file) => ({ file, name: file.name, hash: await sha256(file) })));
  const { fresh, skipped: knownFiles } = splitKnownFiles(hashed, known);
  skipped.files = knownFiles.length;

  const out: PreparedPage[] = [];
  const seenText = new Set<string>();
  const seenImages = new Set<string>();

  // Leere und gleiche Seiten fallen hier heraus. Text ist nie leer (mindestens CONFIG.ai.minCharsPerPage Zeichen).
  const keep = async (page: PreparedPage) => {
    if (page.type === 'text') {
      const key = textKey(page.text);
      if (seenText.has(key)) return void skipped.duplicate++;
      seenText.add(key);
    } else {
      if (await isBlankImage(page.blob)) return void skipped.blank++;
      const hash = await sha256(page.blob);
      if (hash && seenImages.has(hash)) return void skipped.duplicate++;
      if (hash) seenImages.add(hash);
    }
    out.push(page);
    if (out.length > CONFIG.ai.maxPagesPerUpload) {
      throw new Error(`Das sind mehr als ${CONFIG.ai.maxPagesPerUpload} Seiten. Lade weniger auf einmal hoch.`);
    }
  };

  for (let i = 0; i < fresh.length; i++) {
    const { file } = fresh[i];
    const total = fresh.length;
    onProgress({ done: i, total, label: file.name });
    if (isPdf(file)) {
      const pages = await readPdf(file, (p, n) => onProgress({ done: i, total, label: `${file.name} (Seite ${p} von ${n})` }));
      for (const page of pages) await keep(page);
    } else if (file.type.startsWith('image/')) {
      await keep({ type: 'image', blob: await resizeImage(file) });
    } else {
      throw new Error(`„${file.name}“ ist weder ein Bild noch eine PDF.`);
    }
  }
  onProgress({ done: fresh.length, total: fresh.length, label: 'Dateien vorbereitet' });
  return { pages: out, fileHashes: fresh.flatMap((f) => (f.hash ? [f.hash] : [])), skipped };
}
