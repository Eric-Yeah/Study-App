import type { Exam, Subject } from './types';

/**
 * Klausuren aus dem Lanis-Kalender (Schulportal Hessen) lesen und Fächern zuordnen.
 * Reine Funktionen. Der Abruf selbst läuft in der Supabase Edge Function lanis-calendar.
 *
 * Aufbau eines Eintrags bei Schulen, die Klausuren so eintragen:
 *   title:       "ETHI Q1 Klausur"
 *   description: "Klausur in ETHI Q1 (Q1ETHI03-GYM)"
 *   start:       "2026-10-22T09:55:00+02:00"
 */

export interface LanisEvent {
  Id: string;
  title: string;
  description?: string;
  start: string;
  allDay?: boolean;
}

export interface LanisExam {
  externalId: string;
  /** YYYY-MM-DD, das Datum in der Zeitzone der Schule (so wie im Eintrag angegeben). */
  date: string;
  /** Fachkürzel aus Lanis, zum Beispiel "POWI". */
  abbr: string;
  stage: string | null;
  courseCode: string | null;
  isAdvanced: boolean;
}

/** Lanis-Kürzel auf Namen, wie sie in der App vorkommen (klein geschrieben, auch Varianten). */
export const LANIS_SUBJECT_NAMES: Record<string, string[]> = {
  d: ['deutsch'],
  m: ['mathematik', 'mathe'],
  e: ['englisch'],
  f: ['französisch'],
  fra: ['französisch'],
  s: ['spanisch'],
  spa: ['spanisch'],
  l: ['latein'],
  lat: ['latein'],
  g: ['geschichte'],
  powi: ['politik und wirtschaft'],
  ek: ['erdkunde'],
  rev: ['religion'],
  rka: ['religion'],
  ethi: ['ethik'],
  bio: ['biologie'],
  ch: ['chemie'],
  ph: ['physik'],
  inf: ['informatik'],
  ku: ['kunst'],
  mu: ['musik'],
  spo: ['sport'],
};

export function isLanisExam(e: Pick<LanisEvent, 'title'>): boolean {
  return /\bklausur\b/i.test(e.title);
}

export function parseLanisExam(e: LanisEvent): LanisExam | null {
  if (!isLanisExam(e) || !e.Id || !/^\d{4}-\d{2}-\d{2}/.test(e.start)) return null;
  const [abbr, second] = e.title.trim().split(/\s+/);
  if (!abbr || /^klausur$/i.test(abbr)) return null;
  const courseCode = /\(([^)]+)\)/.exec(e.description ?? '')?.[1] ?? null;
  return {
    externalId: e.Id,
    date: e.start.slice(0, 10),
    abbr,
    stage: second && /^(E|Q[1-4])$/i.test(second) ? second.toUpperCase() : null,
    courseCode,
    isAdvanced: courseCode !== null && /_LK/i.test(courseCode),
  };
}

export function matchSubject(abbr: string, subjects: Pick<Subject, 'id' | 'name'>[]): string | null {
  const key = abbr.toLowerCase();
  const names = LANIS_SUBJECT_NAMES[key] ?? [];
  const found = subjects.find((s) => {
    const name = s.name.trim().toLowerCase();
    return name === key || names.some((n) => name === n || name.startsWith(n));
  });
  return found?.id ?? null;
}

export type ImportStatus = 'new' | 'known' | 'changed' | 'kept';

/** Hat der Nutzer das Datum einer aus Lanis stammenden Klausur selbst verlegt? Ohne bekanntes Lanis-Datum lässt sich das nicht sagen. */
export function dateIsOwn(e: Pick<Exam, 'date' | 'lanisDate' | 'externalId'>): boolean {
  return Boolean(e.externalId) && Boolean(e.lanisDate) && e.date !== e.lanisDate;
}

/**
 * Gleicht eine bekannte Klausur mit dem Lanis-Kalender ab. Ein selbst verlegter Termin hat Vorrang: Lanis ändert dann
 * nur das gemerkte Lanis-Datum. Der Hinweis (lanisNotice) wird je Lanis-Datum nur einmal gesetzt, solange noch keiner kam.
 */
export function reconcileExam(existing: Exam, lanisDate: string): { exam: Exam; status: Exclude<ImportStatus, 'new'> } {
  if (existing.date === lanisDate) {
    return { exam: { ...existing, lanisDate, lanisNotice: null }, status: 'known' };
  }
  if (dateIsOwn(existing)) {
    const notify = existing.lanisAck !== lanisDate && existing.lanisNotice !== lanisDate;
    return { exam: { ...existing, lanisDate, lanisNotice: notify ? lanisDate : (existing.lanisNotice ?? null) }, status: 'kept' };
  }
  return { exam: { ...existing, date: lanisDate, lanisDate, lanisNotice: null }, status: 'changed' };
}

/** Offener Hinweis: Lanis nennt ein anderes Datum, der eigene Termin gilt weiter. */
export function pendingNotice(e: Exam): string | null {
  return dateIsOwn(e) && e.lanisNotice && e.lanisNotice === e.lanisDate ? e.lanisNotice : null;
}

export interface ImportItem {
  lanis: LanisExam;
  subjectId: string | null;
  status: ImportStatus;
  existing: Exam | null;
}

/** Ordnet Lanis-Klausuren Fächern zu und prüft, was schon importiert wurde. Sortiert nach Datum. */
export function planImport(
  events: LanisEvent[],
  subjects: Pick<Subject, 'id' | 'name'>[],
  exams: Exam[],
  today: string,
): ImportItem[] {
  const seen = new Set<string>();
  const items: ImportItem[] = [];
  for (const e of events) {
    const lanis = parseLanisExam(e);
    if (!lanis || lanis.date < today || seen.has(lanis.externalId)) continue;
    seen.add(lanis.externalId);
    const existing = exams.find((x) => x.externalId === lanis.externalId) ?? null;
    items.push({
      lanis,
      subjectId: existing?.subjectId ?? matchSubject(lanis.abbr, subjects),
      status: existing ? reconcileExam(existing, lanis.date).status : 'new',
      existing,
    });
  }
  return items.sort((a, b) => a.lanis.date.localeCompare(b.lanis.date));
}
