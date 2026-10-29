import { CONFIG } from './config';
import type { FreeSlot } from './daily';

/**
 * Stundenplan im Studium: Veranstaltungen mit freier Uhrzeit, wöchentlich oder alle zwei Wochen, einzelne Termine und gesperrte Zeiten
 * (Job, Pendeln). Der Schulplan aus Lanis (Raster mit Stundennummern) bleibt unverändert. Reine Funktionen.
 */

export type EventKind = 'lecture' | 'exercise' | 'seminar' | 'tutorial' | 'lab' | 'other' | 'blocked';

export const EVENT_KINDS: EventKind[] = ['lecture', 'exercise', 'seminar', 'tutorial', 'lab', 'other', 'blocked'];

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  lecture: 'Vorlesung',
  exercise: 'Übung',
  seminar: 'Seminar',
  tutorial: 'Tutorium',
  lab: 'Praktikum',
  other: 'Sonstiges',
  blocked: 'Gesperrt (Job, Pendeln)',
};

export function isEventKind(v: unknown): v is EventKind {
  return typeof v === 'string' && (EVENT_KINDS as string[]).includes(v);
}

export interface StudyEvent {
  id: string;
  subjectId: string | null;
  kind: EventKind;
  title: string;
  room: string;
  lecturer: string;
  /** Wochentag (0 = Sonntag bis 6 = Samstag) bei wiederkehrenden Terminen, sonst null */
  weekday: number | null;
  /** Einzelner Termin (YYYY-MM-DD), sonst null */
  date: string | null;
  /** Minuten seit Mitternacht */
  startMin: number;
  endMin: number;
  /** 1: jede Woche, 2: alle zwei Wochen (die Woche von `validFrom` ist die erste) */
  every: 1 | 2;
  validFrom: string | null;
  validTo: string | null;
  /** Ausgefallene Tage (YYYY-MM-DD) */
  skipped: string[];
  /** Kennung aus der Kalenderdatei, damit ein erneuter Import nichts doppelt anlegt */
  uid: string | null;
}

const MS_PER_DAY = 86_400_000;

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Montag der Woche, in der das Datum liegt. */
export function mondayOf(iso: string): string {
  const d = parse(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return fmt(d);
}

export function addDay(iso: string, n: number): string {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return fmt(d);
}

/** Findet der Termin an diesem Tag statt (Wochentag, Rhythmus, Gültigkeit, Ausfälle)? */
export function occursOn(ev: StudyEvent, date: string): boolean {
  if (ev.skipped.includes(date)) return false;
  if (ev.date !== null) return ev.date === date;
  if (ev.weekday === null || parse(date).getDay() !== ev.weekday) return false;
  if (ev.validFrom && date < ev.validFrom) return false;
  if (ev.validTo && date > ev.validTo) return false;
  if (ev.every === 2) {
    if (!ev.validFrom) return true; // ohne Anker gilt jede Woche
    const weeks = Math.round((parse(mondayOf(date)).getTime() - parse(mondayOf(ev.validFrom)).getTime()) / (7 * MS_PER_DAY));
    return weeks % 2 === 0;
  }
  return true;
}

/** Termine eines Tages, nach Beginn sortiert. */
export function eventsOn(events: StudyEvent[], date: string): StudyEvent[] {
  return events.filter((e) => occursOn(e, date)).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

export const eventLength = (e: Pick<StudyEvent, 'startMin' | 'endMin'>) => Math.max(0, e.endMin - e.startMin);

/** Gesperrte Minuten an einem Tag (Job, Pendeln), Überschneidungen zählen einmal. */
export function blockedMinutesOn(events: StudyEvent[], date: string): number {
  const spans = eventsOn(events, date)
    .filter((e) => e.kind === 'blocked')
    .map((e) => [e.startMin, e.endMin] as const)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let end = -1;
  for (const [s, e] of spans) {
    const from = Math.max(s, end);
    if (e > from) total += e - from;
    end = Math.max(end, e);
  }
  return total;
}

export interface Gap {
  startMin: number;
  endMin: number;
}

/** Lücken zwischen den Terminen eines Tages (innerhalb des Tagesfensters), mindestens `minGapMin` lang. */
export function gapsOn(
  events: StudyEvent[],
  date: string,
  opts: { startMin?: number; endMin?: number; minGapMin?: number } = {},
): Gap[] {
  const day = CONFIG.study.day;
  const from = opts.startMin ?? day.startMin;
  const to = opts.endMin ?? day.endMin;
  const min = opts.minGapMin ?? day.minGapMin;
  const busy = eventsOn(events, date)
    .map((e) => [Math.max(from, e.startMin), Math.min(to, e.endMin)] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const gaps: Gap[] = [];
  let cursor = from;
  for (const [s, e] of busy) {
    if (s - cursor >= min) gaps.push({ startMin: cursor, endMin: s });
    cursor = Math.max(cursor, e);
  }
  if (to - cursor >= min) gaps.push({ startMin: cursor, endMin: to });
  return gaps;
}

export function minutesOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Die Veranstaltung, die gerade läuft, die nächste des Tages und eine Lücke, in der man jetzt lernen könnte. */
export function dayStatus(
  events: StudyEvent[],
  now: Date,
  lookaheadMin: number = CONFIG.daily.freeSlotLookaheadMin,
): { current: StudyEvent | null; next: StudyEvent | null; freeMin: number | null } {
  const date = fmt(now);
  const min = minutesOfDay(now);
  const today = eventsOn(events, date).filter((e) => e.kind !== 'blocked');
  const current = today.find((e) => e.startMin <= min && min < e.endMin) ?? null;
  const next = today.find((e) => e.startMin > min) ?? null;
  let freeMin: number | null = null;
  if (!current) {
    const until = next ? next.startMin - min : null;
    // Lücke bis zum nächsten Termin (mindestens die Mindestdauer), sonst bis zum Ende des Tagesfensters
    const end = until ?? Math.max(0, CONFIG.study.day.endMin - min);
    if (end >= CONFIG.daily.minSessionMin && (until === null || until >= lookaheadMin)) freeMin = end;
  }
  return { current, next, freeMin };
}

export interface WeekCell {
  date: string;
  events: StudyEvent[];
}

/** Die sieben Tage ab Montag mit ihren Terminen. */
export function weekOf(events: StudyEvent[], anyDay: string): WeekCell[] {
  const monday = mondayOf(anyDay);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDay(monday, i);
    return { date, events: eventsOn(events, date) };
  });
}

/** Zeit als 09:15. */
export function formatClock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Liest 9:15 oder 09.15 oder 915; null bei Unsinn. */
export function parseClock(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2})[:.]?(\d{2})$/) ?? raw.trim().match(/^(\d{1,2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = m[2] ? Number(m[2]) : 0;
  return h >= 0 && h < 24 && mi >= 0 && mi < 60 ? h * 60 + mi : null;
}

/** Fach zu einem Titel: der Modulname kommt im Titel vor (ohne Akzente und Großschreibung), der längste Treffer gewinnt. */
export function matchSubjectId(title: string, subjects: { id: string; name: string }[]): string | null {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const t = ` ${norm(title)} `;
  let best: { id: string; len: number } | null = null;
  for (const s of subjects) {
    const n = norm(s.name);
    if (n.length < 3) continue;
    if (t.includes(` ${n} `) || t.includes(n)) if (!best || n.length > best.len) best = { id: s.id, len: n.length };
  }
  return best ? best.id : null;
}

/** Ob ein neuer Termin mit einem vorhandenen am selben Tag kollidiert (zum Beispiel beim Eintragen von Hand). */
export function overlaps(a: Pick<StudyEvent, 'startMin' | 'endMin'>, b: Pick<StudyEvent, 'startMin' | 'endMin'>): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

/**
 * Eine Lücke im Stundenplan, die sich zum Lernen anbietet (Gegenstück zur Freistunde in der Schule): Gerade läuft nichts und es folgt
 * noch ein Termin heute, oder die laufende Veranstaltung endet in Kürze und danach ist Platz. Nach dem letzten Termin des Tages gibt es keine.
 */
export function eventFreeSlot(events: StudyEvent[], now: Date, cfg: { minSessionMin: number; freeSlotLookaheadMin: number } = CONFIG.daily): FreeSlot | null {
  const todays = eventsOn(events, fmt(now));
  const min = minutesOfDay(now);
  const current = todays.find((e) => e.startMin <= min && min < e.endMin);
  const from = current ? current.endMin : min;
  if (current && current.endMin - min > cfg.freeSlotLookaheadMin) return null;
  const next = todays.find((e) => e.startMin >= from && e !== current);
  if (!next) return null;
  const minutes = next.startMin - from;
  if (minutes < cfg.minSessionMin) return null;
  return { start: formatClock(from), end: formatClock(next.startMin), minutes, running: !current };
}

/** Modul der Veranstaltung, in der man gerade sitzt oder die in den letzten 90 Minuten endete (Vorauswahl für den Timer). */
export function eventSubjectId(events: StudyEvent[], now: Date, recentMin = 90): string | null {
  const todays = eventsOn(events, fmt(now)).filter((e) => e.subjectId && e.kind !== 'blocked');
  const min = minutesOfDay(now);
  const current = todays.find((e) => e.startMin <= min && min < e.endMin);
  if (current) return current.subjectId;
  const recent = todays.filter((e) => e.endMin <= min && min - e.endMin <= recentMin).pop();
  return recent?.subjectId ?? null;
}

/** Der nächste Tag nach `from` (ohne ihn selbst), an dem ein Termin des Moduls stattfindet, höchstens `maxDays` voraus. */
export function nextEventDay(events: StudyEvent[], subjectId: string | null, from: string, maxDays = 21): string | null {
  if (!subjectId) return null;
  const own = events.filter((e) => e.subjectId === subjectId && e.kind !== 'blocked');
  for (let i = 1; i <= maxDays; i++) {
    const date = addDay(from, i);
    if (own.some((e) => occursOn(e, date))) return date;
  }
  return null;
}
