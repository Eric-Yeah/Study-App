import type { Role, Scope, Subject } from './types';

/**
 * Schule oder Studium. Der Modus kommt aus der Rolle im Profil (`student_university` ist Studium) und bestimmt,
 * welche Fächer, Begriffe und Bereiche die Oberfläche zeigt. Die Daten beider Seiten bleiben erhalten.
 */
export type AppMode = 'school' | 'university';

export function appMode(role: Role | null | undefined): AppMode {
  return role === 'student_university' ? 'university' : 'school';
}

export function roleFor(mode: AppMode): Role {
  return mode === 'university' ? 'student_university' : 'student_school';
}

export function scopeFor(mode: AppMode): Scope {
  return mode === 'university' ? 'uni' : 'school';
}

export function subjectScope(s: Pick<Subject, 'scope'>): Scope {
  return s.scope ?? 'school';
}

/** Die Fächer (Module) des Modus. */
export function subjectsInMode<T extends Pick<Subject, 'scope'>>(subjects: T[], mode: AppMode): T[] {
  const scope = scopeFor(mode);
  return subjects.filter((s) => subjectScope(s) === scope);
}

/** Ids der Fächer des anderen Modus: alles, was daran hängt, bleibt in der Oberfläche verborgen. */
export function hiddenSubjectIds(subjects: Pick<Subject, 'id' | 'scope'>[], mode: AppMode): Set<string> {
  const scope = scopeFor(mode);
  return new Set(subjects.filter((s) => subjectScope(s) !== scope).map((s) => s.id));
}

/** Ein Eintrag ohne Fach gehört zu beiden Modi, einer mit verstecktem Fach zu keinem von beiden sichtbaren. */
export function visibleBySubject<T extends { subjectId: string | null }>(items: T[], hidden: ReadonlySet<string>): T[] {
  return hidden.size === 0 ? items : items.filter((x) => x.subjectId === null || !hidden.has(x.subjectId));
}

/** Begriffe, die sich je Modus unterscheiden. Eine Stelle, damit Schule und Studium nicht in der Oberfläche verstreut sind. */
export interface Terms {
  subject: string;
  subjects: string;
  subjectOf: string; // „des Fachs“, „des Moduls“
  exam: string;
  exams: string;
  nextExam: string;
  noExam: string;
  newExam: string;
  homework: string;
  gradesArea: string;
}

const SCHOOL: Terms = {
  subject: 'Fach',
  subjects: 'Fächer',
  subjectOf: 'des Fachs',
  exam: 'Klausur',
  exams: 'Klausuren',
  nextExam: 'Nächste Klausur',
  noExam: 'Keine Klausur geplant',
  newExam: 'Klausur anlegen',
  homework: 'Hausaufgaben',
  gradesArea: 'Noten',
};

const UNIVERSITY: Terms = {
  subject: 'Modul',
  subjects: 'Module',
  subjectOf: 'des Moduls',
  exam: 'Prüfung',
  exams: 'Prüfungen',
  nextExam: 'Nächste Prüfung',
  noExam: 'Keine Prüfung geplant',
  newExam: 'Prüfung anlegen',
  homework: 'Aufgaben',
  gradesArea: 'Studium',
};

export function termsFor(mode: AppMode): Terms {
  return mode === 'university' ? UNIVERSITY : SCHOOL;
}
