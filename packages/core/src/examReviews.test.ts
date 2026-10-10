import { describe, expect, it } from 'vitest';
import type { ExamResult } from './examGrading';
import {
  examModelAccuracy,
  gradedSamples,
  lastTeacher,
  readLessons,
  readPracticeContent,
  readPracticeMeta,
  reviewsOfPractice,
  readStoredGrading,
  readTeacherTasks,
  reviewView,
  rubricFor,
  subjectCalibration,
  taskComparison,
  type ExamReview,
} from './examReviews';

const SONNET = 'claude-sonnet-5-5';
const HAIKU = 'claude-haiku-5-5';

// Prozent der Aufgabe bestimmt die Note (Anlage 9a): 81 % -> 12, 71 % -> 10, 61 % -> 8, 51 % -> 6
const res = (punkte: number): ExamResult => ({
  aufgaben: [{ nr: '1a', titel: 'Analyse', operator: '', afb: 2, max: 100, max_geschaetzt: false, punkte, richtig: [], fehlt: [], tipp: '', unsicher: false }],
  teile: { darstellung: null, richtigkeit: null, ausdruck: null, uebersetzung_fehler: null, uebersetzung_woerter: null },
  sprache: { fehler: null, woerter: null, anteil: null },
  staerken: [],
  schwaechen: [],
  naechste_schritte: [],
  lesbarkeit: 'sicher',
  erwartung_genutzt: false,
});

const review = (id: string, punkte: number, teacherPoints: number | null, o: Partial<ExamReview> = {}): ExamReview => ({
  id,
  subjectId: 'bio',
  examId: null,
  title: '',
  examDate: '2026-09-01',
  teacher: 'Müller',
  quarter: 'Q1',
  maxPoints: null,
  horizonText: '',
  main: { model: SONNET, effort: 'medium', at: '', result: res(punkte) },
  compare: null,
  teacherPoints,
  teacherTasks: null,
  learnedAt: null,
  practiceId: null,
  createdAt: '',
  ...o,
});

const subjects = [
  { id: 'bio', name: 'Biologie', type: 'knowledge' },
  { id: 'de', name: 'Deutsch', type: 'writing' },
];

describe('gespeicherte Daten lesen', () => {
  it('Ergebnis nur mit gültiger Form', () => {
    expect(readStoredGrading({ model: SONNET, effort: 'medium', at: 'x', result: res(50) })?.result.aufgaben[0].punkte).toBe(50);
    expect(readStoredGrading({ model: SONNET, result: { aufgaben: [] } })).toBeNull();
    expect(readStoredGrading({ result: res(50) })).toBeNull();
    expect(readStoredGrading(null)).toBeNull();
    expect(readStoredGrading('x')).toBeNull();
  });

  it('Erfahrungen und Punkte je Aufgabe', () => {
    expect(readLessons([{ id: 'a', text: 'A', source: 'eigene', teacher: 'M', createdAt: '' }, { id: 'b', text: ' ' }, null, { text: 'ohne id' }])).toEqual([
      { id: 'a', text: 'A', source: 'eigene', teacher: 'M', createdAt: '' },
    ]);
    expect(readLessons('x')).toEqual([]);
    expect(readTeacherTasks([{ nr: '1', punkte: 4 }, { nr: 2, punkte: 3 }, { nr: '3', punkte: NaN }])).toEqual([{ nr: '1', punkte: 4 }]);
    expect(readTeacherTasks(null)).toBeNull();
  });
});

describe('Note und Abgleich', () => {
  it('Muster und Note nach Fach', () => {
    expect(rubricFor(undefined).family).toBe('allgemein');
    expect(rubricFor(subjects[1]).scheme).toBe('deutsch');
  });

  it('ohne frühere Vergleichswerte zeigt die App die Note der KI', () => {
    const r = review('a', 81, null);
    const v = reviewView(r, [r], subjects);
    expect(v.grade?.points).toBe(12);
    expect(v.shown).toBe(12);
    expect(v.calibration.n).toBe(0);
  });

  it('frühere Klausuren derselben Lehrkraft verschieben die Note, die eigene Note der Lehrkraft nicht', () => {
    // KI 12, Lehrkraft 9 und KI 10, Lehrkraft 7: im Schnitt 3 Punkte strenger, bei zwei Werten zur Hälfte: -1,5
    const old = [review('o1', 81, 9), review('o2', 71, 7)];
    const now = review('n', 81, 12);
    const v = reviewView(now, [...old, now], subjects);
    expect(v.calibration.basis).toBe('lehrkraft');
    expect(v.calibration.shift).toBe(-1.5);
    expect(v.shown).toBe(11); // 12 - 1,5 = 10,5 -> 11
  });

  it('nur Vergleichswerte desselben Modells', () => {
    const old = [review('o1', 81, 5, { main: { model: HAIKU, effort: 'high', at: '', result: res(81) } })];
    const now = review('n', 81, null);
    expect(reviewView(now, [...old, now], subjects).calibration.n).toBe(0);
  });

  it('Vergleichswerte aus Korrektur und Vergleich, nur mit Note der Lehrkraft', () => {
    const r = review('a', 81, 10, { compare: { model: HAIKU, effort: 'high', at: '', result: res(61) } });
    const samples = gradedSamples([r, review('b', 50, null)], subjects);
    expect(samples).toEqual([
      { subjectId: 'bio', teacher: 'Müller', model: SONNET, aiPoints: 12, teacherPoints: 10 },
      { subjectId: 'bio', teacher: 'Müller', model: HAIKU, aiPoints: 8, teacherPoints: 10 },
    ]);
    const acc = examModelAccuracy([r], subjects);
    expect(acc.map((a) => [a.model, a.meanAbs])).toEqual([
      [SONNET, 2],
      [HAIKU, 2],
    ]);
    const v = reviewView(r, [r], subjects);
    expect(v.compareGrade?.points).toBe(8);
  });

  it('Abgleich für das Korrekturmuster eines Fachs', () => {
    const c = subjectCalibration('bio', 'Müller', [review('o1', 81, 9)], subjects);
    expect(c.n).toBe(1);
    expect(c.shift).toBe(-1);
    expect(subjectCalibration('de', '', [review('o1', 81, 9)], subjects).n).toBe(0);
  });
});

describe('Aufgaben und Vorschläge', () => {
  it('Punkte je Aufgabe neben denen der Lehrkraft', () => {
    const r = review('a', 70, 9, { teacherTasks: [{ nr: '1 a)', punkte: 60 }] });
    expect(taskComparison(r)).toEqual([{ nr: '1a', titel: 'Analyse', max: 100, ai: 70, teacher: 60 }]);
    expect(taskComparison(review('b', 70, null, { main: null }))).toEqual([]);
  });

  it('zuletzt eingetragene Lehrkraft eines Fachs', () => {
    const list = [review('a', 1, null, { teacher: 'Alt', examDate: '2026-01-01' }), review('b', 1, null, { teacher: 'Neu', examDate: '2026-06-01' }), review('c', 1, null, { teacher: '', examDate: '2026-09-01' })];
    expect(lastTeacher(list, 'bio')).toBe('Neu');
    expect(lastTeacher(list, 'de')).toBe('');
  });
});

describe('Note mit Tendenz', () => {
  it('Notenpunkte in Noten', async () => {
    const { pointsLabel } = await import('./hessen');
    expect([15, 14, 13, 12, 11, 10, 9, 7, 6, 4, 3, 1, 0].map(pointsLabel)).toEqual(['1+', '1', '1-', '2+', '2', '2-', '3+', '3-', '4+', '4-', '5+', '5-', '6']);
  });
});

describe('Übungsklausuren in der App', () => {
  it('Inhalt und Herkunft sicher lesen', () => {
    const content = { titel: 'T', dauer_min: 90, hilfsmittel: '', hinweise: [], gesamt_be: 10, teile: [{ name: 'A', hinweis: '', materialien: [], aufgaben: [{ nr: '1', operator: 'Nenne', afb: 1, text: 'Nenne etwas.', be: 10, teilaufgaben: [], erwartung: ['x (10 BE)'], loesung: 'y' }] }] };
    expect(readPracticeContent(content)?.gesamt_be).toBe(10);
    expect(readPracticeContent(content)?.teile[0].aufgaben[0].loesung).toBe('y');
    expect(readPracticeContent({ teile: [] })).toBeNull();
    expect(readPracticeContent(null)).toBeNull();
    expect(readPracticeMeta({ difficulty: 'schwer', profileN: 2, shift: 1, afb: [10, 40, 50], totalBe: 60 })).toEqual({ difficulty: 'schwer', profileN: 2, shift: 1, afb: [10, 40, 50], totalBe: 60, styleN: 0 });
    expect(readPracticeMeta({ difficulty: 'leicht', afb: [1, 2, 3], totalBe: 1, styleN: 2.4 })?.styleN).toBe(2);
    expect(readPracticeMeta({ difficulty: 'extrem', afb: [1, 2, 3], totalBe: 1 })).toBeNull();
    expect(readPracticeMeta({ difficulty: 'leicht', afb: [1, 2], totalBe: 1 })).toBeNull();
    expect(readPracticeMeta({})).toBeNull();
  });

  it('Korrekturen einer Übungsklausur, die neueste zuerst', () => {
    const list = [review('a', 50, null, { practiceId: 'p1', createdAt: '2026-10-01' }), review('b', 50, null, { practiceId: 'p1', createdAt: '2026-10-05' }), review('c', 50, null)];
    expect(reviewsOfPractice(list, 'p1').map((r) => r.id)).toEqual(['b', 'a']);
    expect(reviewsOfPractice(list, 'x')).toEqual([]);
  });
});
