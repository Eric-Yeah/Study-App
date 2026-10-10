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
}

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
}

export interface PlanSettings {
  freeDaysPerWeek: 0 | 1 | 2;
  dailyLimitMin: number;
}

export type DayKind = 'study' | 'review' | 'free' | 'exam' | 'none';
