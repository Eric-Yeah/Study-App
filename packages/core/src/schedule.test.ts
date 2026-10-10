import { describe, expect, it } from 'vitest';
import { addDays, expectedMinutesBeforeToday, isFreeWeekday, planAll, plannedOn, realityCheck, type PlanInput } from './schedule';
import type { ExamPlan } from './logic';

// 2026-10-05 ist ein Montag, 2026-10-11 ein Sonntag
const TODAY = '2026-10-05';
const input = (over: Partial<PlanInput>): PlanInput => ({
  examId: 'a',
  examDate: '2026-10-15',
  startDate: '2026-10-05',
  totalMin: 300,
  learnedBeforeTodayMin: 0,
  ...over,
});
const opts = { today: TODAY, dailyLimitMin: 180, freeDaysPerWeek: 0 as const };
const sum = (p: ReturnType<typeof planAll>, id: string) =>
  p.days.reduce((s, d) => s + d.blocks.filter((b) => b.examId === id).reduce((x, b) => x + b.minutes, 0), 0);

describe('Datumshilfen', () => {
  it('addDays und lernfreie Wochentage', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(isFreeWeekday('2026-10-11', 1)).toBe(true); // Sonntag
    expect(isFreeWeekday('2026-10-14', 1)).toBe(false); // Mittwoch
    expect(isFreeWeekday('2026-10-14', 2)).toBe(true);
    expect(isFreeWeekday('2026-10-11', 0)).toBe(false);
  });
});

describe('planAll', () => {
  it('verteilt eine Klausur gleichmäßig und plant die volle Zeit', () => {
    const p = planAll([input({})], opts);
    expect(sum(p, 'a')).toBe(300);
    expect(p.shortfall).toEqual({});
    expect(p.days[0].blocks[0].minutes).toBe(30); // 300 min auf 10 Tage
    expect(p.days.find((d) => d.date === '2026-10-14')?.blocks.length).toBe(1);
    expect(p.days.find((d) => d.date === '2026-10-15')?.blocks.length).toBe(0); // Klausurtag
  });

  it('plant nicht an lernfreien Tagen', () => {
    const p = planAll([input({})], { ...opts, freeDaysPerWeek: 1 });
    expect(p.days.find((d) => d.date === '2026-10-11')?.totalMin).toBe(0);
    expect(sum(p, 'a')).toBe(300);
  });

  it('ein ausgefallener Tag verschiebt die Zeit auf die übrigen Tage', () => {
    const base = planAll([input({})], opts);
    const out = planAll([input({})], { ...opts, overrides: { '2026-10-06': 0, '2026-10-07': 0 } });
    expect(plannedOn(out, '2026-10-06')).toEqual([]);
    expect(sum(out, 'a')).toBe(300);
    expect(out.days[0].blocks[0].minutes).toBeGreaterThan(base.days[0].blocks[0].minutes);
    expect(out.days.find((d) => d.date === '2026-10-06')?.overridden).toBe(true);
  });

  it('weniger Zeit an einem Tag begrenzt diesen Tag', () => {
    const p = planAll([input({ totalMin: 600 })], { ...opts, overrides: { '2026-10-05': 20 } });
    expect(p.days[0].totalMin).toBeLessThanOrEqual(20 * 1.15 + 1);
    expect(p.days[0].capacityMin).toBe(20);
  });

  it('bereits gelernte Zeit verkleinert die Restzeit', () => {
    const p = planAll([input({ learnedBeforeTodayMin: 120 })], opts);
    expect(sum(p, 'a')).toBe(180);
  });

  it('die frühere Klausur bekommt bei knapper Zeit den Vortritt, der Rest rutscht', () => {
    const early = input({ examId: 'early', examDate: '2026-10-08', startDate: '2026-10-05', totalMin: 360 });
    const late = input({ examId: 'late', examDate: '2026-10-20', startDate: '2026-10-05', totalMin: 600 });
    const p = planAll([late, early], { ...opts, dailyLimitMin: 150 });
    expect(p.days[0].blocks[0].examId).toBe('early');
    expect(p.days.every((d) => d.totalMin <= 150 * 1.15)).toBe(true);
    // die frühe Klausur wird vollständig geplant, soweit es das Limit erlaubt
    expect(sum(p, 'early')).toBeGreaterThan(300);
  });

  it('meldet fehlende Zeit, wenn alles nicht passt', () => {
    const p = planAll([input({ totalMin: 3000 })], opts);
    expect(p.shortfall.a).toBeGreaterThan(0);
    expect(sum(p, 'a') + p.shortfall.a).toBe(3000);
  });

  it('am letzten möglichen Tag darf das Limit leicht überschritten werden', () => {
    const p = planAll([input({ examDate: '2026-10-06', totalMin: 200 })], { ...opts, dailyLimitMin: 180 });
    expect(p.days[0].totalMin).toBe(200); // über dem Limit von 180, aber im Spielraum (207)
    expect(p.days[0].overLimit).toBe(true);
    expect(p.shortfall).toEqual({});
    // mehr als der Spielraum erlaubt wird abgeschnitten und als fehlend gemeldet
    const q = planAll([input({ examDate: '2026-10-06', totalMin: 300 })], { ...opts, dailyLimitMin: 180 });
    expect(q.days[0].totalMin).toBe(205);
    expect(q.shortfall.a).toBe(95);
  });

  it('ignoriert vergangene Klausuren, Klausuren ohne Zeit und kennt Wiederholungstage', () => {
    expect(planAll([input({ examDate: '2026-10-05' }), input({ totalMin: 0 })], opts).days).toEqual([]);
    const p = planAll([input({ reviewDates: new Set(['2026-10-07']) })], opts);
    expect(p.days.find((d) => d.date === '2026-10-07')?.blocks[0].kind).toBe('review');
  });
});

describe('Realitätscheck', () => {
  const plan = (startDays: number, daysLeft: number, perDay: number, timeline: ExamPlan['timeline']) =>
    ({ startDays: { value: startDays }, daysLeft, minutesPerStudyDay: perDay, timeline }) as unknown as ExamPlan;

  it('zählt die Soll-Minuten vor heute aus der Zeitleiste', () => {
    // Start vor 4 Tagen, heute ist Index 4: Tage 0..3 = study, study, free, review
    const p = plan(10, 6, 30, ['study', 'study', 'free', 'review', 'study', 'study', 'study', 'study', 'study', 'study', 'exam']);
    expect(expectedMinutesBeforeToday(p)).toBe(90);
  });

  it('bewertet voraus, im Plan, zurück und weit zurück', () => {
    expect(realityCheck(0, 0).status).toBe('not_started');
    expect(realityCheck(300, 400).status).toBe('ahead');
    expect(realityCheck(300, 290).status).toBe('on_track');
    expect(realityCheck(300, 300 - 60).status).toBe('behind');
    expect(realityCheck(300, 100).status).toBe('far_behind');
    expect(realityCheck(300, 100).deltaMin).toBe(-200);
  });
});
