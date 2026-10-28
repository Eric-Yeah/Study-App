import { addDays } from './schedule';
import { dueDateFor, nextLessonDay } from './homework';
import { LANIS_SUBJECT_NAMES, matchSubject } from './lanis';
import { weekdayIndex, type Timetable } from './lanisPlans';

/**
 * Hausaufgaben von Hand eintragen, in einer Zeile. Reine Funktionen ohne DOM.
 *
 * Eigene Hausaufgaben sind gewöhnliche Aufgaben (Tabelle tasks), erkennbar am Schlüssel `own:ID` in `externalId`
 * (so braucht es keine Migration, und die Abgleiche mit Lanis, die nur `KURS:EINTRAG` kennen, fassen sie nie an).
 */

export const OWN_PREFIX = 'own:';
export const ownKey = (id: string) => `${OWN_PREFIX}${id}`;
export const isOwnHomework = (task: { externalId?: string | null }) => typeof task.externalId === 'string' && task.externalId.startsWith(OWN_PREFIX);

const WEEKDAYS: Record<string, number> = {
  mo: 0, montag: 0,
  di: 1, dienstag: 1,
  mi: 2, mittwoch: 2,
  do: 3, donnerstag: 3,
  fr: 4, freitag: 4,
  sa: 5, samstag: 5,
  so: 6, sonntag: 6,
};

/** Übliche Kürzel von Hand, die nicht Lanis-Kürzel sind: auf das Lanis-Kürzel abgebildet. */
const ALIASES: Record<string, string> = { ma: 'm', en: 'e', fr: 'f', la: 'l', ge: 'g' };

export interface HomeworkEntry {
  /** Text ohne Fach und Fristangabe ("Mathe S. 45 Nr. 3 bis Freitag" wird "S. 45 Nr. 3") */
  title: string;
  subjectId: string | null;
  /** ausdrücklich genannter Abgabetag, sonst null (dann gilt die nächste Stunde des Fachs) */
  due: string | null;
}

const clean = (s: string) =>
  s
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, '')
    .trim();

/** Nächster Tag mit diesem Wochentag, echt nach heute. */
function nextWeekday(today: string, weekday: number): string {
  const diff = ((weekday - weekdayIndex(today) + 7) % 7) || 7;
  return addDays(today, diff);
}

/** "12.11." oder "12.11.2026" oder "12.11.26": das nächste solche Datum ab heute. Null bei ungültigem Datum. */
function dateFrom(today: string, day: number, month: number, year: string | undefined): string | null {
  const [ty] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const make = (y: number) => {
    const iso = `${y}-${pad(month)}-${pad(day)}`;
    const d = new Date(`${iso}T12:00:00Z`);
    return d.getUTCMonth() + 1 === month && d.getUTCDate() === day ? iso : null;
  };
  if (year) return make(year.length === 2 ? 2000 + Number(year) : Number(year));
  const thisYear = make(ty);
  if (thisYear && thisYear >= today) return thisYear;
  return make(ty + 1);
}

/** Fach am Anfang des Textes: voller Name ("Mathe", "Englisch"), Anfang davon ab drei Buchstaben oder Lanis-Kürzel ("Ph", "Spo"). */
function leadingSubject(words: string[], subjects: { id: string; name: string }[]): { id: string; used: number } | null {
  const first = words[0]?.toLowerCase().replace(/[.,:;]+$/, '');
  if (!first) return null;
  const exact = subjects.find((s) => s.name.trim().toLowerCase() === first);
  if (exact) return { id: exact.id, used: 1 };
  if (first.length >= 3) {
    const loose = subjects.find((s) => {
      const n = s.name.trim().toLowerCase();
      return n.startsWith(first) || (first.length >= 4 && first.startsWith(n) && n.length >= 3);
    });
    if (loose) return { id: loose.id, used: 1 };
  }
  const abbr = ALIASES[first] ?? first;
  if (abbr in LANIS_SUBJECT_NAMES && first.length >= 2) {
    const id = matchSubject(abbr, subjects);
    if (id) return { id, used: 1 };
  }
  return null;
}

/**
 * Liest eine eingetippte Zeile: Fach am Anfang, Frist am Ende oder nach "bis/für/zum/am" ("bis Freitag", "bis morgen", "12.11.", "nächste Stunde").
 * Was nicht erkannt wird, bleibt im Text; ein Text, der sonst leer wäre, bleibt vollständig erhalten.
 */
export function parseHomeworkEntry(text: string, subjects: { id: string; name: string }[], today: string): HomeworkEntry {
  const original = text.replace(/\s+/g, ' ').trim();
  let rest = original;
  let due: string | null = null;

  // Frist: mit Einleitungswort an beliebiger Stelle, ohne Einleitungswort nur am Ende
  const lead = '(?:bis|für|zum|am|ab)\\s+';
  const day = '(heute|übermorgen|morgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|mo|di|mi|do|fr|sa|so)';
  const date = '(\\d{1,2})\\.(\\d{1,2})\\.(?:(\\d{4}|\\d{2})(?!\\d))?';
  const patterns: { re: RegExp; read: (m: RegExpExecArray) => string | null | 'next' }[] = [
    { re: new RegExp(`(?:^|\\s)(?:${lead})?(?:in der\\s+)?nächste[rn]?\\s+stunde\\b`, 'i'), read: () => 'next' },
    { re: new RegExp(`(?:^|\\s)${lead}${date}(?=\\s|$|[,;])`, 'i'), read: (m) => dateFrom(today, Number(m[1]), Number(m[2]), m[3]) },
    { re: new RegExp(`(?:^|\\s)${date}$`, 'i'), read: (m) => dateFrom(today, Number(m[1]), Number(m[2]), m[3]) },
    { re: new RegExp(`(?:^|\\s)${lead}${day}(?=\\s|$|[,;.])`, 'i'), read: (m) => readDay(m[1].toLowerCase(), today) },
    { re: new RegExp(`(?:^|\\s)(morgen|übermorgen)$`, 'i'), read: (m) => readDay(m[1].toLowerCase(), today) },
  ];
  for (const { re, read } of patterns) {
    const m = re.exec(rest);
    if (!m) continue;
    const value = read(m);
    if (value === null) continue;
    const without = clean(rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length));
    if (!without) continue; // der Text bestünde nur aus der Frist
    rest = without;
    due = value === 'next' ? null : value;
    break;
  }

  // Fach am Anfang
  let subjectId: string | null = null;
  const words = rest.split(' ');
  const subject = leadingSubject(words, subjects);
  if (subject && words.length > subject.used) {
    subjectId = subject.id;
    rest = clean(words.slice(subject.used).join(' '));
  } else if (subject) {
    subjectId = subject.id; // nur das Fach getippt: Text bleibt als Titel
  }

  return { title: rest || original, subjectId, due };
}

function readDay(word: string, today: string): string | null {
  if (word === 'heute') return today;
  if (word === 'morgen') return addDays(today, 1);
  if (word === 'übermorgen') return addDays(today, 2);
  const wd = WEEKDAYS[word];
  return wd === undefined ? null : nextWeekday(today, wd);
}

export interface DueOptions {
  /** nächste Stunde des Fachs (ohne Fach oder Stundenplan: nächster Schultag) */
  next: string;
  /** ob der Stundenplan die Stunde wirklich kennt, sonst ist "nächste Stunde" nur der nächste Schultag */
  fromTimetable: boolean;
  tomorrow: string;
}

/** Vorschläge für den Abgabetag einer neuen Hausaufgabe. */
export function dueOptions(subjectId: string | null, today: string, timetable: Timetable | null, subjects: { id: string; name: string }[]): DueOptions {
  const lesson = nextLessonDay(today, subjectId, timetable, subjects);
  return { next: lesson ?? dueDateFor(today, null, timetable, subjects), fromTimetable: lesson !== null, tomorrow: addDays(today, 1) };
}
