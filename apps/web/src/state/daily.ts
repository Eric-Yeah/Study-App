import {
  CONFIG,
  buildQueue,
  currentFreeSlot,
  eventFreeSlot,
  eventSubjectId,
  guessSubjectId,
  isFreeWeekday,
  nextUp,
  priorityBreakdown,
  subjectPriorityAuto,
  studyStreak,
  timeOf,
  toIsoDate,
  addDays,
  type FreeSlot,
  type NextUp,
  type StreakResult,
} from '@study/core';
import { blocksForDate, combinedPlan, examsWithPlans, type ExamWithPlan } from './selectors';
import { modeOf } from './scope';
import type { AppState } from './store';

export function minutesBySubject(state: Pick<AppState, 'sessions'>, iso: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of state.sessions) {
    if (toIsoDate(new Date(s.endedAt)) !== iso) continue;
    const key = s.subjectId ?? '';
    out[key] = (out[key] ?? 0) + s.minutes;
  }
  return out;
}

/** Offene Aufgaben von heute und der letzten Tage (nicht erledigte rutschen nicht mehr unbemerkt weg). */
export function openTasksFor(state: Pick<AppState, 'tasks'>, iso: string) {
  const from = addDays(iso, -CONFIG.daily.overdueTaskDays);
  return state.tasks.filter((t) => !t.done && t.date <= iso && t.date >= from).sort((a, b) => a.date.localeCompare(b.date));
}

/** Das, was jetzt dran ist (siehe nextUp in packages/core), samt Freistunde. blocks darf übergeben werden, wenn die Seite sie schon hat. */
export function nextUpFor(
  state: AppState,
  now: Date,
  given?: { list: ExamWithPlan[]; blocks: ReturnType<typeof blocksForDate> },
): { next: NextUp; slot: FreeSlot | null } {
  const iso = toIsoDate(now);
  const list = given?.list ?? examsWithPlans(state, now);
  const blocks = given?.blocks ?? blocksForDate(combinedPlan(state, list, now), list, iso);
  const uni = modeOf(state) === 'university';
  // Schule: Freistunde aus dem Lanis-Raster, Studium: Lücke zwischen Terminen im Stundenplan
  const slot = uni ? eventFreeSlot(state.events, now) : currentFreeSlot(state.timetable, iso, timeOf(now));
  const subjects = state.subjects.filter((s) => priorityBreakdown(s).status !== 'dropped');
  const next = nextUp({
    blocks: blocks.map((b) => ({ examId: b.item.exam.id, subjectId: b.item.subject.id, examDate: b.item.exam.date, plannedMin: b.minutes })),
    learnedBySubject: minutesBySubject(state, iso),
    dueCards: buildQueue(state.cards, iso).length,
    openTasks: openTasksFor(state, iso).map((t) => ({ id: t.id, title: t.title, subjectId: t.subjectId })),
    slot,
    focusMin: state.timer.focusMin,
    fallbackSubjectIds: [...subjects].sort((a, b) => subjectPriorityAuto(b) - subjectPriorityAuto(a)).map((s) => s.id),
  });
  return { next, slot };
}

/** Serie mit Gnade aus der Lernzeit je Tag; lernfreie Wochentage und Ausfalltage bremsen nicht. */
export function streakFor(state: AppState, now: Date): StreakResult {
  const minutesByDate: Record<string, number> = {};
  for (const s of state.sessions) {
    const d = toIsoDate(new Date(s.endedAt));
    minutesByDate[d] = (minutesByDate[d] ?? 0) + s.minutes;
  }
  const off = new Set(state.dayOverrides.filter((o) => o.capacityMin === 0).map((o) => o.date));
  return studyStreak({
    minutesByDate,
    today: toIsoDate(now),
    isNeutral: (d) => off.has(d) || isFreeWeekday(d, state.plan.freeDaysPerWeek),
  });
}

/** Fach, das gerade am wahrscheinlichsten gemeint ist: laufende Stunde, sonst zuletzt gelernt, sonst null. */
export function likelySubjectId(state: AppState, now: Date): string | null {
  const iso = toIsoDate(now);
  const fromLesson = modeOf(state) === 'university' ? eventSubjectId(state.events, now) : guessSubjectId(state.timetable, state.subjects, iso, timeOf(now));
  if (fromLesson) return fromLesson;
  const last = [...state.sessions].reverse().find((s) => s.subjectId && state.subjects.some((x) => x.id === s.subjectId));
  return last?.subjectId ?? null;
}
