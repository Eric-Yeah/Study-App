/**
 * Fehlstunden aus Lanis (Schulportal Hessen). Reine Funktionen ohne DOM.
 *
 * Quelle ist die Seite "Mein Unterricht" (meinunterricht.php): Dort steht eine Tabelle (id="anwesend") mit einer
 * Zeile pro Kurs und je einer Spalte pro Art der Fehlzeit (zum Beispiel "fehlend", "entschuldigt"; die Beschriftung
 * kommt von der Schule). Leere Zellen heißen 0. Das Format stammt aus der Bibliothek der Lanis-Entwickler (liblanis)
 * und ist hier tolerant gegenüber anderen Spalten, Reihenfolgen und fehlenden Zellen.
 */

export interface AbsenceCourse {
  course: string;
  /** Spaltenbeschriftung (klein geschrieben) zur Anzahl der Stunden */
  counts: Record<string, number>;
}

export interface AbsenceReport {
  courses: AbsenceCourse[];
  /** Summe über alle Kurse je Spaltenbeschriftung */
  totals: Record<string, number>;
}

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&auml;/g, 'ä')
    .replace(/&ouml;/g, 'ö')
    .replace(/&uuml;/g, 'ü')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/\s+/g, ' ')
    .trim();

/** Lanis versteckt in manchen Zellen kodierten Text (div.hidden_encoded), der nicht zum Wert gehört. */
const withoutHidden = (html: string) => html.replace(/<div\b[^>]*class="[^"]*\bhidden_encoded\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

/** Schneidet die Tabelle mit der Anwesenheit aus der Seite (id="anwesend"), sonst null. */
export function extractAbsenceTable(html: string): string | null {
  const at = html.search(/id=["']anwesend["']/i);
  if (at < 0) return null;
  const start = html.indexOf('<table', at) >= 0 && html.indexOf('<table', at) - at < 400 ? html.indexOf('<table', at) : html.lastIndexOf('<table', at);
  if (start < 0) return null;
  const end = html.indexOf('</table>', at);
  return end < 0 ? null : html.slice(start, end + '</table>'.length);
}

const num = (v: string) => {
  const m = /\d+/.exec(v);
  return m ? Number(m[0]) : 0;
};

/** Liest die Anwesenheitstabelle. Ohne lesbare Tabelle: null, mit Tabelle ohne Kurse: leerer Bericht. */
export function parseAbsences(tableHtml: string): AbsenceReport | null {
  if (!/<table\b/i.test(tableHtml)) return null;
  const head = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(tableHtml)?.[1] ?? /<tr\b[^>]*>([\s\S]*?)<\/tr>/i.exec(tableHtml)?.[1] ?? '';
  const keys = [...head.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => plain(withoutHidden(m[1])).toLowerCase());
  if (keys.length < 2) return null;
  const body = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(tableHtml)?.[1] ?? tableHtml.slice(tableHtml.indexOf('</tr>') + 5);

  const courses: AbsenceCourse[] = [];
  const totals: Record<string, number> = {};
  for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => plain(withoutHidden(m[1])));
    if (cells.length < 2) continue;
    const counts: Record<string, number> = {};
    let course = '';
    keys.forEach((key, i) => {
      if (i >= cells.length) return;
      if (key === 'kurs') course = cells[i];
      else if (key === 'lehrkraft' || key === 'lehrer' || key === '') return;
      else counts[key] = num(cells[i]);
    });
    if (!course) course = cells[0];
    if (Object.keys(counts).length === 0) continue;
    for (const [k, v] of Object.entries(counts)) totals[k] = (totals[k] ?? 0) + v;
    courses.push({ course, counts });
  }
  return { courses, totals };
}

export type AbsenceKind = 'unexcused' | 'excused' | 'late' | 'missing' | 'other';

/** Art einer Spalte nach ihrer Beschriftung. */
export function absenceKind(label: string): AbsenceKind {
  const s = label.toLowerCase();
  if (/unentschuldigt|unexcused/.test(s)) return 'unexcused';
  if (/versp|zu sp(ä|ae)t|late/.test(s)) return 'late';
  if (/entschuldigt|excused/.test(s)) return 'excused';
  if (/fehl|abwesen/.test(s)) return 'missing';
  return 'other';
}

/** Gibt es irgendwo eine eingetragene Fehlzeit? Nur dann zeigt die App etwas an. */
export function hasAbsences(report: AbsenceReport | null | undefined): boolean {
  return Boolean(report) && Object.values(report!.totals).some((n) => n > 0);
}

/** Summe der Stunden einer Art über alle Spalten (zum Beispiel alle unentschuldigten). */
export function totalOfKind(report: AbsenceReport, kind: AbsenceKind): number {
  return Object.entries(report.totals).reduce((sum, [label, n]) => sum + (absenceKind(label) === kind ? n : 0), 0);
}

/** Kurse mit Fehlzeiten, die meisten zuerst (nach der Summe aller Spalten). */
export function coursesWithAbsences(report: AbsenceReport): AbsenceCourse[] {
  const sum = (c: AbsenceCourse) => Object.values(c.counts).reduce((a, b) => a + b, 0);
  return report.courses.filter((c) => sum(c) > 0).sort((a, b) => sum(b) - sum(a) || a.course.localeCompare(b.course));
}
