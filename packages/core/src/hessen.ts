/**
 * Notenpunkte und Noten (Hessen). Die Regeln der Gesamtqualifikation (Block I und II, Defizite, Einbringung) stehen
 * seit dem Abiturrechner in abitur.ts, ihre Zahlen in CONFIG.abitur (OAVO Fassung 2025, geprüft am 10.10.2026
 * gegen die Schulinformationen 2026; die Broschüre "Abitur in Hessen" von 2021 ist veraltet).
 */

export function pointsToGrade(points: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (points >= 13) return 1;
  if (points >= 10) return 2;
  if (points >= 7) return 3;
  if (points >= 4) return 4;
  if (points >= 1) return 5;
  return 6;
}

/** Notenpunkte als Note mit Tendenz: 15 ist 1+, 14 ist 1, 13 ist 1-, ... 1 ist 5-, 0 ist 6. */
export function pointsLabel(points: number): string {
  const p = Math.max(0, Math.min(15, Math.round(points)));
  if (p === 0) return '6';
  const grade = pointsToGrade(p);
  const tendency = (p - 1) % 3; // 2: plus, 1: ohne, 0: minus
  return `${grade}${tendency === 2 ? '+' : tendency === 0 ? '-' : ''}`;
}
