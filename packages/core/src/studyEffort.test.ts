import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { planExam } from './logic';
import { moduleHoursAuto, moduleHoursPerWeek, moduleLeadDays, modulePriority, moduleWorkloadHours, swsToHours, writingSteps } from './studyEffort';
import type { Exam, Subject } from './types';

const mod = (ects: number | null, extra: Partial<Subject> = {}): Subject => ({
  id: 'm1',
  name: 'Analysis',
  color: '#000',
  isAdvanced: false,
  isExamSubject: false,
  status: 'active',
  type: 'problems',
  points: null,
  difficulty: 3,
  language: 'de',
  scope: 'uni',
  ects,
  ...extra,
});
const exam = (date: string, extra: Partial<Exam> = {}): Exam => ({
  id: 'e1',
  subjectId: 'm1',
  title: '',
  date,
  priorityManual: null,
  totalHoursManual: null,
  startDaysManual: null,
  ...extra,
});

describe('Lernaufwand aus ECTS', () => {
  it('Gesamtaufwand und Wochenstunden', () => {
    expect(moduleWorkloadHours(6)).toBeCloseTo(165);
    expect(moduleHoursPerWeek(6)).toBeCloseTo(11);
    expect(swsToHours(2)).toBeCloseTo(22.5);
  });

  it('Vorbereitungszeit je Prüfungsart, ab dem zweiten Versuch mehr', () => {
    expect(moduleHoursAuto(6, 'written')).toBe(57.5);
    expect(moduleHoursAuto(6, 'written', 2)).toBeGreaterThan(moduleHoursAuto(6, 'written'));
    expect(moduleHoursAuto(6, 'paper')).toBeGreaterThan(moduleHoursAuto(6, 'written'));
    expect(moduleHoursAuto(0.5, 'testat')).toBe(CONFIG.study.minHours);
    expect(moduleHoursAuto(60, 'paper')).toBe(CONFIG.study.capHours);
  });

  it('Vorlauf wächst mit den ECTS und ist begrenzt', () => {
    expect(moduleLeadDays(6)).toBe(25);
    expect(moduleLeadDays(1)).toBe(13);
    expect(moduleLeadDays(30)).toBe(CONFIG.study.lead.maxDays);
    expect(moduleLeadDays(6, 'paper')).toBe(30);
    expect(moduleLeadDays(60, 'paper')).toBe(CONFIG.study.lead.paperMaxDays);
  });

  it('Priorität: mehr ECTS, schwerer und späterer Versuch zählen', () => {
    const base = modulePriority({ ects: 6, difficulty: 3 }, {});
    expect(modulePriority({ ects: 12, difficulty: 3 }, {}).auto).toBeGreaterThan(base.auto);
    expect(modulePriority({ ects: 6, difficulty: 5 }, {}).auto).toBeGreaterThan(base.auto);
    expect(modulePriority({ ects: 6, difficulty: 3 }, { attempt: 3 }).auto).toBeGreaterThan(base.auto);
    expect(base.auto).toBeGreaterThanOrEqual(CONFIG.priority.min);
    expect(modulePriority({ ects: 60, difficulty: 5 }, { attempt: 3 }).auto).toBeLessThanOrEqual(CONFIG.priority.max);
  });
});

describe('planExam für Module', () => {
  const today = new Date(2026, 0, 5);
  const settings = { freeDaysPerWeek: 1 as const, dailyLimitMin: 300 };

  it('nutzt ECTS statt Notenpunkten', () => {
    const plan = planExam(mod(6), exam('2026-03-02'), settings, today);
    expect(plan.source).toBe('module');
    expect(plan.totalHours.auto).toBe(57.5);
    expect(plan.startDays.auto).toBe(25);
    expect(plan.hasPlan).toBe(true);
    expect(plan.overLimit).toBe(false);
  });

  it('ohne ECTS oder im Schulmodus gilt die alte Rechnung', () => {
    expect(planExam(mod(null), exam('2026-03-02'), settings, today).source).toBe('school');
    expect(planExam(mod(6, { scope: 'school' }), exam('2026-03-02'), settings, today).source).toBe('school');
  });

  it('manuelle Werte überschreiben den Vorschlag', () => {
    const plan = planExam(mod(6), exam('2026-03-02', { totalHoursManual: 20, startDaysManual: 10 }), settings, today);
    expect(plan.totalHours.value).toBe(20);
    expect(plan.totalHours.overridden).toBe(true);
    expect(plan.startDays.value).toBe(10);
  });

  it('kurzer Vorlauf wird auf die Tage bis zur Prüfung begrenzt', () => {
    const plan = planExam(mod(6), exam('2026-01-12'), settings, today);
    expect(plan.startDays.value).toBe(7);
  });
});

describe('Hausarbeit rückwärts planen', () => {
  it('verteilt die Schritte bis einen Tag vor der Abgabe', () => {
    const steps = writingSteps('2026-01-01', '2026-02-01');
    expect(steps).toHaveLength(CONFIG.study.writingSteps.length);
    expect(steps[steps.length - 1].due).toBe('2026-01-31');
    for (let i = 1; i < steps.length; i++) expect(steps[i].due >= steps[i - 1].due).toBe(true);
    expect(steps[0].due > '2026-01-01').toBe(true);
  });

  it('bei knapper Zeit fallen Schritte auf denselben Tag, bleiben aber in Reihenfolge', () => {
    const steps = writingSteps('2026-01-01', '2026-01-03');
    expect(steps.map((s) => s.due)).toEqual(['2026-01-02', '2026-01-02', '2026-01-02', '2026-01-02', '2026-01-02']);
  });
});
