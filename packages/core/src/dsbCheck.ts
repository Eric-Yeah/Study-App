/**
 * Plausibilitätsprüfung für Pläne aus DSBmobile. Der Nutzer soll lieber nichts sehen als etwas Falsches.
 * Reine Funktionen ohne DOM. Aufbau der Seiten und Zuordnung zu den eigenen Stunden stehen in dsbPlan.ts.
 *
 * Was geprüft wird (jeweils mit Zählung für die Diagnose in den Einstellungen):
 * - Datum im Titel: vorhanden, wirklich ein Datum, der genannte Wochentag stimmt, kein Wochenende, nicht älter als gestern
 *   und nicht weiter als CONFIG.dsb.futureDays voraus. Ohne Jahr im Titel gilt das Jahr, das dem heutigen Tag am nächsten liegt
 *   (so geht der Jahreswechsel). NICHT geprüft: Schulferien, die App kennt die Ferien nicht. Ein Plan mitten in den Ferien fällt nur auf,
 *   weil er keine Stunden aus dem Stundenplan trifft.
 * - Zeilen: Stunden im Raster (1 bis CONFIG.dsb.maxPeriod, nicht rückwärts, nicht zu lang), keine leeren Einträge, keine
 *   Kopf- oder Fußzeilen und Hinweise ("Keine Vertretungen"), keine Doppelten, keine Widersprüche (Entfall und Vertretung desselben
 *   Kurses zur selben Zeit: beides wird verworfen).
 * - Aufbau: eine Seite zählt nur, wenn sie ein plausibles Datum und eine lesbare Tabelle hat (oder ausdrücklich nichts meldet).
 *   Fehlt das für alle Seiten, wird nichts gespeichert. Fehlen einzelne Seiten eines Tages, bleibt der alte Stand dieses Tages
 *   erhalten (mergeSubstitutions).
 */

import { CONFIG } from './config';
import { classMatches, dedupe, forStudent, ownLevels, parseUntisTables, studentCheck, type DsbEntry, type UntisTable } from './dsbPlan';
import type { SubstitutionEntry, Timetable } from './lanisPlans';

export type DsbPageProblem = 'no_table' | 'date_missing' | 'date_weekday' | 'date_weekend' | 'date_past' | 'date_future' | 'unreadable';
export type DsbReject = 'date' | 'periods' | 'empty' | 'junk' | 'duplicate' | 'conflict';

export const DSB_PROBLEM_LABELS: Record<DsbPageProblem, string> = {
  no_table: 'keine Tabelle',
  date_missing: 'kein Datum',
  date_weekday: 'Wochentag passt nicht zum Datum',
  date_weekend: 'Datum am Wochenende',
  date_past: 'Datum zu alt',
  date_future: 'Datum zu weit in der Zukunft',
  unreadable: 'Aufbau nicht lesbar',
};

export const DSB_REJECT_LABELS: Record<DsbReject, string> = {
  date: 'Seite mit unplausiblem Datum',
  periods: 'unmögliche Stunde',
  empty: 'leerer Eintrag',
  junk: 'kein Eintrag (Kopf, Fuß oder Hinweis)',
  duplicate: 'doppelt',
  conflict: 'widersprüchlich',
};

export interface DsbPageInfo {
  title: string | null;
  date: string | null;
  problem: DsbPageProblem | null;
  /** Datum plausibel und Tabelle lesbar (oder ausdrücklich ohne Meldungen) */
  readable: boolean;
  /** Diese Seite meldet nichts ("Keine Vertretungen" oder Tabelle ohne Zeilen) */
  empty: boolean;
  rows: number;
  page: { n: number; of: number } | null;
  stand: string | null;
}

export interface DsbRead {
  /** Geprüfte Einträge der ganzen Schule: nur gültige Tage, ohne Doppelte und Widersprüche */
  entries: DsbEntry[];
  tables: DsbPageInfo[];
  /** Verworfene Zeilen nach Grund */
  rejected: Record<DsbReject, number>;
  /** Seiten (Tabellen) mit einem Problem nach Art */
  problems: Record<DsbPageProblem, number>;
  /** Neuester "Stand" aus den Seitenköpfen (YYYY-MM-DDTHH:MM, Ortszeit) */
  stand: string | null;
  /** Gültige Tage, die in den Seiten vorkommen */
  dates: string[];
  /** Davon Tage, deren Seiten ("Seite 1 / 3") alle da sind, und Tage, bei denen welche fehlen */
  complete: string[];
  incomplete: string[];
  /** Mindestens eine Seite für heute oder später ist gültig und lesbar. Sonst nichts speichern. */
  usable: boolean;
}

const WEEKDAYS: Record<string, number> = {
  montag: 1, mo: 1, dienstag: 2, di: 2, mittwoch: 3, mi: 3, donnerstag: 4, do: 4, freitag: 5, fr: 5, samstag: 6, sonnabend: 6, sa: 6, sonntag: 0, so: 0,
};

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Wochentag (0 = Sonntag) eines ISO-Datums. */
const weekdayOf = (iso: string) => new Date(dayNumber(iso) * 86_400_000).getUTCDay();

/** Der Wochentag, den der Titel nennt ("22.10.2026 Donnerstag", "22.10. Do"), sonst null. */
export function titleWeekday(title: string): number | null {
  const m = /\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})?\s*[,;-]?\s*([A-Za-zÄÖÜäöü]{2,})/.exec(title);
  const w = m ? WEEKDAYS[m[1].toLowerCase()] : undefined;
  return w === undefined ? null : w;
}

/** Warum dieser Plantag nicht plausibel ist, oder null. */
export function dateProblem(iso: string | null, title: string | null, todayIso: string): DsbPageProblem | null {
  if (!iso) return 'date_missing';
  const dow = weekdayOf(iso);
  const named = title ? titleWeekday(title) : null;
  if (named !== null && named !== dow) return 'date_weekday';
  if (dow === 0 || dow === 6) return 'date_weekend';
  const diff = dayNumber(iso) - dayNumber(todayIso);
  if (diff < -CONFIG.dsb.pastDays) return 'date_past';
  if (diff > CONFIG.dsb.futureDays) return 'date_future';
  return null;
}

/** Jahr für ein Datum ohne Jahr: das, bei dem der Tag am nächsten an heute liegt (Dezember-Plan im Januar, Januar-Plan im Dezember). */
const nearestYear = (now: Date) => (month: number, day: number) => {
  const y = now.getFullYear();
  const t = now.getTime();
  return [y - 1, y, y + 1].reduce((best, c) => (Math.abs(new Date(c, month - 1, day).getTime() - t) < Math.abs(new Date(best, month - 1, day).getTime() - t) ? c : best), y);
};

const compact = (s: string) => s.replace(/[\s_-]+/g, '').toLowerCase();
const teacherTokens = (t: string | null) => (t ?? '').toLowerCase().split(/[\s,;/+]+/).filter(Boolean);

/** Beschreiben zwei Einträge denselben Kurs zur selben Zeit (gleiche Stufe, überschneidende Stunden, gleiches Fach, Lehrkraft nicht verschieden)? */
function sameCourseAndTime(a: DsbEntry, b: DsbEntry): boolean {
  if (a.date !== b.date || (a.klass ?? '') !== (b.klass ?? '')) return false;
  if (!a.periods.some((p) => b.periods.includes(p))) return false;
  const na = [a.subject, a.subjectOld].filter((x): x is string => Boolean(x)).map(compact);
  const nb = [b.subject, b.subjectOld].filter((x): x is string => Boolean(x)).map(compact);
  if (na.length === 0 || nb.length === 0 || !na.some((x) => nb.includes(x))) return false;
  const ta = teacherTokens(a.teacher);
  const tb = teacherTokens(b.teacher);
  return ta.length === 0 || tb.length === 0 || ta.some((t) => tb.includes(t));
}

/** Entfall und Vertretung (Raumwechsel, Änderung) desselben Kurses zur selben Zeit schließen sich aus. Beide Einträge werden entfernt. */
export function dropConflicts(entries: DsbEntry[]): { list: DsbEntry[]; removed: number } {
  const bad = new Set<DsbEntry>();
  entries.forEach((a, i) => {
    if (a.kind !== 'cancelled') return;
    entries.forEach((b, j) => {
      if (i !== j && b.kind !== 'cancelled' && sameCourseAndTime(a, b)) {
        bad.add(a);
        bad.add(b);
      }
    });
  });
  return { list: entries.filter((e) => !bad.has(e)), removed: bad.size };
}

function pageInfo(t: UntisTable, problem: DsbPageProblem | null): DsbPageInfo {
  const emptyList = t.noSubstitutions || (t.hasList && t.rows === 0);
  const readable = problem === null && (emptyList || (t.hasList && t.recognized > 0));
  return { title: t.title, date: t.date, problem: problem ?? (readable ? null : 'unreadable'), readable, empty: readable && emptyList && t.entries.length === 0, rows: t.rows, page: t.page, stand: t.stand };
}

/**
 * Liest und prüft die Plan-Seiten aus DSBmobile (HTML). now ist der heutige Zeitpunkt auf dem Gerät.
 * Der Plan der ganzen Schule, noch nicht auf die eigenen Stunden gefiltert (das macht dsbForStudent).
 */
export function readDsbPlans(pages: string[], now: Date = new Date()): DsbRead {
  const todayIso = isoLocal(now);
  const year = nearestYear(now);
  const rejected: Record<DsbReject, number> = { date: 0, periods: 0, empty: 0, junk: 0, duplicate: 0, conflict: 0 };
  const problems: Record<DsbPageProblem, number> = { no_table: 0, date_missing: 0, date_weekday: 0, date_weekend: 0, date_past: 0, date_future: 0, unreadable: 0 };
  const infos: DsbPageInfo[] = [];
  const all: DsbEntry[] = [];
  const good: { date: string; page: { n: number; of: number } | null; readable: boolean }[] = [];
  let stand: string | null = null;
  const standLimit = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 16);

  for (const html of pages) {
    const tables = parseUntisTables(html, year);
    if (tables.length === 0) {
      problems.no_table++;
      infos.push({ title: null, date: null, problem: 'no_table', readable: false, empty: false, rows: 0, page: null, stand: null });
      continue;
    }
    for (const t of tables) {
      const problem = dateProblem(t.date, t.title, todayIso);
      const info = pageInfo(t, problem);
      infos.push(info);
      if (info.problem) problems[info.problem]++;
      if (problem) {
        rejected.date += t.rows;
        continue;
      }
      if (t.stand && t.stand <= standLimit && (stand === null || t.stand > stand)) stand = t.stand;
      rejected.periods += t.rejected.periods;
      rejected.empty += t.rejected.empty;
      rejected.junk += t.rejected.junk;
      if (!info.readable) {
        rejected.junk += t.rows;
        continue;
      }
      good.push({ date: t.date as string, page: t.page, readable: true });
      all.push(...t.entries);
    }
  }

  const dd = dedupe(all);
  rejected.duplicate = dd.removed;
  const cf = dropConflicts(dd.list);
  rejected.conflict = cf.removed;
  const entries = cf.list.sort((a, b) => a.date.localeCompare(b.date) || (a.periods[0] ?? 0) - (b.periods[0] ?? 0));

  const dates = [...new Set(good.map((g) => g.date))].sort();
  const complete: string[] = [];
  const incomplete: string[] = [];
  for (const date of dates) {
    const pgs = good.filter((g) => g.date === date).map((g) => g.page ?? { n: 1, of: 1 });
    const of = Math.max(...pgs.map((p) => p.of));
    const have = new Set(pgs.map((p) => p.n));
    (Array.from({ length: of }, (_, i) => i + 1).every((n) => have.has(n)) ? complete : incomplete).push(date);
  }
  return { entries, tables: infos, rejected, problems, stand, dates, complete, incomplete, usable: good.some((g) => g.date >= todayIso) };
}

/** Nur der eigene Teil der geprüften Einträge, mit Zählung, warum anderes nicht passt. */
export function dsbForStudent(
  read: DsbRead,
  tt: Timetable | null,
): { mine: DsbEntry[]; ofLevel: number; uncertain: number; dropped: { klass: number; lesson: number; subject: number } } {
  const mine = forStudent(read.entries, tt);
  const dropped = { klass: 0, lesson: 0, subject: 0 };
  let ofLevel = read.entries.length;
  if (tt) {
    const levels = ownLevels(tt);
    ofLevel = read.entries.filter((e) => classMatches(e.klass, levels)).length;
    for (const e of read.entries) {
      const r = studentCheck(e, tt, levels);
      if (r !== 'ok' && r !== 'maybe') dropped[r]++;
    }
  }
  return { mine, ofLevel, uncertain: mine.filter((e) => e.uncertain).length, dropped };
}

/**
 * Neuer Stand der Vertretungen aus dem alten und den frischen Einträgen (schon auf dich gefiltert):
 * - Tage, deren Seiten vollständig geladen sind, ersetzen den alten Stand dieses Tages (auch durch "nichts").
 * - Tage mit fehlenden Seiten behalten den alten Stand und bekommen die frischen Einträge dazu.
 * - Tage, die im frischen Abruf gar nicht vorkommen: bleiben nur, wenn der Abruf unvollständig war (partial), sonst hat die Schule sie entfernt.
 * - Tage vor heute fallen immer weg.
 */
export function mergeSubstitutions(
  previous: SubstitutionEntry[],
  fresh: SubstitutionEntry[],
  read: Pick<DsbRead, 'dates' | 'complete' | 'incomplete'>,
  partial: boolean,
  todayIso: string,
): SubstitutionEntry[] {
  const out: SubstitutionEntry[] = [];
  const key = (e: SubstitutionEntry) => JSON.stringify([e.date, e.periods, e.subject, e.subjectOld, e.teacher, e.substitute, e.art, e.room, e.note]);
  const seen = new Set<string>();
  const add = (e: SubstitutionEntry) => {
    if (e.date < todayIso || seen.has(key(e))) return;
    seen.add(key(e));
    out.push(e);
  };
  fresh.filter((e) => read.complete.includes(e.date)).forEach(add);
  fresh.filter((e) => read.incomplete.includes(e.date)).forEach(add);
  previous.filter((e) => read.incomplete.includes(e.date) || (partial && !read.dates.includes(e.date))).forEach(add);
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.periods[0] ?? 0) - (b.periods[0] ?? 0));
}

/** Einträge von Tagen vor heute entfernen. */
export const dropPastSubstitutions = (list: SubstitutionEntry[], todayIso: string) => list.filter((e) => e.date >= todayIso);

/**
 * Ist der gespeicherte Stand veraltet? Ja, wenn der Abruf länger als CONFIG.dsb.staleHours her ist oder von einem früheren Tag
 * stammt, während der angezeigte Tag heute ist (am Morgen kann sich der Plan geändert haben).
 */
export function substitutionsStale(fetchedAtIso: string | null, now: Date, shownIso: string): boolean {
  if (!fetchedAtIso) return true;
  const at = new Date(fetchedAtIso);
  if (Number.isNaN(at.getTime())) return true;
  if (now.getTime() - at.getTime() > CONFIG.dsb.staleHours * 3_600_000) return true;
  return shownIso === isoLocal(now) && isoLocal(at) < shownIso;
}

/** Zeitpunkt aus DSBmobile "22.10.2026 18:35" als "YYYY-MM-DDTHH:MM" (Ortszeit), sonst null. */
export function parseDsbStamp(text: string | null | undefined): string | null {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/.exec(text ?? '');
  if (!m) return null;
  const [d, mo, y, h, mi] = m.slice(1).map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d || h > 23 || mi > 59) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}`;
}

export interface DsbDiagnosis {
  /** Seiten (Tabellen), davon lesbar */
  pages: number;
  recognized: number;
  /** Geprüfte Einträge im Plan der ganzen Schule */
  total: number;
  dates: string[];
  /** Stufen aus deinem Stundenplan */
  levels: string[];
  /** Einträge deiner Stufe, und die, die zu dir passen (davon unsicher) */
  ofLevel: number;
  mine: number;
  uncertain: number;
  /** Warum Einträge nicht zu dir passen */
  dropped: { klass: number; lesson: number; subject: number };
  /** Verworfene Zeilen und Seiten mit Problemen, siehe readDsbPlans */
  rejected: Record<DsbReject, number>;
  problems: Record<DsbPageProblem, number>;
  stand: string | null;
  /** Beispielwerte aus dem Plan: Spaltenüberschriften und erste Klassenangaben */
  headers: string[];
  klassSamples: string[];
}

const headerText = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Zusammenfassung für die Fehlersuche: was stand im Plan, was wurde verworfen und was davon ist bei dir gelandet. */
export function diagnoseDsb(pages: string[], tt: Timetable | null, now: Date = new Date()): DsbDiagnosis {
  const read = readDsbPlans(pages, now);
  const { mine, ofLevel, uncertain, dropped } = dsbForStudent(read, tt);
  const headers = [
    ...new Set(
      pages.flatMap((h) =>
        [...(/<table\b[^>]*mon_list[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>/i.exec(h)?.[1] ?? '').matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => headerText(m[1])),
      ),
    ),
  ].slice(0, 20);
  return {
    pages: read.tables.length,
    recognized: read.tables.filter((t) => t.readable).length,
    total: read.entries.length,
    dates: read.dates,
    levels: tt ? ownLevels(tt) : [],
    ofLevel,
    mine: mine.length,
    uncertain,
    dropped,
    rejected: read.rejected,
    problems: read.problems,
    stand: read.stand,
    headers,
    klassSamples: [...new Set(read.entries.map((e) => e.klass ?? '–'))].slice(0, 12),
  };
}

export interface DsbSchedule {
  /** Kennung des Menüs beim letzten verarbeiteten Abruf, null wenn es noch keinen gab */
  version: string | null;
  /** Wurde der letzte volle Abruf übernommen? Sonst bald noch einmal laden. */
  ok: boolean;
  /** Zeitpunkt des letzten Versuchs (ms), auch bei Fehler */
  tryAt: number;
}

/**
 * Was soll die App jetzt bei DSBmobile tun?
 * - 'skip': zu früh nach dem letzten Versuch (mindestens CONFIG.dsb.checkGapMin Minuten, nach einem nicht übernommenen Abruf
 *   CONFIG.dsb.retryGapMin), so bleibt die Grenze von 20 Abrufen je Konto in 10 Minuten auch mit mehreren Geräten weit weg
 * - 'check': nur das Menü holen (ein Aufruf) und die Kennung vergleichen; erst bei einer Änderung kommt der volle Abruf
 * - 'full': alles laden, weil der Nutzer es will, es noch nichts gibt, der Stand älter als CONFIG.dsb.fullMaxAgeHours ist
 *   oder der letzte Abruf nicht übernommen wurde
 */
export function dsbNextStep(schedule: DsbSchedule, substitutionsAtMs: number | null, nowMs: number, force: boolean): 'skip' | 'check' | 'full' {
  const since = nowMs - schedule.tryAt;
  if (force) return since < 10_000 ? 'skip' : 'full';
  if (since < CONFIG.dsb.checkGapMin * 60_000) return 'skip';
  if (!schedule.ok) return since < CONFIG.dsb.retryGapMin * 60_000 ? 'skip' : 'full';
  if (schedule.version === null || substitutionsAtMs === null || nowMs - substitutionsAtMs > CONFIG.dsb.fullMaxAgeHours * 3_600_000) return 'full';
  return 'check';
}
