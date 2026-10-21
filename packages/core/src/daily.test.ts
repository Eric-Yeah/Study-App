import { describe, expect, it } from 'vitest';
import { newCard } from './cards';
import { activeDaysOf, carriedTasks, dayWrapUp, quickRound, recommendFocus, streakOf, weekStrip, type FocusExam } from './daily';
import { addDays } from './schedule';

const TODAY = '2026-10-21'; // Mittwoch
const days = (...offsets: number[]) => new Set(offsets.map((o) => addDays(TODAY, o)));
const exam = (o: Partial<FocusExam> = {}): FocusExam => ({ examId: 'e1', subjectId: 'math', daysLeft: 5, hasPlan: true, behind: false, ...o });

describe('recommendFocus', () => {
  it('nimmt das Fach mit dem größten offenen Rest laut Tagesplan', () => {
    const r = recommendFocus({
      blocks: [
        { subjectId: 'math', examId: 'e1', minutes: 60 },
        { subjectId: 'bio', examId: 'e2', minutes: 45 },
      ],
      learnedBySubject: { math: 40 },
      exams: [exam(), exam({ examId: 'e2', subjectId: 'bio' })],
    });
    expect(r).toMatchObject({ subjectId: 'bio', examId: 'e2', reason: 'planned', plannedMin: 45, learnedMin: 0, remainingMin: 45 });
  });

  it('fasst mehrere Blöcke eines Fachs zusammen und rechnet das Gelernte ab', () => {
    const r = recommendFocus({
      blocks: [
        { subjectId: 'math', examId: 'e1', minutes: 30 },
        { subjectId: 'math', examId: 'e3', minutes: 40 },
      ],
      learnedBySubject: { math: 25 },
      exams: [],
    });
    expect(r).toMatchObject({ subjectId: 'math', plannedMin: 70, learnedMin: 25, remainingMin: 45, examId: 'e3' });
  });

  it('bei gleichem Rest gewinnt die nähere Klausur', () => {
    const r = recommendFocus({
      blocks: [
        { subjectId: 'math', examId: 'e1', minutes: 30 },
        { subjectId: 'bio', examId: 'e2', minutes: 30 },
      ],
      learnedBySubject: {},
      exams: [exam({ daysLeft: 9 }), exam({ examId: 'e2', subjectId: 'bio', daysLeft: 2 })],
    });
    expect(r.subjectId).toBe('bio');
  });

  it('meldet done, wenn der Plan erfüllt ist, und bleibt beim zuletzt benutzten Fach', () => {
    const input = {
      blocks: [
        { subjectId: 'math', examId: 'e1', minutes: 30 },
        { subjectId: 'bio', examId: 'e2', minutes: 45 },
      ],
      learnedBySubject: { math: 30, bio: 50 },
      exams: [],
    };
    expect(recommendFocus(input)).toMatchObject({ reason: 'done', subjectId: 'bio', remainingMin: 0 });
    expect(recommendFocus({ ...input, lastSubjectId: 'math' })).toMatchObject({ reason: 'done', subjectId: 'math' });
  });

  it('ohne Blöcke heute: erst die Klausur, bei der man hinten liegt, dann die nächste', () => {
    const exams = [exam({ examId: 'a', subjectId: 'math', daysLeft: 3 }), exam({ examId: 'b', subjectId: 'bio', daysLeft: 10, behind: true })];
    expect(recommendFocus({ blocks: [], learnedBySubject: {}, exams })).toMatchObject({ reason: 'behind', subjectId: 'bio', examId: 'b' });
    expect(recommendFocus({ blocks: [], learnedBySubject: {}, exams: [exams[0]!] })).toMatchObject({ reason: 'next_exam', subjectId: 'math' });
  });

  it('ohne Klausuren zählt das zuletzt benutzte Fach, sonst nichts', () => {
    expect(recommendFocus({ blocks: [], learnedBySubject: {}, exams: [], lastSubjectId: 'eng' })).toMatchObject({ reason: 'last', subjectId: 'eng' });
    expect(recommendFocus({ blocks: [], learnedBySubject: {}, exams: [] })).toMatchObject({ reason: 'none', subjectId: null });
  });

  it('überspringt Fächer, die man nicht wählen darf, und vergangene Klausuren', () => {
    const r = recommendFocus({
      blocks: [{ subjectId: 'old', examId: 'x', minutes: 90 }, { subjectId: 'math', examId: 'e1', minutes: 20 }],
      learnedBySubject: {},
      exams: [exam({ daysLeft: -1 })],
      allowed: new Set(['math']),
    });
    expect(r.subjectId).toBe('math');
    expect(recommendFocus({ blocks: [], learnedBySubject: {}, exams: [exam({ daysLeft: -1 })] }).reason).toBe('none');
  });
});

describe('activeDaysOf', () => {
  it('zählt Fokuszeit, Karten und erledigte Aufgaben ab den Schwellen', () => {
    const set = activeDaysOf({
      learnedByDate: { '2026-10-01': 9, '2026-10-02': 10 },
      cardsByDate: { '2026-10-03': 4, '2026-10-04': 5 },
      tasksDoneByDate: { '2026-10-05': 1, '2026-10-06': 0 },
    });
    expect([...set].sort()).toEqual(['2026-10-02', '2026-10-04', '2026-10-05']);
  });
});

describe('streakOf', () => {
  it('zählt Tage in Folge und heute mit', () => {
    const r = streakOf({ today: TODAY, activeDays: days(0, -1, -2) });
    expect(r).toMatchObject({ current: 3, todayDone: true, atRisk: false, breakIfMissed: false });
  });

  it('heute offen bricht die Serie nicht, ist aber gefährdet', () => {
    const r = streakOf({ today: TODAY, activeDays: days(-1, -2, -3, -4) });
    expect(r).toMatchObject({ current: 4, todayDone: false, atRisk: true, breakIfMissed: false });
  });

  it('ein einzelner Ausfalltag wird verziehen, danach hängt die Serie an heute', () => {
    // gestern ausgefallen, davor 3 Tage aktiv
    const r = streakOf({ today: TODAY, activeDays: days(-2, -3, -4) });
    expect(r.current).toBe(3);
    expect(r.forgivenDay).toBe(addDays(TODAY, -1));
    expect(r.breakIfMissed).toBe(true); // fällt heute auch aus, ist sie weg
    expect(streakOf({ today: TODAY, activeDays: days(0, -2, -3, -4) })).toMatchObject({ current: 4, breakIfMissed: false });
  });

  it('zwei Ausfalltage hintereinander brechen die Serie', () => {
    const r = streakOf({ today: TODAY, activeDays: days(-3, -4, -5) });
    expect(r.current).toBe(0);
    expect(r.atRisk).toBe(false);
  });

  it('Gnade gibt es erst nach einer Woche wieder', () => {
    // aktiv: -9,-8,-7 | Lücke -6 (verziehen) | -5,-4,-3 | Lücke -2 (zu früh für die nächste Gnade) | -1
    const r = streakOf({ today: TODAY, activeDays: days(-9, -8, -7, -5, -4, -3, -1) });
    expect(r.current).toBe(1);
    // mit genug Abstand wird auch ein zweiter Ausfalltag verziehen
    const ok = streakOf({ today: TODAY, activeDays: days(-12, -11, -10, -8, -7, -6, -5, -4, -3, -1) });
    expect(ok.current).toBe(10);
  });

  it('pausierte Tage ("fällt aus") sind neutral', () => {
    const r = streakOf({ today: TODAY, activeDays: days(-1, -3, -4), pausedDays: days(-2) });
    expect(r.current).toBe(3);
    expect(r.forgivenDay).toBeNull();
  });

  it('ohne Aktivität keine Serie, bester Wert bleibt erhalten', () => {
    expect(streakOf({ today: TODAY, activeDays: new Set() })).toMatchObject({ current: 0, best: 0, atRisk: false, breakIfMissed: false });
    const r = streakOf({ today: TODAY, activeDays: days(-30, -29, -28, -27, -26, -2, -1, 0) });
    expect(r.current).toBe(3);
    expect(r.best).toBe(5);
  });
});

describe('weekStrip', () => {
  it('ordnet Montag bis Sonntag und rechnet Summen', () => {
    const strip = weekStrip({
      today: TODAY,
      activeDays: new Set(['2026-10-19', TODAY]),
      pausedDays: new Set(['2026-10-20']),
      learnedByDate: { '2026-10-19': 40, [TODAY]: 20 },
      plannedByDate: { '2026-10-19': 60, [TODAY]: 60, '2026-10-22': 30 },
    });
    expect(strip.days.map((d) => d.label)).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
    expect(strip.days.map((d) => d.state)).toEqual(['done', 'paused', 'done', 'future', 'future', 'future', 'future']);
    expect(strip).toMatchObject({ learnedMin: 60, plannedMin: 150, activeCount: 2 });
    expect(strip.days[2]!.isToday).toBe(true);
  });

  it('verpasste Tage und heute ohne Aktivität', () => {
    const strip = weekStrip({ today: TODAY, activeDays: new Set(), learnedByDate: {} });
    expect(strip.days.map((d) => d.state)).toEqual(['missed', 'missed', 'today', 'future', 'future', 'future', 'future']);
  });
});

describe('quickRound', () => {
  const make = (id: string, due: string, reps: number) => ({ ...newCard({ id, subjectId: null, noteId: null, front: id, back: id }, due, `2026-10-0${id.length}`), reps, due });
  it('nimmt fällige Karten und wenige neue, schätzt die Dauer', () => {
    const cards = [
      ...Array.from({ length: 12 }, (_, i) => make(`r${i}`, '2026-10-20', 2)),
      ...Array.from({ length: 6 }, (_, i) => make(`n${i}`, TODAY, 0)),
      make('later', '2026-11-01', 3),
    ];
    const r = quickRound(cards, TODAY);
    expect(r.queue.length).toBe(10);
    expect(r.reviews).toBe(10);
    expect(r.fresh).toBe(0);
    expect(r.minutes).toBe(2);
  });
  it('leere Runde ohne Dauer', () => {
    expect(quickRound([], TODAY)).toMatchObject({ queue: [], minutes: 0 });
  });
  it('mischt neue Karten dazu, wenn Platz ist', () => {
    const r = quickRound([make('a', '2026-10-20', 1), ...Array.from({ length: 6 }, (_, i) => make(`n${i}`, TODAY, 0))], TODAY);
    expect(r.reviews).toBe(1);
    expect(r.fresh).toBe(3);
  });
});

describe('carriedTasks', () => {
  it('zeigt offene Aufgaben der letzten Tage, nicht heute, nicht erledigte, nicht zu alte', () => {
    const t = (date: string, done = false) => ({ id: date + done, date, done });
    const out = carriedTasks([t(TODAY), t('2026-10-20'), t('2026-10-19', true), t('2026-10-18'), t('2026-10-01'), t('2026-10-22')], TODAY);
    expect(out.map((x) => x.date)).toEqual(['2026-10-18', '2026-10-20']);
  });
});

describe('dayWrapUp', () => {
  const base = { tasksDone: 0, cardsReviewed: 0, streak: { current: 0, todayDone: false } };
  it('Ziel geschafft', () => {
    const w = dayWrapUp({ ...base, learnedMin: 75, goalMin: 60, tasksDone: 2, cardsReviewed: 8, streak: { current: 5, todayDone: true } });
    expect(w.level).toBe('great');
    expect(w.text).toContain('1 Std. 15 min gelernt');
    expect(w.text).toContain('8 Karten geübt');
    expect(w.text).toContain('Serie: 5 Tage');
  });
  it('mehr als die Hälfte', () => {
    const w = dayWrapUp({ ...base, learnedMin: 35, goalMin: 60, streak: { current: 1, todayDone: true } });
    expect(w.level).toBe('good');
    expect(w.text).toContain('25 min');
  });
  it('wenig, aber Aktivität', () => {
    expect(dayWrapUp({ ...base, learnedMin: 12, goalMin: 90, streak: { current: 1, todayDone: true } }).level).toBe('some');
  });
  it('freier Tag und verpasster Tag', () => {
    expect(dayWrapUp({ ...base, learnedMin: 0, goalMin: 0 }).level).toBe('free');
    expect(dayWrapUp({ ...base, learnedMin: 0, goalMin: 60 }).level).toBe('none');
  });
});
