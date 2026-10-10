import { CONFIG } from './config';
import type { ExamPlan } from './logic';

/**
 * Gemeinsamer Plan über alle Klausuren, Ausfälle und Realitätscheck. Reine Funktionen.
 *
 * Verfahren: Tag für Tag von heute bis zur letzten Klausur. An jedem Tag bekommt jede Klausur,
 * die schon begonnen hat, ihren gleichmäßigen Anteil der Restzeit auf die verbleibenden Lerntage.
 * Reicht das Tageslimit nicht für alle, gewinnt die Klausur mit der früheren Frist. Was nicht passt,
 * rutscht auf spätere Tage. Am letzten möglichen Tag darf das Limit leicht überschritten werden.
 * Was am Ende fehlt, steht in shortfall.
 */

export interface PlanInput {
  examId: string;
  /** YYYY-MM-DD */
  examDate: string;
  /** Erster Lerntag (Klausurdatum minus Starttage), YYYY-MM-DD */
  startDate: string;
  /** Gesamtzeit laut Plan in Minuten */
  totalMin: number;
  /** Bereits gelernte Minuten bis gestern. Heute zählt noch nicht, damit der Tag vollständig geplant wird. */
  learnedBeforeTodayMin: number;
  /** Tage, an denen diese Klausur laut ihrer Zeitleiste ein Wiederholungstag ist (nur für die Anzeige) */
  reviewDates?: ReadonlySet<string>;
}

export interface PlanBlock {
  examId: string;
  minutes: number;
  kind: 'study' | 'review';
}

export interface PlanDay {
  date: string;
  blocks: PlanBlock[];
  totalMin: number;
  capacityMin: number;
  /** Lernfreier Wochentag laut Einstellung (ohne Überschreibung) */
  free: boolean;
  /** Vom Nutzer geändert: fällt aus oder weniger Zeit */
  overridden: boolean;
  overLimit: boolean;
}

export interface CombinedPlan {
  days: PlanDay[];
  /** Minuten, die bis zur Klausur nicht mehr in den Plan passen, pro Klausur */
  shortfall: Record<string, number>;
}

export interface PlanOptions {
  /** Heute, YYYY-MM-DD */
  today: string;
  dailyLimitMin: number;
  freeDaysPerWeek: 0 | 1 | 2;
  /** Verfügbare Minuten pro Datum, überschreibt Limit und lernfreie Tage. 0 = fällt aus. */
  overrides?: Record<string, number>;
}

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function addDays(iso: string, n: number): string {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return fmt(d);
}

export function isFreeWeekday(iso: string, freeDaysPerWeek: 0 | 1 | 2): boolean {
  return (CONFIG.schedule.freeWeekdays[freeDaysPerWeek] ?? []).includes(parse(iso).getDay());
}

const roundUp = (n: number, step: number) => Math.ceil(n / step) * step;

export function planAll(inputs: PlanInput[], opts: PlanOptions): CombinedPlan {
  const { roundMin, softOverflow } = CONFIG.schedule;
  const overrides = opts.overrides ?? {};
  const active = inputs
    .filter((i) => i.totalMin > 0 && i.examDate > opts.today)
    .map((i) => ({ ...i, remaining: Math.max(0, i.totalMin - i.learnedBeforeTodayMin) }));
  if (active.length === 0) return { days: [], shortfall: {} };

  const last = active.reduce((m, i) => (i.examDate > m ? i.examDate : m), opts.today);
  const dates: string[] = [];
  for (let d = opts.today; d <= last; d = addDays(d, 1)) dates.push(d);

  const free = (d: string) => isFreeWeekday(d, opts.freeDaysPerWeek);
  const capacityOf = (d: string) => overrides[d] ?? (free(d) ? 0 : opts.dailyLimitMin);

  const days: PlanDay[] = [];
  for (const date of dates) {
    const capacity = capacityOf(date);
    const blocks: PlanBlock[] = [];
    let used = 0;
    if (capacity > 0) {
      const eligible = active
        .filter((i) => i.startDate <= date && date < i.examDate && i.remaining > 0)
        .sort((a, b) => a.examDate.localeCompare(b.examDate) || b.remaining - a.remaining);
      for (const e of eligible) {
        // Verbleibende Lerntage (heute eingeschlossen) bis zum Tag vor der Klausur
        let daysLeft = 0;
        for (let d = date; d < e.examDate; d = addDays(d, 1)) if (capacityOf(d) > 0) daysLeft++;
        const need = Math.min(e.remaining, roundUp(e.remaining / Math.max(1, daysLeft), roundMin));
        const lastChance = daysLeft <= 1;
        const room = capacity * (lastChance ? 1 + softOverflow : 1) - used;
        const give = Math.min(need, Math.floor(room / roundMin) * roundMin);
        if (give <= 0) continue;
        e.remaining -= give;
        used += give;
        blocks.push({ examId: e.examId, minutes: give, kind: e.reviewDates?.has(date) ? 'review' : 'study' });
      }
    }
    days.push({
      date,
      blocks,
      totalMin: used,
      capacityMin: capacity,
      free: free(date),
      overridden: date in overrides,
      overLimit: capacity > 0 && used > capacity,
    });
  }

  const shortfall: Record<string, number> = {};
  for (const i of active) if (i.remaining > 0) shortfall[i.examId] = i.remaining;
  return { days, shortfall };
}

/** Minuten, die für ein Datum geplant sind (0, wenn der Tag nicht im Plan liegt). */
export function plannedOn(plan: CombinedPlan, date: string): PlanBlock[] {
  return plan.days.find((d) => d.date === date)?.blocks ?? [];
}

/** Was bis gestern laut Zeitleiste der Klausur gelernt sein sollte (Minuten). */
export function expectedMinutesBeforeToday(plan: ExamPlan): number {
  const todayIndex = plan.startDays.value - plan.daysLeft;
  let sum = 0;
  for (let t = 0; t < Math.min(todayIndex, plan.timeline.length); t++) {
    const kind = plan.timeline[t];
    if (kind === 'study' || kind === 'review') sum += plan.minutesPerStudyDay;
  }
  return sum;
}

export type RealityStatus = 'ahead' | 'on_track' | 'behind' | 'far_behind' | 'not_started';

export interface RealityCheck {
  expectedMin: number;
  learnedMin: number;
  /** positiv = voraus, negativ = zurück */
  deltaMin: number;
  status: RealityStatus;
}

export function realityCheck(expectedMin: number, learnedMin: number, cfg = CONFIG.reality): RealityCheck {
  const deltaMin = Math.round(learnedMin - expectedMin);
  if (expectedMin <= 0) {
    return { expectedMin, learnedMin, deltaMin, status: 'not_started' };
  }
  const tol = Math.max(cfg.toleranceMin, expectedMin * cfg.toleranceShare);
  const far = Math.max(cfg.farBehindMin, expectedMin * cfg.farBehindShare);
  const status: RealityStatus =
    deltaMin > tol ? 'ahead' : deltaMin >= -tol ? 'on_track' : deltaMin >= -far ? 'behind' : 'far_behind';
  return { expectedMin, learnedMin, deltaMin, status };
}
