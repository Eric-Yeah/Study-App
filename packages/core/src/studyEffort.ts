import { CONFIG } from './config';
import type { Exam, ExamKind, Subject } from './types';

/**
 * Lernaufwand im Studium: Die Zeit für eine Prüfung folgt aus den Leistungspunkten (ECTS) des Moduls,
 * nicht aus Notenpunkten wie in der Schule. Reine Funktionen, alle Zahlen in CONFIG.study.
 */

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export const EXAM_KINDS: ExamKind[] = ['written', 'oral', 'paper', 'presentation', 'project', 'testat', 'other'];

export const EXAM_KIND_LABELS: Record<ExamKind, string> = {
  written: 'Klausur',
  oral: 'Mündliche Prüfung',
  paper: 'Hausarbeit',
  presentation: 'Referat',
  project: 'Projekt / Abgabe',
  testat: 'Testat / Studienleistung',
  other: 'Sonstige',
};

export function isExamKind(v: unknown): v is ExamKind {
  return typeof v === 'string' && (EXAM_KINDS as string[]).includes(v);
}

/** Ob ein Fach ein Modul im Studium ist, dessen Plan sich aus den ECTS ergibt. */
export function isModule(s: Pick<Subject, 'scope' | 'ects'>): s is Pick<Subject, 'scope' | 'ects'> & { ects: number } {
  return s.scope === 'uni' && typeof s.ects === 'number' && s.ects > 0;
}

export function examKindOf(e: Pick<Exam, 'kind'>): ExamKind {
  return e.kind ?? 'written';
}

/** Ob die Prüfung eine schriftliche Arbeit ist, die rückwärts geplant wird (Hausarbeit, Projekt). */
export function isWritingKind(kind: ExamKind): boolean {
  return kind === 'paper' || kind === 'project';
}

/** Gesamtarbeitszeit des Moduls in Stunden (ECTS mal Stunden je ECTS). */
export function moduleWorkloadHours(ects: number, cfg = CONFIG.study): number {
  return ects * cfg.hoursPerEcts;
}

/** Stunden pro Woche, die Vorlesung, Übung und Nacharbeit im Semester ungefähr füllen. */
export function moduleHoursPerWeek(ects: number, cfg = CONFIG.study): number {
  return moduleWorkloadHours(ects, cfg) / cfg.weeksPerSemester;
}

/** SWS (Semesterwochenstunden) in Stunden Anwesenheit im Semester: 1 SWS sind 45 Minuten pro Woche. */
export function swsToHours(sws: number, cfg = CONFIG.study): number {
  return (sws * cfg.swsMinutes * cfg.weeksPerSemester) / 60;
}

/** Vorgeschlagene Zeit für die Prüfungsvorbereitung in Stunden. */
export function moduleHoursAuto(ects: number, kind: ExamKind = 'written', attempt = 1, cfg = CONFIG.study): number {
  const share = cfg.examShare[kind] ?? cfg.examShare.other;
  const retry = attempt > 1 ? cfg.retryFactor : 1;
  const hours = moduleWorkloadHours(ects, cfg) * share * retry;
  const rounded = Math.round(hours / cfg.roundToHours) * cfg.roundToHours;
  return clamp(rounded, cfg.minHours, cfg.capHours);
}

/** Vorgeschlagener Vorlauf in Tagen vor der Prüfung. */
export function moduleLeadDays(ects: number, kind: ExamKind = 'written', cfg = CONFIG.study): number {
  if (isWritingKind(kind)) return Math.round(clamp(cfg.lead.paperDaysPerEcts * ects, cfg.lead.minDays, cfg.lead.paperMaxDays));
  return Math.round(clamp(cfg.lead.daysBase + cfg.lead.daysPerEcts * ects, cfg.lead.minDays, cfg.lead.maxDays));
}

export interface ModulePriority {
  ectsBonus: number;
  difficultyBonus: number;
  retryBonus: number;
  raw: number;
  auto: number;
}

/** Priorität 1 bis 10: mehr ECTS, schwerere Module und spätere Versuche sind dringender. */
export function modulePriority(
  s: Pick<Subject, 'ects' | 'difficulty'>,
  exam: Pick<Exam, 'attempt'>,
  maxAttempts = CONFIG.study.maxAttempts,
  cfg = CONFIG.study.priority,
): ModulePriority {
  const ectsBonus = (clamp(s.ects ?? 0, 0, cfg.ectsForMax) / cfg.ectsForMax) * cfg.ectsMaxBonus;
  const difficultyBonus = ((clamp(s.difficulty, 1, 5) - 1) / 4) * cfg.difficultyMaxBonus;
  const attempt = exam.attempt ?? 1;
  const retryBonus = attempt >= maxAttempts ? cfg.lastAttemptBonus : attempt > 1 ? cfg.retryBonus : 0;
  const raw = Math.round(cfg.base + ectsBonus + difficultyBonus + retryBonus);
  const auto = clamp(raw, CONFIG.priority.min, CONFIG.priority.max);
  return { ectsBonus, difficultyBonus, retryBonus, raw, auto };
}

/** Arbeitsschritte einer Hausarbeit oder eines Projekts, rückwärts aus der Abgabe geplant. */
export interface WritingStep {
  title: string;
  /** Spätester Tag für diesen Schritt (YYYY-MM-DD) */
  due: string;
}

const MS_PER_DAY = 86_400_000;
const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Verteilt die Zeit von `start` bis zur Abgabe auf die Arbeitsschritte (CONFIG.study.writingSteps). Der letzte Schritt endet
 * einen Tag vor der Abgabe (Puffer). Liegt die Abgabe zu nah, fallen mehrere Schritte auf denselben Tag, die Liste bleibt in Reihenfolge.
 */
export function writingSteps(start: string, due: string, cfg = CONFIG.study): WritingStep[] {
  const total = Math.max(0, Math.round((parse(due).getTime() - parse(start).getTime()) / MS_PER_DAY));
  const usable = Math.max(1, total - 1);
  let acc = 0;
  return cfg.writingSteps.map((step, i) => {
    acc += step.share;
    const last = i === cfg.writingSteps.length - 1;
    const offset = last ? usable : Math.max(1, Math.round(usable * acc));
    const d = parse(start);
    d.setDate(d.getDate() + Math.min(offset, usable));
    return { title: step.title, due: fmt(d) };
  });
}
