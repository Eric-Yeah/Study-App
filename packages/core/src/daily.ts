/**
 * Alltag: was jetzt zu lernen ist (recommendFocus), Serie mit Gnade (streakOf), Wochenstreifen (weekStrip), kurze Kartenrunde (quickRound),
 * liegengebliebene Aufgaben (carriedTasks) und Tagesabschluss (dayWrapUp). Reine Funktionen ohne UI, alle Zahlen in CONFIG.daily.
 */
import { CONFIG } from './config';
import { buildQueue, isNewCard, type Flashcard } from './cards';
import { weekStart } from './notesView';
import { pushMinutes } from './pushPlan';
import { addDays } from './schedule';

/* ---------- Jetzt lernen ---------- */

export interface FocusBlock {
  subjectId: string;
  examId: string;
  minutes: number;
}

export interface FocusExam {
  examId: string;
  subjectId: string;
  daysLeft: number;
  hasPlan: boolean;
  behind: boolean;
}

export type FocusReason = 'planned' | 'done' | 'behind' | 'next_exam' | 'last' | 'none';

export interface FocusRecommendation {
  subjectId: string | null;
  examId: string | null;
  reason: FocusReason;
  plannedMin: number; // heute für dieses Fach geplant
  learnedMin: number; // heute für dieses Fach gelernt
  remainingMin: number; // geplant minus gelernt, mindestens 0
}

const none = (reason: FocusReason, subjectId: string | null = null, examId: string | null = null): FocusRecommendation => ({
  subjectId,
  examId,
  reason,
  plannedMin: 0,
  learnedMin: 0,
  remainingMin: 0,
});

/**
 * Welches Fach jetzt dran ist. Zuerst das Fach mit dem meisten offenen Rest laut Tagesplan (bei Gleichstand die nähere Klausur),
 * ist der Plan für heute erfüllt, steht "done" mit dem Fach des größten Blocks (zum Weitermachen). Ohne Blöcke heute zählt eine Klausur,
 * bei der man hinten liegt, dann die nächste Klausur mit Plan, dann das zuletzt benutzte Fach.
 */
export function recommendFocus(input: {
  blocks: readonly FocusBlock[];
  learnedBySubject: Readonly<Record<string, number>>;
  exams: readonly FocusExam[];
  lastSubjectId?: string | null;
  /** Fächer, die man wählen darf (abgewählte Fächer ohne Plan fallen weg). Fehlt die Angabe, gelten alle. */
  allowed?: ReadonlySet<string>;
}): FocusRecommendation {
  const ok = (id: string) => !input.allowed || input.allowed.has(id);
  const closest = (subjectId: string) =>
    input.exams.filter((e) => e.subjectId === subjectId && e.daysLeft >= 0).reduce((m, e) => Math.min(m, e.daysLeft), Infinity);

  const planned = new Map<string, number>();
  for (const b of input.blocks) if (ok(b.subjectId)) planned.set(b.subjectId, (planned.get(b.subjectId) ?? 0) + b.minutes);
  const rows = [...planned.entries()].map(([subjectId, plannedMin]) => {
    const learnedMin = input.learnedBySubject[subjectId] ?? 0;
    return { subjectId, plannedMin, learnedMin, remainingMin: Math.max(0, plannedMin - learnedMin), near: closest(subjectId) };
  });
  const examOf = (subjectId: string) => {
    const biggest = input.blocks.filter((b) => b.subjectId === subjectId).sort((a, b) => b.minutes - a.minutes)[0];
    return biggest?.examId ?? null;
  };

  const open = rows.filter((r) => r.remainingMin > 0).sort((a, b) => b.remainingMin - a.remainingMin || a.near - b.near);
  if (open[0]) return { ...open[0], reason: 'planned', examId: examOf(open[0].subjectId) };

  if (rows.length > 0) {
    const last = rows.find((r) => r.subjectId === input.lastSubjectId);
    const pick = last ?? [...rows].sort((a, b) => b.plannedMin - a.plannedMin)[0]!;
    return { ...pick, reason: 'done', examId: examOf(pick.subjectId) };
  }

  const upcoming = input.exams.filter((e) => e.daysLeft >= 0 && e.hasPlan && ok(e.subjectId)).sort((a, b) => a.daysLeft - b.daysLeft);
  const behind = upcoming.find((e) => e.behind);
  if (behind) return none('behind', behind.subjectId, behind.examId);
  if (upcoming[0]) return none('next_exam', upcoming[0].subjectId, upcoming[0].examId);
  if (input.lastSubjectId && ok(input.lastSubjectId)) return none('last', input.lastSubjectId);
  return none('none');
}

/* ---------- Serie mit Gnade ---------- */

export interface ActivityInput {
  learnedByDate: Readonly<Record<string, number>>; // Minuten Fokus je Tag
  cardsByDate: Readonly<Record<string, number>>; // geübte Karten je Tag
  tasksDoneByDate: Readonly<Record<string, number>>; // erledigte Aufgaben je Tag
}

/** Tage, an denen etwas getan wurde: genug Fokuszeit, genug Karten oder eine erledigte Aufgabe. */
export function activeDaysOf(input: ActivityInput, cfg = CONFIG.daily): Set<string> {
  const days = new Set<string>();
  for (const [d, m] of Object.entries(input.learnedByDate)) if (m >= cfg.streakMinMinutes) days.add(d);
  for (const [d, n] of Object.entries(input.cardsByDate)) if (n >= cfg.streakMinCards) days.add(d);
  for (const [d, n] of Object.entries(input.tasksDoneByDate)) if (n >= cfg.streakMinTasks) days.add(d);
  return days;
}

export interface StreakResult {
  current: number; // Tage mit Aktivität in Folge (verziehene Ausfalltage zählen nicht mit)
  best: number;
  todayDone: boolean;
  atRisk: boolean; // es gibt eine Serie, heute ist aber noch nichts passiert
  breakIfMissed: boolean; // fällt heute aus, reißt die Serie (der Gnadentag ist schon verbraucht)
  forgivenDay: string | null; // letzter verziehener Ausfalltag, wenn die Gnade noch "läuft"
}

/**
 * Serie mit Gnade: Ein einzelner Ausfalltag bricht die Serie nicht, der nächste Gnadentag kommt erst nach graceEveryDays Tagen
 * (zwei Ausfalltage hintereinander brechen sie immer). Tage in pausedDays (zum Beispiel "fällt aus") sind neutral. Der heutige Tag
 * ist noch offen und bricht nichts, solange er nicht vorbei ist.
 */
export function streakOf(input: { today: string; activeDays: ReadonlySet<string>; pausedDays?: ReadonlySet<string>; lookbackDays?: number }, cfg = CONFIG.daily): StreakResult {
  const look = input.lookbackDays ?? cfg.lookbackDays;
  const days = Array.from({ length: look + 1 }, (_, i) => addDays(input.today, i - look));
  const todayIdx = days.length - 1;

  const run = (todayMissed: boolean) => {
    let streak = 0;
    let best = 0;
    let lastForgive: number | null = null;
    for (let i = 0; i < days.length; i++) {
      const date = days[i]!;
      if (input.activeDays.has(date)) {
        streak++;
        best = Math.max(best, streak);
      } else if (input.pausedDays?.has(date)) {
        // neutral
      } else if (i === todayIdx && !todayMissed) {
        // heute ist noch offen
      } else if (lastForgive !== null && i - lastForgive < cfg.graceEveryDays) {
        streak = 0;
        lastForgive = null;
      } else if (streak > 0) {
        lastForgive = i;
      }
    }
    return { streak, best, lastForgive };
  };

  const now = run(false);
  const todayDone = input.activeDays.has(input.today);
  const ifMissed = todayDone ? now : run(true);
  return {
    current: now.streak,
    best: now.best,
    todayDone,
    atRisk: now.streak > 0 && !todayDone,
    breakIfMissed: now.streak > 0 && !todayDone && ifMissed.streak === 0,
    forgivenDay: now.lastForgive !== null && todayIdx - now.lastForgive < cfg.graceEveryDays ? days[now.lastForgive]! : null,
  };
}

/* ---------- Wochenstreifen ---------- */

export type StripState = 'done' | 'missed' | 'paused' | 'today' | 'future';

export interface StripDay {
  date: string;
  label: string; // Mo bis So
  state: StripState;
  learnedMin: number;
  plannedMin: number;
  isToday: boolean;
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Montag bis Sonntag der laufenden Woche: erledigt, verpasst, pausiert, heute oder noch offen. */
export function weekStrip(input: {
  today: string;
  activeDays: ReadonlySet<string>;
  pausedDays?: ReadonlySet<string>;
  learnedByDate: Readonly<Record<string, number>>;
  plannedByDate?: Readonly<Record<string, number>>;
}): { days: StripDay[]; learnedMin: number; plannedMin: number; activeCount: number } {
  const first = weekStart(input.today);
  const days: StripDay[] = WEEKDAYS.map((label, i) => {
    const date = addDays(first, i);
    const active = input.activeDays.has(date);
    const state: StripState = active ? 'done' : date > input.today ? 'future' : date === input.today ? 'today' : input.pausedDays?.has(date) ? 'paused' : 'missed';
    return { date, label, state, learnedMin: input.learnedByDate[date] ?? 0, plannedMin: input.plannedByDate?.[date] ?? 0, isToday: date === input.today };
  });
  return {
    days,
    learnedMin: days.reduce((s, d) => s + d.learnedMin, 0),
    plannedMin: days.reduce((s, d) => s + d.plannedMin, 0),
    activeCount: days.filter((d) => d.state === 'done').length,
  };
}

/* ---------- Kurze Kartenrunde ---------- */

export interface QuickRound {
  queue: Flashcard[];
  reviews: number;
  fresh: number;
  minutes: number; // Schätzung, mindestens 1
}

/** Eine kurze Runde für Heute: erst fällige Karten, dazu wenige neue. */
export function quickRound(cards: readonly Flashcard[], today: string, cfg = CONFIG.daily): QuickRound {
  const queue = buildQueue(cards, today, { max: cfg.quickRoundCards, maxNew: cfg.quickRoundNew });
  const fresh = queue.filter(isNewCard).length;
  return { queue, reviews: queue.length - fresh, fresh, minutes: queue.length === 0 ? 0 : Math.max(1, Math.ceil((queue.length * cfg.secondsPerCard) / 60)) };
}

/* ---------- Aufgaben von gestern ---------- */

/** Offene Aufgaben der letzten carryDays Tage vor heute, die älteste zuerst. */
export function carriedTasks<T extends { date: string; done: boolean }>(tasks: readonly T[], today: string, cfg = CONFIG.daily): T[] {
  const from = addDays(today, -cfg.carryDays);
  return tasks.filter((t) => !t.done && t.date < today && t.date >= from).sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- Tagesabschluss ---------- */

export type WrapLevel = 'great' | 'good' | 'some' | 'none' | 'free';

export interface WrapUp {
  level: WrapLevel;
  title: string;
  text: string;
}

/** Ein ehrlicher, freundlicher Rückblick auf den Tag. Er lobt, was war, und drängt zu nichts. */
export function dayWrapUp(input: {
  learnedMin: number;
  goalMin: number;
  tasksDone: number;
  cardsReviewed: number;
  streak: Pick<StreakResult, 'current' | 'todayDone'>;
}, cfg = CONFIG.daily): WrapUp {
  const { learnedMin, goalMin, tasksDone, cardsReviewed, streak } = input;
  const facts: string[] = [];
  if (learnedMin > 0) facts.push(`${pushMinutes(learnedMin)} gelernt`);
  if (cardsReviewed > 0) facts.push(`${cardsReviewed} ${cardsReviewed === 1 ? 'Karte' : 'Karten'} geübt`);
  if (tasksDone > 0) facts.push(`${tasksDone} ${tasksDone === 1 ? 'Aufgabe' : 'Aufgaben'} erledigt`);
  const list = facts.length ? `${facts.join(', ')}. ` : '';
  const serie = streak.todayDone && streak.current >= 2 ? `Deine Serie: ${streak.current} Tage.` : '';

  if (goalMin > 0 && learnedMin >= goalMin) return { level: 'great', title: 'Tagesziel geschafft', text: `${list}${serie}`.trim() };
  if (goalMin > 0 && learnedMin >= goalMin / 2) {
    return { level: 'good', title: 'Gut gemacht', text: `${list}Vom Plan fehlen ${pushMinutes(goalMin - learnedMin)}, die verteilt die App auf die nächsten Tage. ${serie}`.trim() };
  }
  if (streak.todayDone) {
    return { level: 'some', title: 'Ein Anfang ist gemacht', text: `${list}${goalMin > 0 ? 'Der Rest verschiebt sich im Plan auf die nächsten Tage. ' : ''}${serie}`.trim() };
  }
  if (goalMin === 0) return { level: 'free', title: 'Heute war nichts geplant', text: 'Ein Tag ohne Lernblock ist in Ordnung. Morgen geht es mit dem Plan weiter.' };
  return {
    level: 'none',
    title: 'Heute noch nichts gelernt',
    text: `Schon ${cfg.streakMinMinutes} Minuten oder ${cfg.streakMinCards} Karten zählen als Lerntag.`,
  };
}
