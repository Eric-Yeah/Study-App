import { CONFIG } from './config';
import { addDay, blockedMinutesOn, type StudyEvent } from './events';
import { isFreeWeekday } from './schedule';
import type { StudyProfile } from './uniGrades';

/**
 * Semester im Studium: Vorlesungszeit, Prüfungsphase, vorlesungsfreie Zeit. Daraus ergibt sich die Lernkapazität pro Tag
 * für den gemeinsamen Plan (planAll): in der Prüfungsphase und vorlesungsfrei mehr, an Tagen mit gesperrter Zeit (Job, Pendeln) weniger.
 */

export type SemesterPhase = 'lecture' | 'exams' | 'break' | 'unknown';

export const PHASE_LABELS: Record<SemesterPhase, string> = {
  lecture: 'Vorlesungszeit',
  exams: 'Prüfungsphase',
  break: 'Vorlesungsfrei',
  unknown: 'Semesterzeiten nicht eingetragen',
};

export function semesterPhase(date: string, p: Pick<StudyProfile, 'lectureStart' | 'lectureEnd' | 'examStart' | 'examEnd'>): SemesterPhase {
  const inRange = (a: string | null, b: string | null) => a !== null && b !== null && date >= a && date <= b;
  if (inRange(p.examStart, p.examEnd)) return 'exams'; // die Prüfungsphase kann sich mit dem Ende der Vorlesungen überschneiden
  if (inRange(p.lectureStart, p.lectureEnd)) return 'lecture';
  if (p.lectureStart === null && p.lectureEnd === null && p.examStart === null && p.examEnd === null) return 'unknown';
  return 'break';
}

/** Tageskapazität in Minuten für einen Tag, null: es gilt das normale Tageslimit. */
export function dayCapacity(
  date: string,
  profile: Pick<StudyProfile, 'lectureStart' | 'lectureEnd' | 'examStart' | 'examEnd'>,
  events: StudyEvent[],
  baseLimitMin: number,
  freeDaysPerWeek: 0 | 1 | 2 = 0,
): number | null {
  const cfg = CONFIG.study.plan;
  if (isFreeWeekday(date, freeDaysPerWeek)) return null; // ein lernfreier Wochentag bleibt frei
  const phase = semesterPhase(date, profile);
  const phaseLimit = phase === 'exams' || phase === 'break' ? Math.max(baseLimitMin, cfg.examPhaseLimitMin) : baseLimitMin;
  const blocked = blockedMinutesOn(events, date);
  if (blocked === 0) return phaseLimit === baseLimitMin ? null : phaseLimit;
  return Math.max(cfg.minCapacityMin, Math.round(phaseLimit - blocked * cfg.blockedFactor));
}

/**
 * Überschreibungen pro Datum für `planAll` für die nächsten `days` Tage. Nur Tage mit abweichender Kapazität stehen drin.
 * Eigene Ausfälle des Nutzers (`own`) gehen immer vor.
 */
export function capacityOverrides(
  from: string,
  days: number,
  profile: Pick<StudyProfile, 'lectureStart' | 'lectureEnd' | 'examStart' | 'examEnd'>,
  events: StudyEvent[],
  baseLimitMin: number,
  freeDaysPerWeek: 0 | 1 | 2 = 0,
  own: Record<string, number> = {},
): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i <= days; i++) {
    const date = addDay(from, i);
    const cap = dayCapacity(date, profile, events, baseLimitMin, freeDaysPerWeek);
    if (cap !== null) out[date] = cap;
  }
  return { ...out, ...own };
}
