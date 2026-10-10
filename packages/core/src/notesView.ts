/**
 * Notizen für die Anzeige ordnen: nach Woche und Tag, neu zuerst. Reine Funktionen ohne UI.
 * Daten sind ISO-Strings (JJJJ-MM-TT), gerechnet wird in UTC, damit Sommerzeit nichts verschiebt.
 */

export interface DatedNote {
  lessonDate: string;
  createdAt?: string | null;
}

export interface NoteDay<T> {
  date: string;
  notes: T[];
}

export interface NoteWeek<T> {
  start: string; // Montag
  end: string; // Sonntag
  weeksAgo: number; // 0 = diese Woche, 1 = letzte Woche
  kw: number; // Kalenderwoche nach ISO 8601
  count: number;
  days: NoteDay<T>[];
}

const DAY = 86_400_000;
const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Montag der Woche, in der das Datum liegt. */
export function weekStart(date: string): string {
  const t = utc(date);
  const weekday = (new Date(t).getUTCDay() + 6) % 7; // Montag = 0
  return iso(t - weekday * DAY);
}

/** Kalenderwoche nach ISO 8601 (die Woche mit dem ersten Donnerstag des Jahres ist KW 1). */
export function isoWeek(date: string): number {
  const thursday = utc(weekStart(date)) + 3 * DAY;
  const yearStart = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1);
  return Math.floor((thursday - yearStart) / (7 * DAY)) + 1;
}

/** Notizen nach Woche und Tag, neueste zuerst. Innerhalb eines Tages zuletzt angelegte zuerst. */
export function groupNotesByWeek<T extends DatedNote>(notes: readonly T[], today: string): NoteWeek<T>[] {
  const sorted = [...notes].sort((a, b) => b.lessonDate.localeCompare(a.lessonDate) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const thisWeek = utc(weekStart(today));
  const weeks: NoteWeek<T>[] = [];
  for (const note of sorted) {
    const start = weekStart(note.lessonDate);
    let week = weeks[weeks.length - 1];
    if (!week || week.start !== start) {
      week = {
        start,
        end: iso(utc(start) + 6 * DAY),
        weeksAgo: Math.max(0, Math.round((thisWeek - utc(start)) / (7 * DAY))),
        kw: isoWeek(start),
        count: 0,
        days: [],
      };
      weeks.push(week);
    }
    let day = week.days[week.days.length - 1];
    if (!day || day.date !== note.lessonDate) {
      day = { date: note.lessonDate, notes: [] };
      week.days.push(day);
    }
    day.notes.push(note);
    week.count++;
  }
  return weeks;
}
