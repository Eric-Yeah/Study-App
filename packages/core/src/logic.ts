import { CONFIG } from './config';
import { examKindOf, isModule, moduleHoursAuto, moduleLeadDays, modulePriority } from './studyEffort';
import type { DayKind, Exam, PlanSettings, Subject, SubjectStatus, SubjectType } from './types';

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const MS_PER_DAY = 86_400_000;

type StatusInput = Pick<Subject, 'isAdvanced' | 'isExamSubject' | 'status'>;

/** Leistungskurse und Prüfungsfächer lassen sich nicht abwählen. */
export function effectiveStatus(s: StatusInput): SubjectStatus {
  return s.isAdvanced || s.isExamSubject ? 'active' : s.status;
}

export function isStatusIgnored(s: StatusInput): boolean {
  return (s.isAdvanced || s.isExamSubject) && s.status !== 'active';
}

export interface PriorityBreakdown {
  weighting: number;
  gradeBonus: number;
  gradeKnown: boolean; // false: ohne Note, es zählt der neutrale Wert aus CONFIG.priority.unknownGradePoints
  difficultyBonus: number;
  raw: number;
  status: SubjectStatus;
  statusIgnored: boolean;
  auto: number;
}

export function priorityBreakdown(
  s: Pick<Subject, 'isAdvanced' | 'isExamSubject' | 'status' | 'points' | 'difficulty'>,
  cfg = CONFIG.priority,
): PriorityBreakdown {
  const weighting = (s.isAdvanced ? cfg.advancedBonus : 0) + (s.isExamSubject ? cfg.examSubjectBonus : 0);
  const gradeKnown = s.points !== null;
  const points = s.points ?? cfg.unknownGradePoints;
  const gradeBonus = ((15 - clamp(points, 0, 15)) / 15) * cfg.gradeMaxBonus;
  const difficultyBonus = ((clamp(s.difficulty, 1, 5) - 1) / 4) * cfg.difficultyMaxBonus;
  const raw = clamp(Math.round(cfg.base + weighting + gradeBonus + difficultyBonus), cfg.min, cfg.max);
  const status = effectiveStatus(s);
  const auto =
    status === 'drop_q3' ? Math.max(cfg.min, raw - cfg.dropQ3Penalty) : status === 'dropped' ? cfg.min : raw;
  return { weighting, gradeBonus, gradeKnown, difficultyBonus, raw, status, statusIgnored: isStatusIgnored(s), auto };
}

/** Automatische Priorität eines Fachs oder Moduls (ohne Prüfung): Module nach ECTS und Schwierigkeit, Schulfächer nach Note und Gewichtung. */
export function subjectPriorityAuto(s: Subject): number {
  return isModule(s) ? modulePriority(s, {}).auto : priorityBreakdown(s).auto;
}

export function totalHoursAuto(priority: number, status: SubjectStatus, cfg = CONFIG.totalTime): number {
  if (status === 'dropped') return 0;
  const hours =
    ((cfg.daysBase + cfg.daysPerPriority * priority) * (cfg.minutesBase + cfg.minutesPerPriority * priority)) / 60;
  const rounded = Math.round(hours / cfg.roundToHours) * cfg.roundToHours;
  return Math.min(cfg.capHours, rounded);
}

export function leadDaysAuto(priority: number, type: SubjectType, cfg = CONFIG.lead): number {
  return Math.round(cfg.daysBase + cfg.daysPerPriority * priority) + (type === 'writing' ? cfg.writingBufferDays : 0);
}

/** Ganze Kalendertage von heute bis zum Datum (YYYY-MM-DD), lokale Zeit. */
export function daysUntil(date: string, today: Date = new Date()): number {
  const [y, m, d] = date.split('-').map(Number);
  const exam = new Date(y, m - 1, d);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((exam.getTime() - t.getTime()) / MS_PER_DAY);
}

export function resolveStartDays(manual: number | null, auto: number, daysLeft: number): number {
  const max = Math.max(1, daysLeft);
  const value = manual ?? Math.min(auto, max);
  return clamp(Math.round(value), 1, max);
}

export function studyDays(startDays: number, freeDaysPerWeek: number): number {
  return Math.max(1, startDays - Math.floor(startDays / 7) * freeDaysPerWeek);
}

export function minutesPerStudyDay(totalHours: number, days: number): number {
  return Math.round((totalHours * 60) / Math.max(1, days));
}

/** Spätester Start (Tage vor der Klausur), damit das Tageslimit eingehalten wird. */
export function latestStartForLimit(
  totalHours: number,
  dailyLimitMin: number,
  freeDaysPerWeek: number,
  maxDays = 365,
): number {
  if (totalHours <= 0) return 0;
  const needed = Math.ceil((totalHours * 60) / dailyLimitMin);
  let d = 1;
  while (d < maxDays && studyDays(d, freeDaysPerWeek) < needed) d++;
  return d;
}

export function spacingShare(days: number, cfg = CONFIG.spacing): number {
  if (days <= cfg.shortDays) return cfg.shortShare;
  const exponent = Math.log(days / cfg.shortDays) / Math.log(cfg.longDays / cfg.shortDays);
  return cfg.shortShare * Math.pow(cfg.longShare / cfg.shortShare, exponent);
}

export function reviewGap(days: number): number {
  return Math.max(1, Math.round(spacingShare(days) * days));
}

export function isFreeDay(t: number, startDays: number, freeDaysPerWeek: number): boolean {
  if (t >= startDays || freeDaysPerWeek <= 0) return false;
  return t % 7 === 6 || (freeDaysPerWeek === 2 && t % 7 === 3);
}

/** Tag t = 0 ist der Starttag, t = startDays ist der Klausurtag. */
export function buildTimeline(startDays: number, gap: number, freeDaysPerWeek: number, hasPlan: boolean): DayKind[] {
  const days: DayKind[] = [];
  for (let t = 0; t <= startDays; t++) {
    if (!hasPlan) days.push(t === startDays ? 'exam' : 'none');
    else if (t === startDays) days.push('exam');
    else if (isFreeDay(t, startDays, freeDaysPerWeek)) days.push('free');
    else if (t > 0 && t % gap === 0) days.push('review');
    else days.push('study');
  }
  return days;
}

export interface Overridable {
  auto: number;
  value: number;
  overridden: boolean;
}

export interface ExamPlan {
  /** 'module': Plan aus den ECTS eines Moduls (Studium), sonst Schule */
  source: 'school' | 'module';
  priority: Overridable & { breakdown: PriorityBreakdown };
  totalHours: Overridable;
  startDays: Overridable;
  daysLeft: number;
  hasPlan: boolean;
  studyDays: number;
  minutesPerStudyDay: number;
  overLimit: boolean;
  latestStart: number;
  notEnoughTime: boolean;
  reviewGap: number;
  timeline: DayKind[];
}

/** Aufschlüsselung der Priorität eines Moduls im Format der Schul-Aufschlüsselung: Gewichtung = ECTS, Note = weiterer Versuch. */
function moduleBreakdown(subject: Subject, exam: Exam): PriorityBreakdown {
  const p = modulePriority(subject, exam);
  return {
    weighting: p.ectsBonus,
    gradeBonus: p.retryBonus,
    gradeKnown: true,
    difficultyBonus: p.difficultyBonus,
    raw: p.raw,
    status: 'active',
    statusIgnored: false,
    auto: p.auto,
  };
}

export function planExam(subject: Subject, exam: Exam, settings: PlanSettings, today: Date = new Date()): ExamPlan {
  const mod = isModule(subject);
  const breakdown = mod ? moduleBreakdown(subject, exam) : priorityBreakdown(subject);
  const priorityValue = exam.priorityManual ?? breakdown.auto;
  const hasPlan = breakdown.status !== 'dropped';

  const kind = examKindOf(exam);
  const totalAuto = mod ? moduleHoursAuto(subject.ects as number, kind, exam.attempt ?? 1) : totalHoursAuto(priorityValue, breakdown.status);
  const totalValue = hasPlan ? exam.totalHoursManual ?? totalAuto : 0;

  const daysLeft = daysUntil(exam.date, today);
  const leadAuto = mod ? moduleLeadDays(subject.ects as number, kind) : leadDaysAuto(priorityValue, subject.type);
  const startAuto = Math.max(1, Math.min(leadAuto, Math.max(1, daysLeft)));
  const startValue = resolveStartDays(exam.startDaysManual, startAuto, daysLeft);

  const sDays = studyDays(startValue, settings.freeDaysPerWeek);
  const perDay = minutesPerStudyDay(totalValue, sDays);
  const overLimit = totalValue > 0 && perDay > settings.dailyLimitMin;
  const latestStart = latestStartForLimit(totalValue, settings.dailyLimitMin, settings.freeDaysPerWeek);
  const gap = reviewGap(startValue);

  return {
    source: mod ? 'module' : 'school',
    priority: {
      auto: breakdown.auto,
      value: priorityValue,
      overridden: exam.priorityManual !== null && exam.priorityManual !== breakdown.auto,
      breakdown,
    },
    totalHours: {
      auto: totalAuto,
      value: totalValue,
      overridden: exam.totalHoursManual !== null && exam.totalHoursManual !== totalAuto,
    },
    startDays: {
      auto: startAuto,
      value: startValue,
      overridden: exam.startDaysManual !== null && startValue !== startAuto,
    },
    daysLeft,
    hasPlan,
    studyDays: sDays,
    minutesPerStudyDay: perDay,
    overLimit,
    latestStart,
    notEnoughTime: overLimit && latestStart > Math.max(1, daysLeft),
    reviewGap: gap,
    timeline: buildTimeline(startValue, gap, settings.freeDaysPerWeek, hasPlan && totalValue > 0),
  };
}

/** Geplante Minuten für ein Datum (YYYY-MM-DD) für eine Klausur, 0 wenn kein Lern- oder Wiederholungstag. */
export function plannedMinutesOn(plan: ExamPlan, examDate: string, date: string): number {
  const offset = daysUntil(examDate, parseLocal(date)); // Tage von date bis Klausur
  const t = plan.startDays.value - offset; // Index in der Zeitleiste
  if (t < 0 || t >= plan.timeline.length) return 0;
  const kind = plan.timeline[t];
  return kind === 'study' || kind === 'review' ? plan.minutesPerStudyDay : 0;
}

export function parseLocal(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
