/**
 * Vorbereitung im Browser, bevor etwas an die KI geht: bekannte Dateien und leere Seiten aussortieren.
 * Reine Funktionen, die Pixel und Hashes liefert die Web-App (apps/web/src/lib/worksheetFiles.ts).
 * Nicht für die Edge Function gedacht, darum nicht in supabase/functions/_shared.
 */

/** Anteil der Pixel, die um mehr als `delta` dunkler sind als der Hintergrund (90-%-Wert der Helligkeit). */
export function inkShare(gray: ArrayLike<number>, delta: number): number {
  const n = gray.length;
  if (n === 0) return 0;
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < n; i++) histogram[Math.min(255, Math.max(0, Math.round(gray[i])))]++;
  // Hintergrund: Helligkeit, unter der 90 % der Pixel liegen. Weißes Papier mit etwas Schrift ergibt hier Weiß.
  let seen = 0;
  let background = 255;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v];
    if (seen >= n * 0.9) {
      background = v;
      break;
    }
  }
  let ink = 0;
  for (let v = 0; v < 256; v++) if (v < background - delta) ink += histogram[v];
  return ink / n;
}

/** Ist die Seite praktisch leer? Im Zweifel nein: lieber eine leere Seite zu viel als eine beschriebene verlieren. */
export function isBlankPage(gray: ArrayLike<number>, opts: { delta: number; maxInkShare: number }): boolean {
  return gray.length > 0 && inkShare(gray, opts.delta) < opts.maxInkShare;
}

export interface HashedFile {
  name: string;
  hash: string | null; // null: Hash war nicht möglich, die Datei wird immer verarbeitet
}

/**
 * Trennt Dateien in neue und schon bekannte. Bekannt heißt: gleicher Hash wie eine Datei einer vorhandenen Notiz
 * oder wie eine frühere Datei derselben Auswahl. Die Reihenfolge der neuen Dateien bleibt erhalten.
 */
export function splitKnownFiles<T extends HashedFile>(files: readonly T[], known: Iterable<string>): { fresh: T[]; skipped: T[] } {
  const seen = new Set(known);
  const fresh: T[] = [];
  const skipped: T[] = [];
  for (const f of files) {
    if (f.hash && seen.has(f.hash)) {
      skipped.push(f);
      continue;
    }
    if (f.hash) seen.add(f.hash);
    fresh.push(f);
  }
  return { fresh, skipped };
}

/** Schlüssel für gleichen Text auf zwei Seiten: Groß- und Kleinschreibung und Leerraum zählen nicht. */
export const textKey = (text: string): string => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** Sagt in einem Satz, was aussortiert wurde. Leer, wenn nichts aussortiert wurde. */
export function skippedSummary(s: { files: number; blank: number; duplicate: number }): string {
  const parts: string[] = [];
  if (s.files > 0) parts.push(s.files === 1 ? '1 Datei war schon hochgeladen' : `${s.files} Dateien waren schon hochgeladen`);
  if (s.blank > 0) parts.push(s.blank === 1 ? '1 leere Seite' : `${s.blank} leere Seiten`);
  if (s.duplicate > 0) parts.push(s.duplicate === 1 ? '1 doppelte Seite' : `${s.duplicate} doppelte Seiten`);
  return parts.length === 0 ? '' : `Aussortiert, damit nichts doppelt bezahlt wird: ${parts.join(', ')}.`;
}
