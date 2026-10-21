import { CONFIG, fitWithin } from '@study/core';
import { decodeImage } from './decodeImage';

/**
 * Verkleinert ein Bild für die KI: Ausrichtung aus den Bilddaten übernehmen (Fotos vom iPad und Handy),
 * längste Kante höchstens CONFIG.ai.maxEdge, nie vergrößern, als JPEG mit CONFIG.ai.jpegQuality.
 * Transparente Flächen werden weiß, sonst würden sie in JPEG schwarz.
 */
export async function resizeImage(
  file: Blob,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<Blob> {
  const maxEdge = opts.maxEdge ?? CONFIG.ai.maxEdge;
  const quality = opts.quality ?? CONFIG.ai.jpegQuality;
  const bitmap = await decodeImage(file, { fromImage: true });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Das Bild konnte nicht verarbeitet werden.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap.source, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Das Bild konnte nicht umgewandelt werden.'))), 'image/jpeg', quality),
    );
  } finally {
    bitmap.close();
  }
}
