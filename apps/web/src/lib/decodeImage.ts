/**
 * Bild aus einer Datei lesen, mit Rückfall für ältere Browser: createImageBitmap gibt es nicht überall, und manche kennen die
 * Option imageOrientation nicht. Dann wird ein img-Element benutzt (das übernimmt die Ausrichtung aus den Bilddaten selbst).
 */
export interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

function viaImageElement(file: Blob): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Das Bild konnte nicht gelesen werden.'));
    };
    img.src = url;
  });
}

export async function decodeImage(file: Blob, opts: { fromImage?: boolean } = {}): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const wrap = (b: ImageBitmap): DecodedImage => ({ source: b, width: b.width, height: b.height, close: () => b.close() });
    try {
      return wrap(await (opts.fromImage ? createImageBitmap(file, { imageOrientation: 'from-image' }) : createImageBitmap(file)));
    } catch {
      /* Option oder Format nicht unterstützt: nächster Weg */
    }
    if (opts.fromImage) {
      try {
        return wrap(await createImageBitmap(file));
      } catch {
        /* weiter mit img */
      }
    }
  }
  return viaImageElement(file);
}
