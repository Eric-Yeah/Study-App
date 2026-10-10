/** pdfjs-dist mit Worker, erst bei Bedarf nachgeladen, damit die App sonst klein bleibt. */
export async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return pdfjs;
}
