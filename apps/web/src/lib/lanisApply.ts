import {
  extractAbsenceTable,
  forStudent,
  parseAbsences,
  parseSubstitutions,
  parseUntisPlan,
  parseTimetable,
  planImport,
  toIsoDate,
  type AbsenceReport,
  type Exam,
  type ImportItem,
  type LanisEvent,
  type Subject,
  type SubstitutionEntry,
  type Timetable,
} from '@study/core';
import type { Action } from '../state/store';
import { uid } from './format';

export interface LanisResponse {
  events?: LanisEvent[];
  timetableHtml?: string | null;
  substitutions?: { date: string; raw: unknown }[];
  absencesHtml?: string | null;
  errors?: Record<string, string>;
}

export const LANIS_ERRORS: Record<string, string> = {
  login_failed: 'Anmeldung bei Lanis abgelehnt. Prüfe Schulnummer, Benutzername und Passwort.',
  lanis_unavailable: 'Lanis antwortet gerade nicht wie erwartet. Versuche es später noch einmal.',
  bad_request: 'Bitte Schulnummer (nur Ziffern), Benutzername und Passwort eingeben.',
  rate_limited: 'Zu viele Abrufe in kurzer Zeit. Warte ein paar Minuten und versuche es dann noch einmal.',
  not_allowed: 'Dein Konto ist noch nicht freigegeben.',
  unauthorized: 'Bitte melde dich neu an.',
};

/** Fehlercode aus der Antwort der Edge Function (zum Beispiel login_failed), sonst null. */
export async function lanisErrorCode(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      return ((await ctx.json()) as { error?: string }).error ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Antwort der Edge Function dsb-plan: HTML-Seiten der Pläne aus DSBmobile. */
export interface DsbResponse {
  plans?: { title: string; html: string }[];
  updated?: string | null;
  /** Was DSBmobile angeboten hat und was davon geladen wurde (zur Fehlersuche) */
  menu?: { title: string; host: string; file: string; loaded: boolean }[];
}

export const DSB_ERRORS: Record<string, string> = {
  login_failed: 'Anmeldung bei DSBmobile abgelehnt. Prüfe Benutzer-ID und Passwort der Schule.',
  dsb_unavailable: 'DSBmobile antwortet gerade nicht wie erwartet. Versuche es später noch einmal.',
  bad_request: 'Bitte Benutzer-ID und Passwort von DSBmobile eingeben.',
  rate_limited: 'Zu viele Abrufe in kurzer Zeit. Warte ein paar Minuten und versuche es dann noch einmal.',
  not_allowed: 'Dein Konto ist noch nicht freigegeben.',
  unauthorized: 'Bitte melde dich neu an.',
};

/** Vertretungen für dich aus den Plänen der ganzen Schule: nur passende Stufe und eigene Stunden (siehe forStudent). */
export function dsbSubstitutions(data: DsbResponse, timetable: Timetable | null): SubstitutionEntry[] {
  const all = (data.plans ?? []).flatMap((p) => parseUntisPlan(p.html));
  return forStudent(all, timetable);
}

/** Sieht mindestens eine Seite wie ein Untis-Plan aus (oder gibt es gar keine Seite)? Sonst weiß die App nicht, was der Plan sagt. */
export function dsbRecognized(data: DsbResponse): boolean {
  const plans = data.plans ?? [];
  return plans.length === 0 || plans.some((p) => /mon_title|mon_list/.test(p.html));
}

/** Fehlstunden aus der Anwesenheitstabelle von Lanis, null wenn nichts Lesbares da ist. */
export function readAbsences(html: string | null | undefined): AbsenceReport | null {
  return html ? parseAbsences(extractAbsenceTable(html) ?? html) : null;
}

/** Klausur aus einem Lanis-Eintrag. Bei einer schon importierten Klausur ändert sich nur das Datum und das Fach. */
export function buildExam(item: ImportItem, subjectId: string, subjects: Pick<Subject, 'id' | 'name'>[]): Exam {
  if (item.existing) return { ...item.existing, date: item.lanis.date, subjectId };
  const subject = subjects.find((s) => s.id === subjectId);
  return {
    id: uid(),
    subjectId,
    title: `Klausur ${subject?.name ?? item.lanis.abbr}`,
    date: item.lanis.date,
    priorityManual: null,
    totalHoursManual: null,
    startDaysManual: null,
    externalId: item.lanis.externalId,
  };
}

/**
 * Übernimmt eine Lanis-Antwort ohne Rückfrage (automatische Aktualisierung):
 * Stundenplan und Vertretungen ersetzen den alten Stand, neue Klausuren mit passendem Fach werden angelegt,
 * bei bekannten Klausuren ändert sich nur ein verschobenes Datum. Eigene Werte bleiben unberührt.
 */
export function applyLanis(
  data: LanisResponse,
  ctx: { subjects: Subject[]; exams: Exam[]; dispatch: (a: Action) => void },
): { exams: number; timetable: boolean; substitutions: boolean; absences: boolean } {
  const at = new Date().toISOString();
  let timetable = false;
  let substitutions = false;
  let absences = false;
  let exams = 0;
  if (data.timetableHtml) {
    const tt = parseTimetable(data.timetableHtml);
    if (tt.lessons.length > 0) {
      ctx.dispatch({ type: 'setTimetable', timetable: tt, at });
      timetable = true;
    }
  }
  if (data.substitutions) {
    ctx.dispatch({ type: 'setSubstitutions', substitutions: data.substitutions.flatMap((d) => parseSubstitutions(d.date, d.raw)), at });
    substitutions = true;
  }
  const report = readAbsences(data.absencesHtml);
  if (report) {
    ctx.dispatch({ type: 'setAbsences', absences: report, at });
    absences = true;
  }
  if (data.events) {
    for (const item of planImport(data.events, ctx.subjects, ctx.exams, toIsoDate(new Date()))) {
      if (item.status === 'known' || !item.subjectId) continue;
      ctx.dispatch({ type: 'upsertExam', exam: buildExam(item, item.subjectId, ctx.subjects) });
      exams++;
    }
  }
  return { exams, timetable, substitutions, absences };
}
