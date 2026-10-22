/**
 * Stundenplan und Vertretungsplan aus Lanis (Schulportal Hessen). Reine Funktionen ohne DOM,
 * damit sie in Tests, im Browser und in Edge Functions gleich laufen.
 *
 * Aufbau der Stundenplan-Seite (stundenplan.php): zuerst der "Gesamtplan" der Stufe, danach unter der
 * Überschrift "Persönlicher Stundenplan für ..." eine Tabelle mit den Spalten Stunde, Montag bis Freitag.
 * Eine Zelle enthält pro Kurs ein <div class="stunde"> mit <b>Kurscode</b>, Raum und <small>Lehrerkürzel</small>.
 * Doppelstunden sind Zellen mit rowspan="2", die Zeilen darunter lassen die Zelle weg.
 *
 * Vertretungsplan ("Mein Vplan"): vertretungsplan.php?a=my liefert pro Tag eine JSON-Liste mit Feldern wie
 * Stunde, Art, Fach, Raum, Vertreter, Hinweis. Das Format wurde nach der Bibliothek der Lanis-Entwickler
 * übernommen und ist hier tolerant gegenüber fehlenden Feldern.
 */

import { CONFIG } from './config';
import { LANIS_SUBJECT_NAMES, matchSubject } from './lanis';

export interface TimetablePeriod {
  period: number;
  start: string; // HH:MM
  end: string;
}

export interface TimetableLesson {
  weekday: number; // 0 = Montag bis 4 = Freitag
  period: number;
  span: number; // 2 = Doppelstunde
  start: string;
  end: string;
  course: string; // zum Beispiel "Q1M03"
  abbr: string; // Fachkürzel, zum Beispiel "M"
  isAdvanced: boolean;
  room: string;
  teacher: string;
}

export interface Timetable {
  /** YYYY-MM-DD, "Stundenplan gültig ab" */
  validFrom: string | null;
  periods: TimetablePeriod[];
  lessons: TimetableLesson[];
}

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** Kurscode zu Fachkürzel: "Q1POWI_LK01" -> POWI, "Q1G05" -> G, "Q1BIO_Bili01" -> BIO. */
export function courseAbbr(course: string): string {
  const rest = course.trim().replace(/^(?:Q[1-4]|E\d)/i, '');
  return /^[A-Za-zÄÖÜäöü]+/.exec(rest)?.[0].toUpperCase() ?? course.trim().toUpperCase();
}

/** Schneidet den persönlichen Stundenplan aus der Seite (Überschrift bis Ende der ersten Tabelle). */
export function extractPersonalTimetable(html: string): string | null {
  const start = html.indexOf('Persönlicher Stundenplan');
  if (start < 0) return null;
  const tableStart = html.indexOf('<table', start);
  if (tableStart < 0) return null;
  const tableEnd = html.indexOf('</table>', tableStart);
  if (tableEnd < 0) return null;
  return html.slice(start, tableEnd + '</table>'.length);
}

export function parseTimetable(section: string): Timetable {
  const validMatch = /gültig(?:&nbsp;|\s)+ab\s+(\d{2})\.(\d{2})\.(\d{4})/.exec(section);
  const validFrom = validMatch ? `${validMatch[3]}-${validMatch[2]}-${validMatch[1]}` : null;
  const tableStart = section.indexOf('<table');
  const tbody = tableStart >= 0 ? section.slice(tableStart) : section;

  const periods: TimetablePeriod[] = [];
  const raw: Omit<TimetableLesson, 'end'>[] = [];
  const busy = [0, 0, 0, 0, 0];

  for (const row of tbody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
    const label = cells[0]?.[2] ?? '';
    const times = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.exec(label);
    if (!times) continue; // Kopf- und Leerzeilen
    const numberMatch = /(\d+)\.\s*<\/span>/.exec(label) ?? /(\d+)\.\s*$/.exec(plain(label));
    const period = numberMatch ? Number(numberMatch[1]) : periods.length + 1;
    periods.push({ period, start: times[1].padStart(5, '0'), end: times[2].padStart(5, '0') });

    let next = 1;
    for (let col = 0; col < 5; col++) {
      if (busy[col] > 0) {
        busy[col]--;
        continue;
      }
      const cell = cells[next++];
      if (!cell) continue;
      const span = Math.max(1, Number(/rowspan="(\d+)"/i.exec(cell[1])?.[1] ?? 1));
      if (span > 1) busy[col] = span - 1;
      for (const div of cell[2].matchAll(/<div\b[^>]*class="[^"]*\bstunde\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)) {
        const inner = div[1];
        const course = plain(/<b>([\s\S]*?)<\/b>/i.exec(inner)?.[1] ?? '');
        if (!course) continue;
        const afterB = inner.slice(inner.search(/<\/b>/i) + 4);
        const room = plain(afterB.split(/<br|<small/i)[0]);
        const teacher = plain(/<small>([\s\S]*?)<\/small>/i.exec(inner)?.[1] ?? '');
        raw.push({
          weekday: col,
          period,
          span,
          start: times[1].padStart(5, '0'),
          course,
          abbr: courseAbbr(course),
          isAdvanced: /_LK/i.test(course),
          room,
          teacher,
        });
      }
    }
  }

  const endOf = (p: number) => periods.find((x) => x.period === p)?.end ?? '';
  const lessons = raw
    .map((l) => ({ ...l, end: endOf(l.period + l.span - 1) || endOf(l.period) }))
    .sort((a, b) => a.weekday - b.weekday || a.period - b.period || a.course.localeCompare(b.course));
  return { validFrom, periods, lessons };
}

/** Wochentag eines Datums (YYYY-MM-DD): 0 = Montag, 6 = Sonntag. */
export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

export function lessonsOn(tt: Timetable, iso: string): TimetableLesson[] {
  const wd = weekdayIndex(iso);
  if (wd > 4) return [];
  if (tt.validFrom && iso < tt.validFrom) return [];
  return tt.lessons.filter((l) => l.weekday === wd);
}

/** Freistunden zwischen der ersten und der letzten Stunde des Tages. */
export function freePeriodsOn(tt: Timetable, iso: string): TimetablePeriod[] {
  const day = lessonsOn(tt, iso);
  if (day.length === 0) return [];
  const first = Math.min(...day.map((l) => l.period));
  const last = Math.max(...day.map((l) => l.period + l.span - 1));
  const taken = new Set<number>();
  for (const l of day) for (let p = l.period; p < l.period + l.span; p++) taken.add(p);
  return tt.periods.filter((p) => p.period > first && p.period < last && !taken.has(p.period));
}

/**
 * Die Stunde, in der man gerade sitzt, sonst die zuletzt beendete des Tages (zum Beispiel für die Fachvorauswahl
 * nach dem Unterricht). time als "HH:MM". Liegt noch keine Stunde hinter einem, die erste des Tages.
 */
export function recentLesson(tt: Timetable, iso: string, time: string): TimetableLesson | null {
  const day = lessonsOn(tt, iso);
  if (day.length === 0) return null;
  const sorted = [...day].sort((a, b) => a.start.localeCompare(b.start) || a.period - b.period);
  const running = sorted.find((l) => l.start <= time && time < l.end);
  if (running) return running;
  const finished = sorted.filter((l) => l.end <= time);
  return finished.length > 0 ? finished[finished.length - 1] : sorted[0];
}

/**
 * Freistunden eines Tages, getrennt nach Lernzeit und Mittagspause.
 * Eine Freistunde zwischen lunchAfterPeriod und lunchBeforePeriod (Standard: die 7. Stunde) ist zum Essen da.
 */
export function splitFreePeriods(
  tt: Timetable,
  iso: string,
  cfg: { lunchAfterPeriod: number; lunchBeforePeriod: number } = CONFIG.school,
): { study: TimetablePeriod[]; lunch: TimetablePeriod[] } {
  const study: TimetablePeriod[] = [];
  const lunch: TimetablePeriod[] = [];
  for (const p of freePeriodsOn(tt, iso)) {
    (p.period > cfg.lunchAfterPeriod && p.period < cfg.lunchBeforePeriod ? lunch : study).push(p);
  }
  return { study, lunch };
}

/* ---------- Vertretungsplan ---------- */

export interface SubstitutionEntry {
  date: string; // YYYY-MM-DD
  periods: number[];
  kind: SubstitutionKind;
  art: string | null;
  subject: string | null;
  subjectOld: string | null;
  room: string | null;
  roomOld: string | null;
  /** Neue Lehrkraft (Vertreter) */
  substitute: string | null;
  /** Lehrkraft, die den Kurs sonst unterrichtet (die alte Lehrkraft), null wenn der Plan sie nicht nennt */
  teacher: string | null;
  note: string | null;
  group: string | null;
  /** Nur nach Fach und Zeit zugeordnet, ohne dass Kurscode oder Lehrkraft es bestätigen: kann auch einen anderen Kurs betreffen */
  uncertain?: boolean;
}

export type SubstitutionKind = 'cancelled' | 'substitute' | 'room' | 'other';

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = plain(String(v));
  return s === '' ? null : s;
};

/** "3", "3 - 4", "3, 4" -> [3, 4] */
export function parsePeriods(v: unknown): number[] {
  const s = String(v ?? '');
  const range = /(\d+)\s*-\s*(\d+)/.exec(s);
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])];
    return Array.from({ length: Math.min(20, Math.max(0, b - a)) + 1 }, (_, i) => a + i); // höchstens 21 Stunden, schützt vor absurden Bereichen
  }
  return [...s.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

export function substitutionKind(e: Pick<SubstitutionEntry, 'art' | 'note' | 'substitute' | 'room' | 'roomOld'>): SubstitutionKind {
  const text = `${e.art ?? ''} ${e.note ?? ''}`;
  if (/entfall|ausfall|entfällt|fällt aus|freisetzung|eigenverantwortlich/i.test(text)) return 'cancelled';
  if (/raum/i.test(e.art ?? '')) return 'room'; // "Raumvertretung"
  if (e.substitute || /vertretung|vertr\./i.test(e.art ?? '')) return 'substitute';
  if (e.room && e.roomOld && e.room !== e.roomOld) return 'room';
  return 'other';
}

/** Datum "dd.mm.yyyy", "dd_mm_yyyy" oder ISO -> YYYY-MM-DD */
export function toIsoFromLanis(date: string): string | null {
  const m = /^(\d{2})[._](\d{2})[._](\d{4})$/.exec(date.trim());
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ? date.trim() : null;
}

/** Eine Antwort von vertretungsplan.php?a=my für einen Tag. Fehlende Felder und Fehlercodes (-1) ergeben eine leere Liste. */
export function parseSubstitutions(date: string, raw: unknown): SubstitutionEntry[] {
  const iso = toIsoFromLanis(date);
  if (!iso || !Array.isArray(raw)) return [];
  const out: SubstitutionEntry[] = [];
  for (const e of raw as Record<string, unknown>[]) {
    if (!e || typeof e !== 'object') continue;
    const base = {
      art: str(e.Art),
      note: [str(e.Hinweis), str(e.Hinweis2)].filter(Boolean).join(' · ') || null,
      substitute: str(e.Vertreter) ?? str(e.Vertreterkuerzel),
      room: str(e.Raum),
      roomOld: str(e.Raum_alt),
    };
    out.push({
      date: toIsoFromLanis(String(e.Tag ?? '')) ?? iso,
      periods: parsePeriods(e.Stunde),
      kind: substitutionKind(base),
      subject: str(e.Fach),
      subjectOld: str(e.Fach_alt),
      teacher: str(e.Lehrer) ?? str(e.Lehrerkuerzel),
      group: str(e.Lerngruppe),
      ...base,
    });
  }
  return out.sort((a, b) => (a.periods[0] ?? 0) - (b.periods[0] ?? 0));
}

/**
 * Passt ein Fach aus dem Plan ("M", "Mathe", "M-GK1", "Bio") zum Fachkürzel einer Stunde ("M")?
 * Gleich, oder der Name ist ein bekannter Name des Kürzels (Mathe, Mathematik), oder einer der Namen beginnt mit dem anderen
 * (mindestens zwei Zeichen, damit "E" nicht zu "Ethik" passt).
 */
export function subjectMatchesAbbr(name: string, abbr: string): boolean {
  const token = name.trim().replace(/^(?:Q[1-4]|E\d)(?=[A-Za-zÄÖÜäöü])/i, '').toLowerCase().split(/[\s\-_/.]+/)[0].replace(/\d+$/, '');
  const a = abbr.toLowerCase();
  if (!token || !a) return false;
  if (token === a) return true;
  if (LANIS_SUBJECT_NAMES[a]?.some((n) => n.startsWith(token) || token.startsWith(n))) return token.length >= 2;
  const [short, long] = token.length <= a.length ? [token, a] : [a, token];
  return short.length >= 2 && long.startsWith(short);
}


/** Kurscode wie "Q1INFO_LK01", "E1POWI04" oder "Q3GEO01": Stufe, Fach und Nummer. Ein bloßes Fachkürzel ("POWI", "G") ist keiner. */
export function isCourseCode(name: string): boolean {
  return /^(?:Q[1-4]|E\d)[A-Za-zÄÖÜäöü]/.test(name.trim()) && /\d/.test(name);
}

const compactCode = (c: string) => c.replace(/[\s_-]+/g, '').toLowerCase();

/** Gleiche Lehrkraft? Kürzel ohne Groß- und Kleinschreibung, mehrere Kürzel in einer Zelle ("Abc, Xyz") reichen bei einem gemeinsamen. */
export function sameTeacher(a: string, b: string): boolean {
  const tokens = (t: string) => t.toLowerCase().split(/[\s,;/+]+/).filter(Boolean);
  const bs = tokens(b);
  return tokens(a).some((t) => bs.includes(t));
}

/**
 * Gehört ein Eintrag im Vertretungsplan zu dieser eigenen Stunde (es zählt nur die Stunde selbst, nicht der Tag)?
 * - 'sure': die Lerngruppe (Lanis) oder ein Kurscode im Plan ist gleich dem Kurscode der Stunde, oder die Lehrkraft des Plans
 *   (die alte) ist gleich der Lehrkraft der Stunde (zwei Kurse gleichzeitig bei einer Lehrkraft gibt es nicht)
 * - 'maybe': das Fach passt und die Lehrkraft ist auf einer Seite unbekannt, oder es steht weder Fach noch Lehrkraft im Eintrag.
 *   Es könnte ein anderer Kurs derselben Stufe zur selben Zeit sein.
 * - null: anderer Kurs. Ein anderer Kurscode desselben Fachs bei anderer Lehrkraft ist ein anderer Kurs; ohne Fach, aber mit anderer
 *   Lehrkraft ebenfalls. Nur mit Lerngruppe (Lanis) und ohne Fach zählt allein die Lerngruppe.
 */
export function lessonFit(
  e: Pick<SubstitutionEntry, 'subject' | 'subjectOld' | 'teacher' | 'group'>,
  lesson: Pick<TimetableLesson, 'course' | 'abbr' | 'teacher'>,
): 'sure' | 'maybe' | null {
  if (e.group !== null && compactCode(e.group) === compactCode(lesson.course)) return 'sure';
  const names = [e.subject, e.subjectOld].filter((x): x is string => Boolean(x));
  if (names.some((n) => isCourseCode(n) && compactCode(n) === compactCode(lesson.course))) return 'sure';
  const teacherKnown = Boolean(e.teacher) && lesson.teacher !== '';
  if (teacherKnown && sameTeacher(e.teacher as string, lesson.teacher)) return 'sure';
  if (teacherKnown) return null;
  if (names.length === 0) return e.group === null ? 'maybe' : null;
  return names.some((n) => !isCourseCode(n) && subjectMatchesAbbr(n, lesson.abbr)) ? 'maybe' : null;
}

/** Passt der Eintrag zur Stunde (sicher oder vielleicht, siehe lessonFit)? */
export function substitutionFitsLesson(
  e: Pick<SubstitutionEntry, 'subject' | 'subjectOld' | 'teacher' | 'group'>,
  lesson: Pick<TimetableLesson, 'course' | 'abbr' | 'teacher'>,
): boolean {
  return lessonFit(e, lesson) !== null;
}

export interface DayView {
  lesson: TimetableLesson;
  subjectId: string | null;
  substitutions: SubstitutionEntry[];
}

/** Stundenplan eines Tages mit zugeordneten Vertretungen und App-Fach. */
export function dayView(
  tt: Timetable,
  subs: SubstitutionEntry[],
  subjects: { id: string; name: string }[],
  iso: string,
): { lessons: DayView[]; unmatched: SubstitutionEntry[] } {
  const todays = subs.filter((s) => s.date === iso);
  const used = new Set<SubstitutionEntry>();
  const lessons = lessonsOn(tt, iso).map((lesson) => {
    const mine = todays.filter((s) => {
      const overlaps = s.periods.some((p) => p >= lesson.period && p < lesson.period + lesson.span);
      return overlaps && substitutionFitsLesson(s, lesson);
    });
    mine.forEach((s) => used.add(s));
    return { lesson, subjectId: matchSubject(lesson.abbr, subjects), substitutions: mine };
  });
  return { lessons, unmatched: todays.filter((s) => !used.has(s)) };
}
