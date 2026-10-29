import { CONFIG } from './config';
import type { Exam, Subject } from './types';

/**
 * Fristen im Studium: Rückmeldung, Prüfungsanmeldung, BAföG, Abgaben. Die App prüft keine Regeln der Hochschule, sie erinnert
 * an die Termine, die der Nutzer einträgt (und an Anmelde- und Abmeldefristen der Prüfungen). Reine Funktionen.
 */

export type DeadlineKind = 'reregister' | 'exam_register' | 'exam_withdraw' | 'bafoeg' | 'submission' | 'other';

export const DEADLINE_KINDS: DeadlineKind[] = ['reregister', 'exam_register', 'exam_withdraw', 'bafoeg', 'submission', 'other'];

export const DEADLINE_LABELS: Record<DeadlineKind, string> = {
  reregister: 'Rückmeldung',
  exam_register: 'Prüfungsanmeldung',
  exam_withdraw: 'Prüfung abmelden',
  bafoeg: 'BAföG',
  submission: 'Abgabe',
  other: 'Sonstiges',
};

export function isDeadlineKind(v: unknown): v is DeadlineKind {
  return typeof v === 'string' && (DEADLINE_KINDS as string[]).includes(v);
}

export interface Deadline {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  kind: DeadlineKind;
  done: boolean;
  /** So viele Tage vorher kommt eine Erinnerung */
  remindDays: number;
}

/** Vorschläge zum Antippen. Die Daten kennt nur die Hochschule oder das Amt, darum steht hier kein Datum. */
export const DEADLINE_TEMPLATES: { title: string; kind: DeadlineKind; hint: string }[] = [
  { title: 'Rückmeldung zum nächsten Semester', kind: 'reregister', hint: 'Frist und Semesterbeitrag stehen bei deiner Hochschule.' },
  { title: 'Prüfungsanmeldung', kind: 'exam_register', hint: 'Meist im Campus-System, die Frist steht in der Prüfungsordnung.' },
  { title: 'BAföG-Folgeantrag stellen', kind: 'bafoeg', hint: 'Der Folgeantrag sollte rechtzeitig vor Ende des Bewilligungszeitraums beim Amt liegen (siehe Bescheid).' },
  { title: 'BAföG-Leistungsnachweis', kind: 'bafoeg', hint: 'Nachweis über deine Leistungen, Zeitpunkt laut Bescheid.' },
  { title: 'Hausarbeit abgeben', kind: 'submission', hint: 'Abgabetermin laut Dozent oder Prüfungsamt.' },
];

export interface DeadlineItem {
  id: string;
  title: string;
  date: string;
  kind: DeadlineKind;
  done: boolean;
  remindDays: number;
  /** Aus einer Prüfung abgeleitet (nicht als Frist gespeichert) */
  examId: string | null;
  daysLeft: number;
  /** überfällig, heute oder bald: zählt als dringend */
  urgent: boolean;
}

const MS_PER_DAY = 86_400_000;
function daysBetween(todayIso: string, iso: string): number {
  const a = todayIso.split('-').map(Number);
  const b = iso.split('-').map(Number);
  return Math.round((new Date(b[0], b[1] - 1, b[2]).getTime() - new Date(a[0], a[1] - 1, a[2]).getTime()) / MS_PER_DAY);
}

/**
 * Alle Fristen in einer Liste: die eingetragenen und die aus den Prüfungen (Anmeldung, Abmeldung). Erledigte Fristen stehen hinten,
 * sonst die nächsten zuerst. Fristen aus Prüfungen erscheinen nur, solange die Prüfung noch nicht stattgefunden hat.
 */
export function allDeadlines(
  deadlines: Deadline[],
  exams: Exam[],
  subjects: Pick<Subject, 'id' | 'name'>[],
  today: string,
  remindDays: number = CONFIG.study.defaultRemindDays,
): DeadlineItem[] {
  const items: DeadlineItem[] = deadlines.map((d) => ({
    id: d.id,
    title: d.title,
    date: d.date,
    kind: d.kind,
    done: d.done,
    remindDays: d.remindDays,
    examId: null,
    daysLeft: daysBetween(today, d.date),
    urgent: false,
  }));
  for (const e of exams) {
    if (e.date < today) continue;
    const name = subjects.find((s) => s.id === e.subjectId)?.name ?? 'Prüfung';
    const label = e.title || name;
    if (e.registerBy) {
      items.push({ id: `exam-reg:${e.id}`, title: `Anmeldung: ${label}`, date: e.registerBy, kind: 'exam_register', done: false, remindDays, examId: e.id, daysLeft: daysBetween(today, e.registerBy), urgent: false });
    }
    if (e.withdrawBy) {
      items.push({ id: `exam-wd:${e.id}`, title: `Abmeldefrist: ${label}`, date: e.withdrawBy, kind: 'exam_withdraw', done: false, remindDays, examId: e.id, daysLeft: daysBetween(today, e.withdrawBy), urgent: false });
    }
  }
  return items
    .map((i) => ({ ...i, urgent: !i.done && i.daysLeft <= Math.min(i.remindDays, 3) }))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** Offene Fristen, die überfällig sind oder in den nächsten `withinDays` Tagen anstehen. */
export function dueSoon(items: DeadlineItem[], withinDays: number): DeadlineItem[] {
  return items.filter((i) => !i.done && i.daysLeft <= withinDays);
}

/** Satz zu einer Frist: „heute“, „morgen“, „in 5 Tagen“, „seit 2 Tagen überfällig“. */
export function deadlineText(daysLeft: number): string {
  if (daysLeft === 0) return 'heute';
  if (daysLeft === 1) return 'morgen';
  if (daysLeft > 1) return `in ${daysLeft} Tagen`;
  return daysLeft === -1 ? 'seit gestern überfällig' : `seit ${-daysLeft} Tagen überfällig`;
}

/**
 * Hinweise zu Anmelde- und Abmeldefristen, die Prüfungen betreffen und die der Nutzer noch nicht eingetragen hat.
 * Nur Empfehlungen: Die App kennt die Fristen der Hochschule nicht.
 */
export function examsWithoutRegistration(exams: Exam[], today: string, withinDays = 90): Exam[] {
  return exams.filter((e) => e.date >= today && daysBetween(today, e.date) <= withinDays && !e.registerBy && (e.graded ?? true));
}
