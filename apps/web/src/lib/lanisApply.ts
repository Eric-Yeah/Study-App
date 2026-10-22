import {
  buildHomework,
  diagnoseBooks,
  planHomework,
  dsbForStudent,
  extractAbsenceTable,
  mergeSubstitutions,
  parseAbsences,
  parseSubstitutions,
  parseTimetable,
  planImport,
  readDsbPlans,
  toIsoDate,
  type AbsenceReport,
  type Exam,
  type HomeworkSnapshot,
  type DsbRead,
  type ImportItem,
  type LanisEvent,
  type Subject,
  type SubstitutionEntry,
  type Timetable,
} from '@study/core';
import type { Action, Task } from '../state/store';
import { uid } from './format';

export interface LanisResponse {
  events?: LanisEvent[];
  timetableHtml?: string | null;
  substitutions?: { date: string; raw: unknown }[];
  absencesHtml?: string | null;
  /** Kursseiten aus "Mein Unterricht" (von der Überschrift bis zum Ende der Historie) */
  courseHtml?: { book: string; html: string }[];
  /** Angeforderte Anhänge (Inhalt als base64) und die, die nicht geladen werden konnten */
  files?: { book: string; entry: string; name: string; type: string; size: number; base64: string }[];
  failed?: { book: string; entry: string; name: string; error: string }[];
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
  /** Kennung des Menüs: ändert sich, wenn DSBmobile etwas Neues veröffentlicht */
  version?: string;
  /** Neuestes Veröffentlichungsdatum im Menü ("22.10.2026 18:35") */
  published?: string | null;
  /** Nicht alle Plan-Seiten waren ladbar */
  partial?: boolean;
  failed?: number;
  onlyMenu?: boolean;
}

export const DSB_ERRORS: Record<string, string> = {
  login_failed: 'Anmeldung bei DSBmobile abgelehnt. Prüfe Benutzer-ID und Passwort der Schule.',
  dsb_unavailable: 'DSBmobile antwortet gerade nicht wie erwartet. Versuche es später noch einmal.',
  bad_request: 'Bitte Benutzer-ID und Passwort von DSBmobile eingeben.',
  rate_limited: 'Zu viele Abrufe in kurzer Zeit. Warte ein paar Minuten und versuche es dann noch einmal.',
  not_allowed: 'Dein Konto ist noch nicht freigegeben.',
  unauthorized: 'Bitte melde dich neu an.',
};

/**
 * Neuer Stand der Vertretungen aus einer Antwort von dsb-plan. next ist null, wenn der alte Stand bleiben muss
 * (nichts Lesbares, kein gültiger Tag ab heute); message sagt dann warum, oder weist bei einer unvollständigen Antwort darauf hin.
 * Einzelne fehlende Seiten ersetzen nie den alten Stand der betroffenen Tage (siehe mergeSubstitutions).
 */
export function applyDsbPlans(
  data: DsbResponse,
  timetable: Timetable | null,
  previous: SubstitutionEntry[],
  now: Date = new Date(),
): { read: DsbRead; next: SubstitutionEntry[] | null; message: string | null } {
  const read = readDsbPlans((data.plans ?? []).map((p) => p.html), now);
  if (!read.usable) {
    const pages = (data.plans ?? []).length;
    const message =
      pages === 0
        ? 'DSBmobile hat gerade keinen Vertretungsplan veröffentlicht. Der alte Stand bleibt erhalten.'
        : read.tables.some((t) => t.problem === 'date_past' || t.problem === 'date_future' || t.problem === 'date_weekday' || t.problem === 'date_weekend' || t.problem === 'date_missing')
          ? 'Der Plan von DSBmobile hat kein gültiges Datum für heute oder später. Der alte Stand bleibt erhalten.'
          : 'Der Vertretungsplan hat einen Aufbau, den die App nicht sicher lesen kann. Der alte Stand bleibt erhalten.';
    return { read, next: null, message };
  }
  const partial = data.partial === true || read.incomplete.length > 0;
  const { mine } = dsbForStudent(read, timetable);
  const next = mergeSubstitutions(previous, mine, read, partial, toIsoDate(now));
  return {
    read,
    next,
    message: partial ? 'Nicht alle Seiten des Plans konnten geladen werden. Für die betroffenen Tage bleibt der alte Stand erhalten.' : null,
  };
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
  ctx: {
    subjects: Subject[];
    exams: Exam[];
    dispatch: (a: Action) => void;
    /** für Hausaufgaben: Stand, Aufgaben, Stundenplan und Konto (die Aufgaben bekommen daraus feste Ids) */
    homework?: HomeworkSnapshot | null;
    tasks?: Task[];
    timetable?: Timetable | null;
    userId?: string;
  },
): { exams: number; timetable: boolean; substitutions: boolean; absences: boolean; homework: 'ok' | 'unrecognized' | 'none'; newTasks: number } {
  const at = new Date().toISOString();
  let timetable = false;
  let freshTimetable: Timetable | null = null;
  let substitutions = false;
  let absences = false;
  let exams = 0;
  if (data.timetableHtml) {
    const tt = parseTimetable(data.timetableHtml);
    if (tt.lessons.length > 0) {
      ctx.dispatch({ type: 'setTimetable', timetable: tt, at });
      freshTimetable = tt;
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
  let homework: 'ok' | 'unrecognized' | 'none' = 'none';
  let newTasks = 0;
  if (data.courseHtml) {
    const pages = data.courseHtml.map((c) => c.html);
    // Erkennt die App keine einzige Zeile, bleibt der alte Stand (und eine Meldung weist darauf hin)
    if (diagnoseBooks(pages).entries === 0) homework = 'unrecognized';
    else {
      const today = toIsoDate(new Date());
      const items = buildHomework(pages, today);
      const plan = planHomework(items, {
        imported: ctx.homework?.imported ?? [],
        tasks: ctx.tasks ?? [],
        subjects: ctx.subjects,
        timetable: freshTimetable ?? ctx.timetable ?? null,
        today,
      });
      ctx.dispatch({ type: 'setHomework', homework: { items, imported: plan.imported }, at });
      for (const d of plan.add) {
        // feste Id aus Konto und Hausaufgabe: zwei Geräte, die gleichzeitig abrufen, legen dieselbe Aufgabe an, nicht zwei
        const id = ctx.userId ? `hw:${ctx.userId}:${d.externalId}` : uid();
        ctx.dispatch({ type: 'addTask', task: { id, title: d.title, subjectId: d.subjectId, minutes: null, date: d.date, done: false, externalId: d.externalId } });
      }
      for (const id of plan.complete) ctx.dispatch({ type: 'toggleTask', id });
      newTasks = plan.add.length;
      homework = 'ok';
    }
  }
  if (data.events) {
    for (const item of planImport(data.events, ctx.subjects, ctx.exams, toIsoDate(new Date()))) {
      if (item.status === 'known' || !item.subjectId) continue;
      ctx.dispatch({ type: 'upsertExam', exam: buildExam(item, item.subjectId, ctx.subjects) });
      exams++;
    }
  }
  return { exams, timetable, substitutions, absences, homework, newTasks };
}
