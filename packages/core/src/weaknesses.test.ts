import { describe, expect, it } from 'vitest';
import type { ExamResult, ExamTask } from './examGrading';
import type { ExamReview } from './examReviews';
import { subjectOverview, weaknessReport } from './weaknesses';

const task = (operator: string, afb: 1 | 2 | 3 | null, max: number, punkte: number): ExamTask => ({
  nr: '1',
  titel: '',
  operator,
  afb,
  max,
  max_geschaetzt: false,
  punkte,
  richtig: [],
  fehlt: [],
  tipp: '',
  unsicher: false,
});

const result = (aufgaben: ExamTask[], schwaechen: string[] = [], schritte: string[] = []): ExamResult => ({
  aufgaben,
  teile: { darstellung: null, richtigkeit: null, ausdruck: null, uebersetzung_fehler: null, uebersetzung_woerter: null },
  sprache: { fehler: null, woerter: null, anteil: null },
  staerken: [],
  schwaechen,
  naechste_schritte: schritte,
  lesbarkeit: 'sicher',
  erwartung_genutzt: false,
});

const review = (id: string, aufgaben: ExamTask[], o: Partial<ExamReview> = {}, texts: [string[], string[]] = [[], []]): ExamReview => ({
  id,
  subjectId: 'bio',
  examId: null,
  title: '',
  examDate: '2026-09-01',
  teacher: '',
  quarter: 'Q1',
  maxPoints: null,
  horizonText: '',
  main: { model: 'claude-sonnet-5-5', effort: 'medium', at: '', result: result(aufgaben, ...texts) },
  compare: null,
  teacherPoints: null,
  teacherTasks: null,
  learnedAt: null,
  practiceId: null,
  createdAt: id,
  ...o,
});

const subjects = [
  { id: 'bio', name: 'Biologie', type: 'knowledge' },
  { id: 'de', name: 'Deutsch', type: 'writing' },
];

describe('weaknessReport', () => {
  it('ist ohne Korrekturen leer', () => {
    const r = weaknessReport([], subjects);
    expect(r.reviews).toBe(0);
    expect(r.share).toBeNull();
    expect(r.hints).toEqual([]);
  });

  it('fasst Operatoren zusammen, schwächste zuerst, und braucht genug Aufgaben', () => {
    const list = [
      review('a', [task('Beschreiben', 1, 10, 9), task('Beurteilen', 3, 10, 3), task('Erörtern', 3, 10, 5)]),
      review('b', [task('beschreiben', 1, 10, 10), task('Beurteilen', 3, 10, 4)]),
    ];
    const r = weaknessReport(list, subjects);
    expect(r.tasks).toBe(5);
    expect(r.byOperator.map((o) => o.key)).toEqual(['beurteilen', 'beschreiben']); // Erörtern hat nur eine Aufgabe
    expect(r.byOperator[0]).toMatchObject({ label: 'Beurteilen', tasks: 2, max: 20, points: 7, lost: 13 });
    expect(r.byOperator[0]!.share).toBeCloseTo(0.35);
    expect(r.weakOperators.map((o) => o.key)).toEqual(['beurteilen']);
  });

  it('wertet die Anforderungsbereiche aus und gibt einen Hinweis bei großem Abstand', () => {
    const list = [review('a', [task('x', 1, 10, 9), task('y', 1, 10, 9), task('z', 3, 10, 4), task('w', 3, 10, 5)])];
    const r = weaknessReport(list, subjects);
    expect(r.byAfb.map((a) => a.label)).toEqual(['AFB I', 'AFB III']);
    expect(r.hints.some((h) => h.includes('Anforderungsbereich III'))).toBe(true);
  });

  it('trennt echte Klausuren und Übungsklausuren', () => {
    const list = [review('a', [task('x', 1, 10, 10)]), review('b', [task('x', 1, 10, 2)], { practiceId: 'p1' })];
    expect(weaknessReport(list, subjects).share).toBe(1);
    expect(weaknessReport(list, subjects, { practice: true }).share).toBeCloseTo(0.2);
  });

  it('filtert nach Fach und ignoriert Korrekturen ohne Ergebnis', () => {
    const list = [review('a', [task('x', 1, 10, 10)]), review('b', [task('x', 1, 10, 4)], { subjectId: 'de' }), review('c', [], { main: null })];
    expect(weaknessReport(list, subjects, { subjectId: 'de' }).share).toBeCloseTo(0.4);
    expect(weaknessReport(list, subjects).reviews).toBe(2);
  });

  it('begrenzt Punkte auf das Maximum und überspringt Aufgaben ohne Punktzahl', () => {
    const r = weaknessReport([review('a', [task('x', 1, 10, 14), task('y', 1, 0, 0)])], subjects);
    expect(r.tasks).toBe(1);
    expect(r.share).toBe(1);
  });

  it('zeigt den Verlauf je Q-Phase und einen Trend', () => {
    // 81 % -> 12 Punkte, 51 % -> 6 Punkte (Anlage 9a)
    const list = [
      review('a', [task('x', 2, 100, 51)], { quarter: 'Q1' }),
      review('b', [task('x', 2, 100, 81)], { quarter: 'Q2' }),
      review('c', [task('x', 2, 100, 70)], { quarter: null }),
    ];
    const r = weaknessReport(list, subjects);
    expect(r.perQuarter.map((q) => q.quarter)).toEqual(['Q1', 'Q2', null]);
    expect(r.perQuarter[0]).toMatchObject({ reviews: 1, points: 6 });
    expect(r.perQuarter[1]).toMatchObject({ points: 12 });
    expect(r.hints.some((h) => h.includes('Q1 zu Q2') && h.includes('verbessert'))).toBe(true);
  });

  it('nennt Schwächen und Schritte der letzten Korrekturen ohne Doppelte', () => {
    const list = [
      review('a', [], {}, [['Belege fehlen'], ['Zitate üben']]),
      review('b', [], { examDate: '2026-09-10' }, [['Belege fehlen', 'Fazit zu kurz'], ['Zitate üben']]),
      review('c', [], { examDate: '2026-01-10' }, [['alt'], ['alt']]),
      review('d', [], { examDate: '2026-02-10' }, [['auch alt'], []]),
      review('e', [], { examDate: '2026-03-10' }, [['schon sehr alt'], []]),
    ];
    const r = weaknessReport(list, subjects);
    expect(r.weaknesses).toHaveLength(3);
    expect(r.weaknesses).toContain('Fazit zu kurz');
    expect(new Set(r.weaknesses).size).toBe(r.weaknesses.length);
    expect(r.weaknesses).not.toContain('alt');
    expect(r.nextSteps.filter((x) => x === 'Zitate üben')).toHaveLength(1);
  });
});

describe('subjectOverview', () => {
  it('ordnet die Fächer, das schwächste zuerst', () => {
    const list = [
      review('a', [task('Beurteilen', 3, 10, 2), task('Beurteilen', 3, 10, 3)], { subjectId: 'bio' }),
      review('b', [task('Analysieren', 2, 10, 9)], { subjectId: 'de' }),
    ];
    const o = subjectOverview(list, subjects);
    expect(o.map((x) => x.name)).toEqual(['Biologie', 'Deutsch']);
    expect(o[0]!.weakest?.label).toBe('Beurteilen');
    expect(o[0]!.weakestAfb?.label).toBe('AFB III');
    expect(o[1]!.weakest).toBeNull();
  });
});
