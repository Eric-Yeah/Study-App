import { describe, expect, it } from 'vitest';
import { emptyPlan } from './abitur';
import {
  clampShare,
  clampWeight,
  courseGrade,
  courseGradesForAbitur,
  currentPoints,
  emptyGradeSettings,
  examsWithoutGrade,
  neededPoints,
  pointsToDecimalGrade,
  quarterOverview,
  readGradeSettings,
  reviewCandidates,
  reviewGradeId,
  trendOf,
  type GradeEntry,
  type GradeKind,
} from './grades';
import type { ExamReview } from './examReviews';
import type { Exam, Subject } from './types';

let n = 0;
const entry = (points: number, kind: GradeKind = 'oral', extra: Partial<GradeEntry> = {}): GradeEntry => ({
  id: `g${(n += 1)}`,
  subjectId: 'm',
  quarter: 'Q1',
  date: `2026-0${1 + (n % 9)}-10`,
  kind,
  title: '',
  points,
  weight: kind === 'homework' ? 0.5 : 1,
  examId: null,
  ...extra,
});

const subject = (id: string, extra: Partial<Subject> = {}): Subject => ({
  id,
  name: id,
  color: '#000',
  isAdvanced: false,
  isExamSubject: false,
  status: 'active',
  type: 'knowledge',
  points: 9,
  difficulty: 3,
  language: 'de',
  ...extra,
});

describe('courseGrade', () => {
  it('ohne Noten gibt es keine Kursnote', () => {
    const g = courseGrade([]);
    expect(g.points).toBeNull();
    expect(g.exact).toBeNull();
  });

  it('mischt Klausuren und sonstige Leistungen nach dem Verhältnis', () => {
    const list = [entry(10, 'exam'), entry(12, 'exam'), entry(8, 'oral'), entry(10, 'test')];
    const half = courseGrade(list, 50);
    expect(half.written).toBe(11);
    expect(half.other).toBe(9);
    expect(half.exact).toBe(10);
    expect(half.points).toBe(10);
    const sixty = courseGrade(list, 60);
    expect(sixty.exact).toBeCloseTo(10.2, 5);
  });

  it('gewichtet innerhalb einer Gruppe', () => {
    const list = [entry(15, 'oral', { weight: 3 }), entry(7, 'oral', { weight: 1 })];
    expect(courseGrade(list).exact).toBe(13);
  });

  it('zählt allein die vorhandene Gruppe, wenn die andere noch leer ist', () => {
    const onlyOther = courseGrade([entry(9, 'oral'), entry(11, 'test')], 50);
    expect(onlyOther.exact).toBe(10);
    expect(onlyOther.share).toBe(0);
    const onlyExams = courseGrade([entry(6, 'exam')], 50);
    expect(onlyExams.exact).toBe(6);
    expect(onlyExams.share).toBe(100);
  });

  it('rundet ab ,5 auf', () => {
    expect(courseGrade([entry(9, 'exam'), entry(10, 'oral')], 50).points).toBe(10); // 9,5
    expect(courseGrade([entry(9, 'exam'), entry(9, 'oral'), entry(10, 'oral')], 50).points).toBe(9); // 9,25
  });
});

describe('neededPoints', () => {
  const base = [entry(8, 'exam'), entry(7, 'oral')]; // 7,5 -> 8 Punkte

  it('findet die kleinste nötige Punktzahl', () => {
    // Ziel 9: Klausur-Ø (8 + x) / 2, sonstige 7, Mischung 50 : 50 -> ab 12 Punkten 8,5
    const r = neededPoints(base, 50, { kind: 'exam', weight: 1 }, 9);
    expect(r).toEqual({ status: 'needed', points: 12 });
    expect(courseGrade([...base, entry(12, 'exam')], 50).points).toBe(9);
    expect(courseGrade([...base, entry(11, 'exam')], 50).points).toBe(8);
  });

  it('meldet, wenn selbst 15 Punkte nicht reichen', () => {
    const low = [entry(2, 'exam'), entry(2, 'oral')];
    expect(neededPoints(low, 50, { kind: 'oral', weight: 1 }, 15).status).toBe('impossible');
  });

  it('meldet, wenn das Ziel schon sicher ist', () => {
    const high = [entry(15, 'exam', { weight: 5 }), entry(15, 'oral', { weight: 5 })];
    const r = neededPoints(high, 50, { kind: 'oral', weight: 0.5 }, 13);
    expect(r.status).toBe('safe');
    expect(r.points).toBe(0);
  });
});

describe('trendOf', () => {
  const dated = (points: number, day: number) => entry(points, 'oral', { date: `2026-03-${String(day).padStart(2, '0')}` });

  it('braucht mehr Noten als das Fenster', () => {
    expect(trendOf([dated(5, 1), dated(6, 2), dated(7, 3)])).toBeNull();
  });

  it('erkennt steigend, fallend und gleich', () => {
    expect(trendOf([dated(5, 1), dated(5, 2), dated(9, 3), dated(9, 4), dated(9, 5)])).toBe('up');
    expect(trendOf([dated(12, 1), dated(12, 2), dated(8, 3), dated(8, 4), dated(8, 5)])).toBe('down');
    expect(trendOf([dated(9, 1), dated(9, 2), dated(9, 3), dated(9, 4), dated(9, 5)])).toBe('flat');
  });
});

describe('quarterOverview', () => {
  it('zählt Leistungskurse doppelt, findet Defizite und überspringt abgewählte Fächer ohne Noten', () => {
    const subjects = [subject('m', { isAdvanced: true }), subject('d'), subject('x', { status: 'dropped' })];
    const entries = [entry(12, 'exam', { subjectId: 'm' }), entry(3, 'exam', { subjectId: 'd' })];
    const o = quarterOverview(subjects, entries, emptyGradeSettings(), 'Q1');
    expect(o.rows.map((r) => r.subject.id)).toEqual(['m', 'd']);
    expect(o.average).toBeCloseTo((12 * 2 + 3) / 3, 5);
    expect(o.deficits).toBe(1);
    expect(o.graded).toBe(2);
  });

  it('beachtet das Verhältnis je Fach', () => {
    const entries = [entry(14, 'exam', { subjectId: 'm' }), entry(6, 'oral', { subjectId: 'm' })];
    const settings = readGradeSettings({ writtenShare: { m: 75 } });
    const o = quarterOverview([subject('m')], entries, settings, 'Q1');
    expect(o.rows[0]!.grade.exact).toBe(12);
  });
});

describe('currentPoints', () => {
  it('nimmt das gewählte Halbjahr, sonst das letzte mit Noten', () => {
    const entries = [entry(10, 'exam', { quarter: 'Q1' }), entry(12, 'exam', { quarter: 'Q2' })];
    expect(currentPoints(entries, 'm', emptyGradeSettings(), 'Q1')).toEqual({ points: 10, quarter: 'Q1' });
    expect(currentPoints(entries, 'm', emptyGradeSettings(), 'Q4')).toEqual({ points: 12, quarter: 'Q2' });
    expect(currentPoints([], 'm', emptyGradeSettings(), 'Q1')).toBeNull();
  });
});

describe('courseGradesForAbitur', () => {
  it('übernimmt Kursnoten und lässt andere Halbjahre unberührt', () => {
    const plan = emptyPlan();
    plan.courses.m = [null, 7, null, null];
    const entries = [entry(11, 'exam', { quarter: 'Q1' }), entry(13, 'oral', { quarter: 'Q3' })];
    const r = courseGradesForAbitur([subject('m'), subject('d')], entries, emptyGradeSettings(), plan);
    expect(r.courses.m).toEqual([11, 7, 13, null]);
    expect(r.courses.d).toBeUndefined();
    expect(r.changed).toBe(2);
  });

  it('zählt nur echte Änderungen', () => {
    const plan = emptyPlan();
    plan.courses.m = [11, null, null, null];
    const r = courseGradesForAbitur([subject('m')], [entry(11, 'exam', { quarter: 'Q1' })], emptyGradeSettings(), plan);
    expect(r.changed).toBe(0);
  });
});

describe('examsWithoutGrade', () => {
  const exam = (id: string, date: string): Exam => ({ id, subjectId: 'm', title: id, date, priorityManual: null, totalHoursManual: null, startDaysManual: null });

  it('bietet vergangene Klausuren ohne Note an', () => {
    const exams = [exam('a', '2026-10-01'), exam('b', '2026-10-15'), exam('c', '2026-11-30'), exam('old', '2025-01-01')];
    const entries = [entry(9, 'exam', { examId: 'a' })];
    expect(examsWithoutGrade(exams, entries, '2026-10-21').map((e) => e.id)).toEqual(['b']);
  });
});

describe('Hilfsfunktionen', () => {
  it('rechnet Punkte in die Durchschnittsnote um', () => {
    expect(pointsToDecimalGrade(15)).toBeCloseTo(0.67, 2);
    expect(pointsToDecimalGrade(11)).toBe(2);
    expect(pointsToDecimalGrade(5)).toBe(4);
  });

  it('begrenzt Gewicht und Verhältnis', () => {
    expect(clampWeight(0)).toBe(0.5);
    expect(clampWeight(99)).toBe(5);
    expect(clampWeight(1.3)).toBe(1.5);
    expect(clampShare(-4)).toBe(0);
    expect(clampShare(53)).toBe(55);
    expect(clampShare(NaN)).toBe(50);
  });

  it('liest kaputte Einstellungen sicher', () => {
    expect(readGradeSettings(null)).toEqual({ writtenShare: {} });
    expect(readGradeSettings({ writtenShare: { a: 70, b: 'x', c: 999 } })).toEqual({ writtenShare: { a: 70, c: 100 } });
  });
});

describe('reviewCandidates', () => {
  const review = (extra: Partial<ExamReview> = {}): ExamReview => ({
    id: 'r1',
    subjectId: 'm',
    examId: null,
    title: 'Klausur Analysis',
    examDate: '2026-10-05',
    teacher: '',
    quarter: null,
    maxPoints: null,
    horizonText: '',
    main: null,
    compare: null,
    teacherPoints: 11,
    teacherTasks: null,
    learnedAt: null,
    practiceId: null,
    createdAt: '',
    ...extra,
  });
  const ids = new Set(['m']);

  it('macht aus einer Note der Lehrkraft eine Klausurnote mit gleich bleibender Id', () => {
    const [c] = reviewCandidates([review({ quarter: 'Q2' })], [], [], ids, 'Q1');
    expect(c!.grade).toMatchObject({ id: reviewGradeId('r1'), kind: 'exam', points: 11, quarter: 'Q2', date: '2026-10-05', examId: null });
  });

  it('nimmt das gewählte Halbjahr, wenn die Korrektur keins hat', () => {
    expect(reviewCandidates([review()], [], [], ids, 'Q3')[0]!.grade.quarter).toBe('Q3');
  });

  it('überspringt Übungsklausuren, fehlende Noten und unbekannte Fächer', () => {
    const list = [review({ practiceId: 'p' }), review({ id: 'r2', teacherPoints: null }), review({ id: 'r3', subjectId: 'x' }), review({ id: 'r4', subjectId: null })];
    expect(reviewCandidates(list, [], [], ids, 'Q1')).toEqual([]);
  });

  it('überspringt, was schon eingetragen ist (Id, verknüpfte Klausur, gleiche Klausur mit gleichen Punkten)', () => {
    const exam = { id: 'e1', subjectId: 'm', title: '', date: '2026-10-05', priorityManual: null, totalHoursManual: null, startDaysManual: null };
    expect(reviewCandidates([review()], [entry(5, 'exam', { id: reviewGradeId('r1') })], [], ids, 'Q1')).toEqual([]);
    expect(reviewCandidates([review({ examId: 'e1' })], [entry(5, 'exam', { examId: 'e1' })], [exam], ids, 'Q1')).toEqual([]);
    expect(reviewCandidates([review()], [entry(11, 'exam', { date: '2026-10-05' })], [], ids, 'Q1')).toEqual([]);
    // gleiche Punkte, aber anderes Datum: ist eine andere Klausur
    expect(reviewCandidates([review()], [entry(11, 'exam', { date: '2026-09-01' })], [], ids, 'Q1')).toHaveLength(1);
  });

  it('verknüpft nur Klausuren, die es im Plan noch gibt', () => {
    const exam = { id: 'e1', subjectId: 'm', title: '', date: '2026-10-05', priorityManual: null, totalHoursManual: null, startDaysManual: null };
    expect(reviewCandidates([review({ examId: 'e1' })], [], [exam], ids, 'Q1')[0]!.grade.examId).toBe('e1');
    expect(reviewCandidates([review({ examId: 'weg' })], [], [exam], ids, 'Q1')[0]!.grade.examId).toBeNull();
  });
});
