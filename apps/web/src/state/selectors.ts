import {
  activeDaysOf,
  addDays,
  carriedTasks,
  expectedMinutesBeforeToday,
  latestLoadRatio,
  manualTrainingLoad,
  planAll,
  planExam,
  plannedMinutesOn,
  quickRound,
  realityCheck,
  recommendFocus,
  streakOf,
  toIsoDate,
  weekStrip,
  type CombinedPlan,
  type Exam,
  type ExamPlan,
  type FocusRecommendation,
  type QuickRound,
  type RealityCheck,
  type StreakResult,
  type Subject,
  type WeekData,
} from '@study/core';
import type { AppState, Checkin, FitnessDay, FocusSession } from './store';

export interface ExamWithPlan {
  exam: Exam;
  subject: Subject;
  plan: ExamPlan;
}

export function examsWithPlans(state: AppState, today = new Date()): ExamWithPlan[] {
  return state.exams
    .map((exam) => {
      const subject = state.subjects.find((s) => s.id === exam.subjectId);
      if (!subject) return null;
      return { exam, subject, plan: planExam(subject, exam, state.plan, today) };
    })
    .filter((x): x is ExamWithPlan => x !== null)
    .sort((a, b) => a.exam.date.localeCompare(b.exam.date));
}

export function upcoming(list: ExamWithPlan[]): ExamWithPlan[] {
  return list.filter((x) => x.plan.daysLeft >= 0);
}

/** Gemeinsamer Plan über alle kommenden Klausuren, mit Ausfällen und bereits gelernter Zeit. */
export function combinedPlan(state: AppState, list: ExamWithPlan[], today = new Date()): CombinedPlan {
  const iso = toIsoDate(today);
  const inputs = list
    .filter((x) => x.plan.hasPlan && x.plan.totalHours.value > 0 && x.plan.daysLeft > 0)
    .map((x) => {
      const startDate = addDays(x.exam.date, -x.plan.startDays.value);
      const reviewDates = new Set<string>();
      x.plan.timeline.forEach((kind, t) => {
        if (kind === 'review') reviewDates.add(addDays(startDate, t));
      });
      return {
        examId: x.exam.id,
        examDate: x.exam.date,
        startDate,
        totalMin: Math.round(x.plan.totalHours.value * 60),
        learnedBeforeTodayMin: Math.max(
          0,
          learnedForExam(state.sessions, x) - learnedMinutesOn(state.sessions, iso, x.subject.id),
        ),
        reviewDates,
      };
    });
  return planAll(inputs, {
    today: iso,
    dailyLimitMin: state.plan.dailyLimitMin,
    freeDaysPerWeek: state.plan.freeDaysPerWeek,
    overrides: Object.fromEntries(state.dayOverrides.map((o) => [o.date, o.capacityMin])),
  });
}

/** Geplante Blöcke eines Tages mit Klausur und Fach. */
export function blocksForDate(
  plan: CombinedPlan,
  list: ExamWithPlan[],
  date: string,
): { item: ExamWithPlan; minutes: number; kind: 'study' | 'review' }[] {
  const day = plan.days.find((d) => d.date === date);
  if (!day) return [];
  return day.blocks
    .map((b) => ({ item: list.find((x) => x.exam.id === b.examId), minutes: b.minutes, kind: b.kind }))
    .filter((x): x is { item: ExamWithPlan; minutes: number; kind: 'study' | 'review' } => Boolean(x.item));
}

/** Soll gegen Ist bis gestern für eine Klausur. */
export function realityFor(state: AppState, item: ExamWithPlan, today = new Date()): RealityCheck {
  const iso = toIsoDate(today);
  const learned = Math.max(0, learnedForExam(state.sessions, item) - learnedMinutesOn(state.sessions, iso, item.subject.id));
  return realityCheck(expectedMinutesBeforeToday(item.plan), learned);
}

export function topicsOf(state: AppState, examId: string) {
  const list = state.topics.filter((t) => t.examId === examId);
  return { list, done: list.filter((t) => t.done).length, total: list.length };
}

export function learnedMinutesOn(sessions: FocusSession[], date: string, subjectId?: string): number {
  return sessions
    .filter((s) => toIsoDate(new Date(s.endedAt)) === date && (!subjectId || s.subjectId === subjectId))
    .reduce((sum, s) => sum + s.minutes, 0);
}

/** Gelernte Minuten für ein Fach seit dem Starttag einer Klausur. */
export function learnedForExam(sessions: FocusSession[], item: ExamWithPlan): number {
  const [y, m, d] = item.exam.date.split('-').map(Number);
  const examDay = new Date(y, m - 1, d);
  const start = new Date(examDay);
  start.setDate(start.getDate() - item.plan.startDays.value);
  const end = new Date(examDay);
  end.setDate(end.getDate() + 1);
  return sessions
    .filter((s) => s.subjectId === item.subject.id && s.endedAt >= start.getTime() && s.endedAt < end.getTime())
    .reduce((sum, s) => sum + s.minutes, 0);
}

export function checkinFor(checkins: Checkin[], date: string): Checkin {
  return (
    checkins.find((c) => c.date === date) ?? {
      date,
      energy: null,
      sleepHours: null,
      trainingSessions: null,
      trainingMinutes: null,
      trainingRpe: null,
    }
  );
}

/** Schlaf an einem Tag: Daten aus Overload gehen vor, sonst die Eingabe von Hand. */
export function sleepOn(
  state: Pick<AppState, 'checkins' | 'fitness'>,
  date: string,
): { hours: number | null; source: 'overload' | 'manual' | null } {
  const fit = state.fitness.find((f) => f.date === date);
  if (fit && fit.sleepHours !== null) return { hours: fit.sleepHours, source: 'overload' };
  const h = checkinFor(state.checkins, date).sleepHours;
  return { hours: h, source: h !== null ? 'manual' : null };
}

/** Training an einem Tag: Daten aus Overload gehen vor, sonst die Eingabe von Hand. */
export function trainingOn(
  state: Pick<AppState, 'checkins' | 'fitness'>,
  date: string,
): { sessions: number | null; minutes: number | null; source: 'overload' | 'manual' | null; kinds: string[] } {
  const fit: FitnessDay | undefined = state.fitness.find((f) => f.date === date);
  if (fit) return { sessions: fit.sessions, minutes: fit.minutes, source: 'overload', kinds: fit.kinds };
  const c = checkinFor(state.checkins, date);
  const has = c.trainingSessions !== null || c.trainingMinutes !== null;
  return { sessions: c.trainingSessions, minutes: c.trainingMinutes, source: has ? 'manual' : null, kinds: [] };
}

/**
 * Belastung des Trainings an einem Tag (Dauer mal Anstrengung). Aus Overload, sonst aus der Eingabe von Hand: Dauer und Anstrengung
 * (ohne Angabe schätzt die App eine mittlere). null, wenn es kein Training gibt oder keine Dauer bekannt ist.
 * `set` heißt: die Anstrengung hat jemand eingestellt (in Overload oder hier), sonst ist sie geschätzt.
 */
export function trainingLoadOn(
  state: Pick<AppState, 'checkins' | 'fitness'>,
  date: string,
): { load: number | null; rpe: number | null; set: boolean; source: 'overload' | 'manual' | null } {
  const fit: FitnessDay | undefined = state.fitness.find((f) => f.date === date);
  if (fit && fit.load !== null) return { load: fit.load, rpe: fit.rpe, set: fit.rpeSet === true, source: 'overload' };
  const t = trainingOn(state, date);
  if (t.source === 'overload') return { load: null, rpe: null, set: false, source: 'overload' }; // ältere Overload-Version ohne Belastung
  const manual = t.source === 'manual' ? manualTrainingLoad(t.sessions, t.minutes, checkinFor(state.checkins, date).trainingRpe) : null;
  return manual ? { ...manual, source: 'manual' } : { load: null, rpe: null, set: false, source: t.source };
}

/** 7:28-Verhältnis aus Overload für diesen Tag, siehe latestLoadRatio. */
export const loadRatioOn = (state: Pick<AppState, 'fitness'>, date: string) => latestLoadRatio(state.fitness, date);

/**
 * Rohdaten für den Wochenrückblick. Geplant ist der Grundplan der Klausuren (ohne Ausfälle und Verschiebungen),
 * damit auch vergangene Tage verglichen werden können.
 */
export function weekReviewData(state: AppState, anyDayOfWeek: string, today = new Date()): WeekData {
  const todayIso = toIsoDate(today);
  const [y, m, d] = anyDayOfWeek.split('-').map(Number);
  const first = new Date(y, m - 1, d);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const dates = Array.from({ length: 7 }, (_, i) => toIsoDate(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i)));
  const list = examsWithPlans(state, today);
  return {
    weekStart: dates[0],
    today: todayIso,
    subjects: state.subjects.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    sessions: state.sessions.map((s) => ({ date: toIsoDate(new Date(s.endedAt)), subjectId: s.subjectId, minutes: s.minutes })),
    planned: list
      .filter((x) => x.plan.hasPlan)
      .flatMap((x) =>
        dates
          .map((date) => ({ date, subjectId: x.subject.id, minutes: plannedMinutesOn(x.plan, x.exam.date, date) }))
          .filter((p) => p.minutes > 0),
      ),
    energy: dates.map((date) => ({ date, value: checkinFor(state.checkins, date).energy })),
    sleep: dates.map((date) => ({ date, hours: sleepOn(state, date).hours })),
    training: dates.map((date) => {
      const t = trainingOn(state, date);
      return { date, sessions: t.sessions, minutes: t.minutes };
    }),
    tasks: state.tasks.map((t) => ({ date: t.date, done: t.done })),
    noteDates: state.notes.map((n) => n.lessonDate),
    cardReviewDates: state.cards.flatMap((c) => (c.lastReviewed ? [c.lastReviewed] : [])),
    exams: state.exams.map((e) => ({ date: e.date, title: e.title || state.subjects.find((s) => s.id === e.subjectId)?.name || 'Klausur', subjectId: e.subjectId })),
  };
}

/** Fokuszeit, geübte Karten und erledigte Aufgaben je Tag, daraus die Tage mit Aktivität (Serie). */
export function activeDaysFor(state: AppState): { active: Set<string>; learnedByDate: Record<string, number>; cardsByDate: Record<string, number>; tasksDoneByDate: Record<string, number> } {
  const learnedByDate: Record<string, number> = {};
  for (const s of state.sessions) {
    const d = toIsoDate(new Date(s.endedAt));
    learnedByDate[d] = (learnedByDate[d] ?? 0) + s.minutes;
  }
  const cardsByDate: Record<string, number> = {};
  for (const c of state.cards) if (c.lastReviewed) cardsByDate[c.lastReviewed] = (cardsByDate[c.lastReviewed] ?? 0) + 1;
  const tasksDoneByDate: Record<string, number> = {};
  for (const t of state.tasks) if (t.done) tasksDoneByDate[t.date] = (tasksDoneByDate[t.date] ?? 0) + 1;
  return { active: activeDaysOf({ learnedByDate, cardsByDate, tasksDoneByDate }), learnedByDate, cardsByDate, tasksDoneByDate };
}

/** Tage, die der Nutzer als "fällt aus" markiert hat: sie brechen die Serie nicht. */
export const pausedDaysOf = (state: AppState): Set<string> => new Set(state.dayOverrides.filter((o) => o.capacityMin === 0).map((o) => o.date));

export function streakFor(state: AppState, today = new Date()): StreakResult {
  return streakOf({ today: toIsoDate(today), activeDays: activeDaysFor(state).active, pausedDays: pausedDaysOf(state) });
}

/** Montag bis Sonntag der laufenden Woche für den Wochenstreifen auf Heute. */
export function stripFor(state: AppState, list: ExamWithPlan[], today = new Date()) {
  const iso = toIsoDate(today);
  const a = activeDaysFor(state);
  const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const plannedByDate: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const date = toIsoDate(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
    const min = list.filter((x) => x.plan.hasPlan).reduce((s, x) => s + plannedMinutesOn(x.plan, x.exam.date, date), 0);
    if (min > 0) plannedByDate[date] = min;
  }
  return weekStrip({ today: iso, activeDays: a.active, pausedDays: pausedDaysOf(state), learnedByDate: a.learnedByDate, plannedByDate });
}

/** Welches Fach jetzt dran ist (Tagesplan, Rest nach der heute gelernten Zeit, siehe recommendFocus). */
export function focusRecommendation(
  state: AppState,
  list: ExamWithPlan[],
  plan: CombinedPlan,
  lastSubjectId: string | null,
  today = new Date(),
): FocusRecommendation {
  const iso = toIsoDate(today);
  const learnedBySubject: Record<string, number> = {};
  for (const s of state.sessions) {
    if (s.subjectId && toIsoDate(new Date(s.endedAt)) === iso) learnedBySubject[s.subjectId] = (learnedBySubject[s.subjectId] ?? 0) + s.minutes;
  }
  const allowed = new Set(state.subjects.filter((s) => s.status !== 'dropped' || s.isAdvanced || s.isExamSubject).map((s) => s.id));
  return recommendFocus({
    blocks: blocksForDate(plan, list, iso).map((b) => ({ subjectId: b.item.subject.id, examId: b.item.exam.id, minutes: b.minutes })),
    learnedBySubject,
    exams: list.map((x) => ({
      examId: x.exam.id,
      subjectId: x.subject.id,
      daysLeft: x.plan.daysLeft,
      hasPlan: x.plan.hasPlan && x.plan.totalHours.value > 0,
      behind: ['behind', 'far_behind'].includes(realityFor(state, x, today).status),
    })),
    lastSubjectId,
    allowed,
  });
}

export const cardRound = (state: AppState, today = new Date()): QuickRound => quickRound(state.cards, toIsoDate(today));

/** Offene Aufgaben der letzten Tage, die auf Heute noch einmal auftauchen. */
export const carriedOver = (state: AppState, today = new Date()) => carriedTasks(state.tasks, toIsoDate(today));
