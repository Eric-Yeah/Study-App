/**
 * Alltag: was jetzt dran ist (nextUp), Freistunde als Gelegenheit (currentFreeSlot), Serie mit Gnade (studyStreak),
 * Fachvorschlag aus dem Stundenplan und Lernzeit einer Kartenrunde. Reine Funktionen ohne UI, alle Zahlen in CONFIG.daily.
 */
import { CONFIG } from './config';
import { matchSubject } from './lanis';
import { recentLesson, splitFreePeriods, type Timetable } from './lanisPlans';
import { addDays } from './schedule';

const toMin = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** "HH:MM" der lokalen Uhrzeit. */
export const timeOf = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const dayDiff = (from: string, to: string): number => {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
};

/* ---------- Freistunde ---------- */

export interface FreeSlot {
  start: string; // HH:MM
  end: string;
  /** Minuten, die ab jetzt (oder ab Beginn) noch zum Lernen bleiben */
  minutes: number;
  /** true: sie läuft schon */
  running: boolean;
}

/**
 * Die Freistunde, die gerade läuft oder in den nächsten freeSlotLookaheadMin Minuten beginnt (ohne Mittagspause).
 * Aufeinanderfolgende Freistunden zählen als eine. null, wenn keine passt oder weniger als minSessionMin bleiben.
 */
export function currentFreeSlot(tt: Timetable | null, iso: string, time: string, cfg = CONFIG.daily): FreeSlot | null {
  if (!tt) return null;
  const { study } = splitFreePeriods(tt, iso);
  if (study.length === 0) return null;
  const merged: { start: string; end: string; last: number }[] = [];
  for (const p of [...study].sort((a, b) => a.period - b.period)) {
    const prev = merged[merged.length - 1];
    if (prev && p.period === prev.last + 1) {
      prev.end = p.end;
      prev.last = p.period;
    } else merged.push({ start: p.start, end: p.end, last: p.period });
  }
  const now = toMin(time);
  for (const s of merged) {
    const start = toMin(s.start);
    const end = toMin(s.end);
    if (start <= now && now < end) {
      const minutes = end - now;
      return minutes >= cfg.minSessionMin ? { start: s.start, end: s.end, minutes, running: true } : null;
    }
    if (start > now && start - now <= cfg.freeSlotLookaheadMin) {
      const minutes = end - start;
      return minutes >= cfg.minSessionMin ? { start: s.start, end: s.end, minutes, running: false } : null;
    }
  }
  return null;
}

/** Fach der Stunde, in der man gerade sitzt oder die zuletzt war (für die Vorauswahl nach dem Unterricht). */
export function guessSubjectId(tt: Timetable | null, subjects: { id: string; name: string }[], iso: string, time: string): string | null {
  if (!tt) return null;
  const lesson = recentLesson(tt, iso, time);
  return lesson ? matchSubject(lesson.abbr, subjects) : null;
}

/* ---------- Als Nächstes ---------- */

export interface NextUpBlock {
  examId: string;
  subjectId: string;
  examDate: string; // YYYY-MM-DD
  plannedMin: number;
}

export interface NextUpInput {
  /** Geplante Blöcke von heute, ein Fach darf mehrfach vorkommen. */
  blocks: NextUpBlock[];
  /** Heute gelernte Minuten je Fach, Lernzeit ohne Fach unter dem Schlüssel "". */
  learnedBySubject: Record<string, number>;
  dueCards: number;
  openTasks: { id: string; title: string; subjectId: string | null }[];
  slot: FreeSlot | null;
  focusMin: number;
  /** Fächer in der Reihenfolge ihrer Priorität (wichtigste zuerst), nur Fächer mit Lernplan. */
  fallbackSubjectIds: string[];
}

export type NextUp =
  | { kind: 'study'; subjectId: string; examId: string; examDate: string; minutes: number; plannedMin: number; remainingMin: number; slot: FreeSlot | null }
  | { kind: 'task'; taskId: string; title: string; subjectId: string | null; minutes: number; slot: FreeSlot | null }
  | { kind: 'cards'; count: number }
  | { kind: 'free'; subjectId: string; minutes: number; slot: FreeSlot | null }
  | { kind: 'done'; hadPlan: boolean };

/** Länge der vorgeschlagenen Einheit: so lang wie der Timer, aber nicht länger als der Rest oder die Freistunde, mindestens minSessionMin. */
export function sessionLength(focusMin: number, remainingMin: number | null, slot: FreeSlot | null, cfg = CONFIG.daily): number {
  let m = focusMin;
  if (remainingMin !== null) m = Math.min(m, remainingMin);
  if (slot) m = Math.min(m, slot.minutes);
  return Math.max(cfg.minSessionMin, Math.floor(m / 5) * 5); // auf volle 5 Minuten abgerundet, damit es nie über die Freistunde hinausgeht
}

/**
 * Das, was jetzt dran ist, mit einem Tipp startbar. Reihenfolge: offener Rest des Tagesplans (früheste Klausur zuerst, bei Gleichstand
 * der größere Rest), dann eine offene Aufgabe, dann fällige Karten, dann ohne Plan das wichtigste Fach, sonst "erledigt".
 * Eine laufende oder bald beginnende Freistunde kürzt die Einheit, wenn sie kürzer ist als der Timer.
 */
export function nextUp(input: NextUpInput, cfg = CONFIG.daily): NextUp {
  const slot = input.slot;
  type Group = { subjectId: string; examId: string; examDate: string; planned: number };
  const groups = new Map<string, Group>();
  for (const b of input.blocks) {
    const g = groups.get(b.subjectId);
    if (!g) groups.set(b.subjectId, { subjectId: b.subjectId, examId: b.examId, examDate: b.examDate, planned: b.plannedMin });
    else {
      g.planned += b.plannedMin;
      if (b.examDate < g.examDate) {
        g.examDate = b.examDate;
        g.examId = b.examId;
      }
    }
  }
  const open = [...groups.values()]
    .map((g) => ({ ...g, remaining: g.planned - (input.learnedBySubject[g.subjectId] ?? 0) }))
    .filter((g) => g.remaining >= cfg.minRemainingMin)
    .sort((a, b) => a.examDate.localeCompare(b.examDate) || b.remaining - a.remaining);
  if (open.length > 0) {
    const g = open[0];
    return {
      kind: 'study',
      subjectId: g.subjectId,
      examId: g.examId,
      examDate: g.examDate,
      minutes: sessionLength(input.focusMin, g.remaining, slot, cfg),
      plannedMin: g.planned,
      remainingMin: Math.round(g.remaining),
      slot,
    };
  }
  const task = input.openTasks[0];
  if (task) {
    return { kind: 'task', taskId: task.id, title: task.title, subjectId: task.subjectId, minutes: sessionLength(input.focusMin, null, slot, cfg), slot };
  }
  if (input.dueCards > 0) return { kind: 'cards', count: input.dueCards };
  const hadPlan = input.blocks.length > 0;
  const learnedTotal = Object.values(input.learnedBySubject).reduce((s, m) => s + m, 0);
  if (!hadPlan && learnedTotal < input.focusMin && input.fallbackSubjectIds.length > 0) {
    return { kind: 'free', subjectId: input.fallbackSubjectIds[0], minutes: sessionLength(input.focusMin, null, slot, cfg), slot };
  }
  return { kind: 'done', hadPlan };
}

/** Grobe Dauer einer Kartenrunde in Minuten (zum Anzeigen, "ca. 3 min"). */
export function estimateCardMinutes(count: number, cfg = CONFIG.daily): number {
  return Math.max(1, Math.round((count * cfg.secondsPerCardEstimate) / 60));
}

/**
 * Lernzeit einer Kartenrunde in Minuten: die verstrichene Zeit, aber höchstens secondsPerCardCap je beantworteter Karte,
 * damit ein liegengebliebener Tab nichts zählt. Unter 30 Sekunden ergibt 0.
 */
export function cardRoundMinutes(elapsedMs: number, answered: number, cfg = CONFIG.daily): number {
  const capped = Math.min(Math.max(0, elapsedMs), Math.max(0, answered) * cfg.secondsPerCardCap * 1000);
  return Math.round(capped / 60_000);
}

/* ---------- Serie ---------- */

export interface StreakDay {
  date: string;
  minutes: number;
  active: boolean; // Lernzeit erreicht die Schwelle
  neutral: boolean; // lernfrei: zählt nicht und bricht nichts
  today: boolean;
  future: boolean;
}

export interface StreakResult {
  /** Lerntage in Folge, Ausfalltage mit Gnade und lernfreie Tage nicht mitgezählt */
  current: number;
  best: number;
  todayDone: boolean;
  todayMinutes: number;
  /** Minuten, die heute noch fehlen, damit der Tag zählt */
  needTodayMin: number;
  /** Ein Tag, der übersprungen wurde, ohne dass die Serie riss (null, wenn keiner) */
  savedDate: string | null;
  /** Montag bis Sonntag der aktuellen Woche */
  week: StreakDay[];
}

/**
 * Serie mit Gnade: Ein Tag zählt, wenn mindestens streakMinMinutes gelernt wurden. Ein einzelner Ausfalltag bricht die Serie nicht
 * (höchstens einer in streakGraceEveryDays Tagen), zwei Ausfälle dicht hintereinander schon. Lernfreie Tage (isNeutral) zählen nicht
 * und bremsen nicht. Der heutige Tag bricht nie, solange er noch nicht vorbei ist.
 */
export function studyStreak(
  input: { minutesByDate: Record<string, number>; today: string; isNeutral?: (date: string) => boolean },
  cfg = CONFIG.daily,
): StreakResult {
  const { minutesByDate, today } = input;
  const minutes = (d: string) => minutesByDate[d] ?? 0;
  const active = (d: string) => minutes(d) >= cfg.streakMinMinutes;
  const neutral = (d: string) => !active(d) && (input.isNeutral?.(d) ?? false);

  const run = (end: string): { count: number; saved: string | null } => {
    let count = 0;
    let oldestActive: string | null = null;
    const forgiven: string[] = [];
    let d = end;
    for (let i = 0; i < cfg.streakLookbackDays; i++, d = addDays(d, -1)) {
      if (active(d)) {
        count++;
        oldestActive = d;
      } else if (neutral(d)) {
        continue;
      } else {
        const lastForgiven = forgiven[forgiven.length - 1];
        if (lastForgiven !== undefined && dayDiff(d, lastForgiven) < cfg.streakGraceEveryDays) break;
        forgiven.push(d);
      }
    }
    const inside = forgiven.filter((f) => oldestActive !== null && f > oldestActive);
    return { count, saved: inside.length > 0 ? inside[0] : null };
  };

  const todayDone = active(today);
  const end = todayDone ? today : addDays(today, -1);
  const current = run(end);

  let best = current.count;
  for (const d of Object.keys(minutesByDate)) {
    if (d <= today && active(d)) best = Math.max(best, run(d).count);
  }

  // Woche von Montag bis Sonntag
  const [y, m, dd] = today.split('-').map(Number);
  const dow = (new Date(y, m - 1, dd).getDay() + 6) % 7; // 0 = Montag
  const monday = addDays(today, -dow);
  const week: StreakDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, minutes: minutes(date), active: active(date), neutral: neutral(date), today: date === today, future: date > today };
  });

  return {
    current: current.count,
    best,
    todayDone,
    todayMinutes: minutes(today),
    needTodayMin: Math.max(0, cfg.streakMinMinutes - minutes(today)),
    savedDate: current.saved,
    week,
  };
}
