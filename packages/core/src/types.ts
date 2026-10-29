import type { Language } from './languages';

export type Role = 'student_school' | 'student_university' | 'other';
export type Stage = 'E' | 'Q1' | 'Q2' | 'Q3' | 'Q4';

/** Status eines Fachs. Leistungskurse und Prüfungsfächer bleiben immer 'active'. */
export type SubjectStatus = 'active' | 'drop_q3' | 'dropped';

/** Fachtyp: bestimmt, wie gelernt wird, nicht wie wichtig das Fach ist. */
export type SubjectType = 'problems' | 'knowledge' | 'writing';

export interface Subject {
  id: string;
  name: string;
  color: string;
  isAdvanced: boolean; // Leistungskurs
  isExamSubject: boolean; // Prüfungsfach
  status: SubjectStatus;
  type: SubjectType;
  points: number | null; // 0-15, null: noch keine Note oder bewusst nicht einbezogen
  difficulty: number; // 1-5
  language: Language; // Unterrichtssprache, bestimmt die Sprache der KI-Zusammenfassungen und -Karten
  /** Schule oder Studium. Fehlt das Feld, gilt 'school'. Die App zeigt immer nur die Fächer des eingestellten Modus. */
  scope?: Scope;
  /** Nur Studium (Modul): Leistungspunkte (ECTS), null: nicht angegeben */
  ects?: number | null;
  /** Nur Studium: Fachsemester, in dem das Modul belegt wird, null: nicht angegeben */
  semester?: number | null;
  /** Nur Studium: Pflichtmodul (true) oder Wahlmodul (false) */
  required?: boolean;
  /** Nur Studium: Dozentin oder Dozent */
  lecturer?: string;
}

/** Schule (Lanis, Abitur) oder Studium. Die Daten beider Seiten bleiben erhalten, die Oberfläche zeigt eine. */
export type Scope = 'school' | 'uni';

/** Art einer Prüfungsleistung im Studium. */
export type ExamKind = 'written' | 'oral' | 'paper' | 'presentation' | 'project' | 'testat' | 'other';

export interface Exam {
  id: string;
  subjectId: string;
  title: string;
  date: string; // YYYY-MM-DD
  priorityManual: number | null;
  totalHoursManual: number | null;
  startDaysManual: number | null;
  /** Herkunft bei importierten Klausuren (Lanis-Id), damit ein erneuter Import nichts doppelt anlegt. */
  externalId?: string | null;
  /** Letztes Datum dieser Klausur im Lanis-Kalender. Weicht `date` davon ab, hat der Nutzer sie selbst verlegt und das Datum hat Vorrang. */
  lanisDate?: string | null;
  /** Lanis-Datum, das die App zugunsten des eigenen Termins ignoriert hat und über das noch ein Hinweis aussteht. */
  lanisNotice?: string | null;
  /** Lanis-Datum, über das der Nutzer schon informiert wurde (damit der Hinweis nur einmal kommt). */
  lanisAck?: string | null;
  /** Nur Studium: Art der Prüfung. Fehlt das Feld, gilt 'written'. */
  kind?: ExamKind;
  /** Nur Studium: der wievielte Versuch (1 bis 3), Standard 1 */
  attempt?: number;
  /** Nur Studium: Freiversuch (fällt der Versuch durch, zählt er nicht) */
  freeAttempt?: boolean;
  /** Nur Studium: letzter Tag für die Anmeldung zur Prüfung (YYYY-MM-DD) */
  registerBy?: string | null;
  /** Nur Studium: letzter Tag für die Abmeldung (YYYY-MM-DD) */
  withdrawBy?: string | null;
  /** Nur Studium: zählt die Prüfung für die Note? false bei Studienleistungen und Testaten. Standard true */
  graded?: boolean;
}

export interface PlanSettings {
  freeDaysPerWeek: 0 | 1 | 2;
  dailyLimitMin: number;
}

export type DayKind = 'study' | 'review' | 'free' | 'exam' | 'none';
