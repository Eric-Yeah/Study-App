import { CONFIG, addDays, buildQueue, toIsoDate, type PushDay, type PushExam } from '@study/core';
import { blocksForDate, combinedPlan, examsWithPlans, learnedForExam, realityFor, upcoming } from '../state/selectors';
import type { AppState } from '../state/store';

/** Was die Erinnerungen aus dem Plan brauchen: die Blöcke der nächsten Tage und der Stand der kommenden Klausuren. */
export function pushInputFrom(state: AppState, now: Date): { today: string; days: PushDay[]; exams: PushExam[] } {
  const today = toIsoDate(now);
  const list = examsWithPlans(state, now);
  const plan = combinedPlan(state, list, now);
  const days: PushDay[] = Array.from({ length: CONFIG.push.planDays }, (_, i) => {
    const date = addDays(today, i);
    const bySubject = new Map<string, number>();
    for (const b of blocksForDate(plan, list, date)) bySubject.set(b.item.subject.name, (bySubject.get(b.item.subject.name) ?? 0) + b.minutes);
    return { date, blocks: [...bySubject.entries()].map(([subject, minutes]) => ({ subject, minutes })), cards: buildQueue(state.cards, date).length };
  });
  const exams: PushExam[] = upcoming(list).map((x) => {
    const reality = realityFor(state, x, now);
    const total = Math.round(x.plan.totalHours.value * 60);
    return {
      id: x.exam.id,
      subject: x.subject.name,
      date: x.exam.date,
      remainingMin: Math.max(0, total - learnedForExam(state.sessions, x)),
      behindMin: Math.max(0, -reality.deltaMin),
      behind: reality.status === 'behind' || reality.status === 'far_behind',
    };
  });
  return { today, days, exams };
}
