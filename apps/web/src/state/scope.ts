import { appMode, hiddenSubjectIds, visibleBySubject, type AppMode } from '@study/core';
import type { AppState } from './store';

/**
 * Die Ansicht auf den Zustand für den eingestellten Modus (Schule oder Studium): Fächer des anderen Modus und alles, was daran hängt,
 * bleiben verborgen. Der Zustand selbst behält alles (der Reducer und die Datenbank sehen beide Seiten), nur die Oberfläche bekommt
 * diese Ansicht. Gibt es nichts zu verbergen, ist es derselbe Zustand.
 */
export function modeOf(state: Pick<AppState, 'profile'>): AppMode {
  return appMode(state.profile?.role);
}

export function scopeState(state: AppState): AppState {
  const mode = modeOf(state);
  const hidden = hiddenSubjectIds(state.subjects, mode);
  // Im Studium gibt es kein Lanis: Stundenplan, Vertretungen, Fehlstunden und Hausaufgaben von dort bleiben verborgen
  const noSchool: Pick<AppState, 'timetable' | 'timetableAt' | 'substitutions' | 'substitutionsAt' | 'absences' | 'absencesAt' | 'homework' | 'homeworkAt'> | null =
    mode === 'university'
      ? { timetable: null, timetableAt: null, substitutions: [], substitutionsAt: null, absences: null, absencesAt: null, homework: null, homeworkAt: null }
      : null;
  if (hidden.size === 0) return noSchool ? { ...state, ...noSchool } : state;
  const exams = state.exams.filter((e) => !hidden.has(e.subjectId));
  const examIds = new Set(exams.map((e) => e.id));
  return {
    ...state,
    ...noSchool,
    subjects: state.subjects.filter((s) => !hidden.has(s.id)),
    exams,
    topics: state.topics.filter((t) => examIds.has(t.examId)),
    sessions: visibleBySubject(state.sessions, hidden),
    tasks: visibleBySubject(state.tasks, hidden),
    notes: visibleBySubject(state.notes, hidden),
    cards: visibleBySubject(state.cards, hidden),
    grades: state.grades.filter((g) => !hidden.has(g.subjectId)),
    results: state.results.filter((r) => !hidden.has(r.subjectId)),
    events: visibleBySubject(state.events, hidden),
    examReviews: visibleBySubject(state.examReviews, hidden),
    practiceExams: visibleBySubject(state.practiceExams, hidden),
    rubrics: state.rubrics.filter((r) => !hidden.has(r.subjectId)),
    taskStyles: state.taskStyles.filter((t) => !hidden.has(t.subjectId)),
  };
}
