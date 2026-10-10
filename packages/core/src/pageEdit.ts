/**
 * Seiten eines zusammengefügten PDFs bearbeiten: umsortieren, drehen, löschen.
 * Die Liste merkt sich nur, welche Originalseite wohin kommt und wie weit sie gedreht ist, das PDF selbst
 * baut die Web-App danach neu (apps/web/src/lib/pdfEdit.ts). Reine Funktionen, ändern die Eingabe nie.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface PageEdit {
  source: number; // Index der Seite im ursprünglichen PDF, ab 0
  rotation: Rotation; // zusätzlich zur Drehung der Seite selbst, im Uhrzeigersinn
}

/** Alle Seiten in Originalreihenfolge, ungedreht. */
export const initialPages = (count: number): PageEdit[] => Array.from({ length: Math.max(0, count) }, (_, i) => ({ source: i, rotation: 0 }));

/** Gradzahl auf 0, 90, 180 oder 270 bringen (auch negative und große Werte). */
export function normalizeRotation(degrees: number): Rotation {
  const r = ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
  return r as Rotation;
}

/** Seite i um 90 Grad im Uhrzeigersinn drehen. */
export function rotatePage(list: readonly PageEdit[], i: number): PageEdit[] {
  return list.map((p, j) => (j === i ? { ...p, rotation: normalizeRotation(p.rotation + 90) } : p));
}

/** Seite i um `by` Stellen verschieben (negativ nach vorn). Am Rand bleibt sie stehen. */
export function movePage(list: readonly PageEdit[], i: number, by: number): PageEdit[] {
  const to = Math.min(list.length - 1, Math.max(0, i + by));
  if (i < 0 || i >= list.length || to === i) return [...list];
  const next = [...list];
  const [page] = next.splice(i, 1);
  next.splice(to, 0, page);
  return next;
}

/** Seite i entfernen. */
export const removePage = (list: readonly PageEdit[], i: number): PageEdit[] => list.filter((_, j) => j !== i);

/** Ist alles noch so wie im Original (gleiche Reihenfolge, nichts gedreht oder gelöscht)? */
export function isUnchanged(list: readonly PageEdit[], originalCount: number): boolean {
  return list.length === originalCount && list.every((p, i) => p.source === i && p.rotation === 0);
}
