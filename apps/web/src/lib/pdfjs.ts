/**
 * pdfjs-dist mit Worker, erst bei Bedarf nachgeladen, damit die App sonst klein bleibt.
 * Es ist die Legacy-Fassung: Die normale braucht neue Browser-Funktionen (zum Beispiel Map.getOrInsertComputed). Wo sie fehlen,
 * scheiterte das Rendern gescannter Seiten mit "… is not a function". Die Legacy-Fassung bringt die Ersatzfunktionen mit.
 */
export async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return pdfjs;
}
