/**
 * Wochenrückblick: aus Lernzeit, Plan, Befinden und Erledigtem eine Auswertung der Woche (Montag bis Sonntag)
 * mit ein paar Hinweisen nach festen Regeln, ohne KI. Reine Funktionen, die App liefert die Rohdaten.
 */
import { CONFIG } from './config';
import { weekStart as mondayOf } from './notesView';
import { addDays } from './schedule';

export interface WeekData {
  weekStart: string; // ein beliebiger Tag der Woche genügt, es wird auf den Montag gerechnet
  today: string;
  subjects: { id: string; name: string; color: string }[];
  sessions: { date: string; subjectId: string | null; minutes: number }[];
  planned: { date: string; subjectId: string; minutes: number }[];
  energy: { date: string; value: number | null }[];
  sleep: { date: string; hours: number | null }[];
  training: { date: string; sessions: number | null; minutes: number | null }[];
  tasks: { date: string; done: boolean }[];
  noteDates: string[];
  cardReviewDates: string[];
  exams: { date: string; title: string; subjectId: string | null }[];
}

export interface ReviewDay {
  date: string;
  learned: number;
  planned: number;
  future: boolean;
  isToday: boolean;
}

export interface ReviewSubject {
  subjectId: string | null;
  name: string;
  color: string;
  learned: number;
  planned: number;
}

export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  isCurrent: boolean;
  days: ReviewDay[];
  learned: number;
  planned: number;
  prevLearned: number;
  studyDays: number;
  best: { date: string; minutes: number } | null;
  subjects: ReviewSubject[];
  energyAvg: number | null;
  sleepAvg: number | null;
  trainingDays: number;
  trainingMinutes: number;
  tasks: { done: number; total: number };
  notes: number;
  cards: number;
  exams: { date: string; title: string; subjectId: string | null; daysLeft: number }[];
  hints: string[];
}

/** "45 min", "1 h", "1 h 20 min" */
export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: readonly number[]) => (xs.length === 0 ? null : sum(xs) / xs.length);
const round1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export function weeklyReview(data: WeekData, cfg = CONFIG.review): WeeklyReview {
  const start = mondayOf(data.weekStart);
  const end = addDays(start, 6);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const inWeek = (d: string) => d >= start && d <= end;
  const minutesOn = (date: string) => sum(data.sessions.filter((s) => s.date === date).map((s) => s.minutes));
  const plannedOn = (date: string) => sum(data.planned.filter((p) => p.date === date).map((p) => p.minutes));

  const days: ReviewDay[] = dates.map((date) => ({
    date,
    learned: minutesOn(date),
    planned: plannedOn(date),
    future: date > data.today,
    isToday: date === data.today,
  }));
  const learned = sum(days.map((d) => d.learned));
  const planned = sum(days.map((d) => d.planned));
  const prevStart = addDays(start, -7);
  const prevLearned = sum(data.sessions.filter((s) => s.date >= prevStart && s.date < start).map((s) => s.minutes));
  const studyDays = days.filter((d) => d.learned >= cfg.studyDayMinMinutes).length;
  const bestDay = days.reduce<ReviewDay | null>((b, d) => (d.learned > 0 && (!b || d.learned > b.learned) ? d : b), null);

  // Fächer: gelernt und geplant der Woche, die mit etwas darin
  const ids = new Set<string | null>([...data.sessions.filter((s) => inWeek(s.date)).map((s) => s.subjectId), ...data.planned.filter((p) => inWeek(p.date)).map((p) => p.subjectId)]);
  const subjects: ReviewSubject[] = [...ids]
    .map((id) => {
      const sub = data.subjects.find((s) => s.id === id);
      return {
        subjectId: id,
        name: sub?.name ?? 'Ohne Fach',
        color: sub?.color ?? 'var(--ink-3)',
        learned: sum(data.sessions.filter((s) => s.subjectId === id && inWeek(s.date)).map((s) => s.minutes)),
        planned: sum(data.planned.filter((p) => p.subjectId === id && inWeek(p.date)).map((p) => p.minutes)),
      };
    })
    .filter((s) => s.learned > 0 || s.planned > 0)
    .sort((a, b) => b.learned - a.learned || b.planned - a.planned || a.name.localeCompare(b.name, 'de'));

  const energyAvg = round1(avg(data.energy.filter((e) => inWeek(e.date) && e.value !== null).map((e) => e.value as number)));
  const sleepAvg = round1(avg(data.sleep.filter((e) => inWeek(e.date) && e.hours !== null).map((e) => e.hours as number)));
  const training = data.training.filter((t) => inWeek(t.date) && ((t.sessions ?? 0) > 0 || (t.minutes ?? 0) > 0));
  const tasks = data.tasks.filter((t) => inWeek(t.date));
  const exams = data.exams
    .map((e) => ({ ...e, daysLeft: dayDiff(e.date, data.today) }))
    .filter((e) => e.daysLeft >= 0 && e.daysLeft <= cfg.examLookaheadDays)
    .sort((a, b) => a.date.localeCompare(b.date));

  const review: WeeklyReview = {
    weekStart: start,
    weekEnd: end,
    isCurrent: inWeek(data.today),
    days,
    learned,
    planned,
    prevLearned,
    studyDays,
    best: bestDay ? { date: bestDay.date, minutes: bestDay.learned } : null,
    subjects,
    energyAvg,
    sleepAvg,
    trainingDays: training.length,
    trainingMinutes: sum(training.map((t) => t.minutes ?? 0)),
    tasks: { done: tasks.filter((t) => t.done).length, total: tasks.length },
    notes: data.noteDates.filter(inWeek).length,
    cards: data.cardReviewDates.filter(inWeek).length,
    exams,
    hints: [],
  };
  review.hints = hintsFor(review, data, cfg);
  return review;
}

/** Hinweise nach festen Regeln, die wichtigsten zuerst, höchstens cfg.maxHints. */
function hintsFor(r: WeeklyReview, data: WeekData, cfg = CONFIG.review): string[] {
  const hints: string[] = [];
  const past = r.days.filter((d) => d.date < data.today); // abgeschlossene Tage

  // Fächer, in denen weniger gelernt als geplant wurde (nur abgeschlossene Tage)
  const behind = r.subjects
    .map((s) => {
      const p = sum(data.planned.filter((x) => x.subjectId === s.subjectId && past.some((d) => d.date === x.date)).map((x) => x.minutes));
      const l = sum(data.sessions.filter((x) => x.subjectId === s.subjectId && past.some((d) => d.date === x.date)).map((x) => x.minutes));
      return { name: s.name, planned: p, missing: p - l };
    })
    .filter((s) => s.planned > 0 && s.missing >= Math.max(cfg.behindMinMinutes, s.planned * cfg.behindMinShare))
    .sort((a, b) => b.missing - a.missing);
  for (const b of behind.slice(0, 2)) hints.push(`${b.name}: ${fmtMinutes(b.missing)} weniger gelernt als geplant.`);

  const skippedDays = past.filter((d) => d.planned > 0 && d.learned === 0);
  if (skippedDays.length >= 2) hints.push(`An ${skippedDays.length} Tagen war Lernzeit geplant, aber nichts gelernt (${skippedDays.map((d) => WEEKDAYS[r.days.indexOf(d)].slice(0, 2)).join(', ')}).`);

  // Vergleich mit der Vorwoche nur, wenn die Woche vorbei ist, sonst wäre sie unfair kurz
  if (!r.isCurrent && r.prevLearned > 0) {
    const diff = r.learned - r.prevLearned;
    if (diff >= 30 && r.learned >= r.prevLearned * 1.2) hints.push(`${fmtMinutes(diff)} mehr gelernt als in der Woche davor.`);
    else if (-diff >= 60 && r.learned <= r.prevLearned * 0.7) hints.push(`${fmtMinutes(-diff)} weniger gelernt als in der Woche davor.`);
  }

  if (!r.isCurrent && r.learned === 0 && r.weekEnd < data.today) hints.push('In dieser Woche wurde nichts gelernt.');
  if (r.sleepAvg !== null && r.sleepAvg < cfg.lowSleepHours) hints.push(`Im Schnitt nur ${String(r.sleepAvg).replace('.', ',')} h Schlaf, darunter lässt die Konzentration oft nach.`);
  if (r.trainingDays >= 2) hints.push(`${r.trainingDays} Trainingstage in dieser Woche, das hilft beim Lernen.`);

  const nearest = r.exams[0];
  if (nearest && nearest.daysLeft <= 7) hints.push(`${nearest.title || 'Klausur'} ${nearest.daysLeft === 0 ? 'ist heute' : nearest.daysLeft === 1 ? 'ist morgen' : `ist in ${nearest.daysLeft} Tagen`}.`);

  return hints.slice(0, cfg.maxHints);
}
