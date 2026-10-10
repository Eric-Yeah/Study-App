import { describe, expect, it } from 'vitest';
import { abiturGrade, categoryFor, computeAbitur, emptyPlan, examSlots, pointsForGrade, readAbiturPlan, suggestPicks, type AbiturPlan } from './abitur';
import type { Subject } from './types';

const sub = (id: string, name: string, o: Partial<Subject> = {}): Subject => ({
  id,
  name,
  color: '#000',
  isAdvanced: false,
  isExamSubject: false,
  status: 'active',
  type: 'knowledge',
  points: null,
  difficulty: 3,
  language: 'de',
  ...o,
});

// Deutsch (LK), Mathe (LK), Englisch (Prüfung 3), Geschichte (Prüfung 4), Bio (Prüfung 5), dazu freie Fächer
const subjects: Subject[] = [
  sub('d', 'Deutsch', { isAdvanced: true, points: 10 }),
  sub('m', 'Mathematik', { isAdvanced: true, points: 10 }),
  sub('e', 'Englisch', { isExamSubject: true, points: 10 }),
  sub('g', 'Geschichte', { isExamSubject: true, points: 10 }),
  sub('b', 'Biologie', { isExamSubject: true, points: 10 }),
  sub('p', 'Politik und Wirtschaft', { points: 10 }),
  sub('k', 'Kunst', { points: 10 }),
  sub('c', 'Chemie', { points: 10 }),
  sub('r', 'Ethik', { points: 10 }),
  sub('s', 'Sport', { points: 14 }),
  sub('f', 'Französisch', { points: 10 }),
  sub('i', 'Informatik', { points: 9 }),
];

describe('Abiturnote', () => {
  it('folgt der KMK-Tabelle', () => {
    expect(abiturGrade(900)).toBe(1);
    expect(abiturGrade(823)).toBe(1);
    expect(abiturGrade(822)).toBe(1.1);
    expect(abiturGrade(805)).toBe(1.1);
    expect(abiturGrade(804)).toBe(1.2);
    expect(abiturGrade(600)).toBe(2.3);
    expect(abiturGrade(301)).toBe(3.9);
    expect(abiturGrade(300)).toBe(4);
    expect(abiturGrade(299)).toBeNull();
  });
  it('rechnet die Punkte für eine Note zurück', () => {
    expect(pointsForGrade(1)).toBe(823);
    expect(pointsForGrade(1.1)).toBe(805);
    expect(pointsForGrade(4)).toBe(300);
    for (const g of [1.4, 2.0, 2.7, 3.3]) expect(abiturGrade(pointsForGrade(g))).toBe(g);
  });
});

describe('Fachgruppen', () => {
  it('erkennt Fächer', () => {
    expect(categoryFor('Biologie')).toBe('naturwiss');
    expect(categoryFor('Politik und Wirtschaft')).toBe('powi');
    expect(categoryFor('Französisch')).toBe('fremdsprache');
    expect(categoryFor('Informatik')).toBe('informatik');
    expect(categoryFor('Erdkunde')).toBe('geographie');
    expect(categoryFor('Kunst')).toBe('kunst_musik');
    expect(categoryFor('Xyz')).toBe('sonst');
  });
});

describe('Prüfungsfächer', () => {
  it('belegt sie aus Leistungskursen und markierten Fächern vor', () => {
    expect(examSlots(subjects, emptyPlan())).toEqual(['d', 'm', 'e', 'g', 'b']);
  });
  it('lässt eigene Wahl gelten und füllt den Rest', () => {
    const plan: AbiturPlan = { ...emptyPlan(), examSubjects: [null, null, null, null, 'c'] };
    expect(examSlots(subjects, plan)).toEqual(['d', 'm', 'e', 'g', 'c']);
  });
});

describe('computeAbitur', () => {
  it('bringt Leistungskurse zweifach und Prüfungs-Grundkurse immer ein', () => {
    const r = computeAbitur(subjects, emptyPlan());
    expect(r.lkCount).toBe(8);
    expect(r.gkCount).toBe(12); // Englisch, Geschichte, Biologie je vier
    expect(r.lkSum).toBe(8 * 10 * 2);
    expect(r.gkSum).toBe(12 * 10);
    expect(r.blockII).toBe(5 * 10 * 4);
    expect(r.total).toBe(160 + 120 + 200);
    expect(r.grade).toBe(3); // 480 Punkte, aber erst 12 von 24 Grundkursen gewählt
  });

  it('nimmt eingetragene Punkte vor der Prognose', () => {
    const plan: AbiturPlan = { ...emptyPlan(), courses: { d: [15, 15, 15, 15], m: [5, 5, 5, 5] }, examPoints: [12, null, null, null, null] };
    const r = computeAbitur(subjects, plan);
    expect(r.lkSum).toBe((60 + 20) * 2);
    expect(r.exams[0]).toMatchObject({ points: 12, predicted: false });
    expect(r.exams[1]).toMatchObject({ points: 5, predicted: true }); // Schnitt der Kurse
  });

  it('prognostiziert aus dem Schnitt der eingetragenen Kurse eines Fachs', () => {
    const plan: AbiturPlan = { ...emptyPlan(), courses: { e: [12, 13, null, null] } };
    const c = computeAbitur(subjects, plan).courses.filter((x) => x.subjectId === 'e');
    expect(c.map((x) => x.points)).toEqual([12, 13, 13, 13]);
    expect(c.map((x) => x.predicted)).toEqual([false, false, true, true]);
  });

  it('wertet abgewählte Fächer nur in Q1 und Q2', () => {
    const subs = subjects.map((s) => (s.id === 'k' ? { ...s, status: 'dropped' as const } : s));
    const c = computeAbitur(subs, emptyPlan()).courses.filter((x) => x.subjectId === 'k');
    expect(c.map((x) => x.available)).toEqual([true, true, false, false]);
  });

  it('zählt Defizite und warnt bei zu vielen', () => {
    const two: AbiturPlan = { ...emptyPlan(), courses: { d: [3, 3, 10, 10], m: [10, 10, 10, 10] } };
    expect(computeAbitur(subjects, two).checks.find((c) => c.id === 'deficit-lk')?.status).toBe('ok');
    const three: AbiturPlan = { ...emptyPlan(), courses: { d: [3, 3, 3, 10], m: [10, 10, 10, 10] } };
    expect(computeAbitur(subjects, three).checks.find((c) => c.id === 'deficit-lk')?.status).toBe('fail');
  });
});

describe('Einbringung', () => {
  it('schlägt 24 Grundkurse vor und erfüllt die Pflicht', () => {
    const picks = suggestPicks(subjects, emptyPlan());
    const r = computeAbitur(subjects, { ...emptyPlan(), picks });
    expect(r.gkCount).toBe(24);
    const failed = r.checks.filter((c) => c.status === 'fail');
    expect(failed).toEqual([]);
  });

  it('bevorzugt die besten Kurse', () => {
    // Politik: Q1 bis Q4 mit unterschiedlichen Punkten, nur zwei sind Pflicht
    const plan: AbiturPlan = { ...emptyPlan(), courses: { p: [4, 15, 6, 14] } };
    const picks = suggestPicks(subjects, plan);
    expect(picks.p).toEqual([false, true, false, true]);
  });

  it('meldet fehlende Pflicht', () => {
    const r = computeAbitur(subjects, emptyPlan());
    expect(r.checks.find((c) => c.id === 'need-powi')?.status).toBe('fail');
    expect(r.checks.find((c) => c.id === 'gk-count')?.status).toBe('warn');
  });

  it('prüft die Prüfungsfächer', () => {
    const r = computeAbitur(subjects, { ...emptyPlan(), examSubjects: [null, 'c', null, null, null] });
    // Mathematik ist kein Prüfungsfach mehr
    expect(r.checks.find((c) => c.id === 'exam-dm')?.status).toBe('fail');
  });

  it('begrenzt Sport', () => {
    const picks = { s: [true, true, true, true] };
    const r = computeAbitur(subjects, { ...emptyPlan(), picks });
    expect(r.checks.find((c) => c.id === 'need-sport')?.status).toBe('fail');
  });
});

describe('gespeicherten Plan lesen', () => {
  it('liest sicher', () => {
    expect(readAbiturPlan(null)).toEqual(emptyPlan());
    const p = readAbiturPlan({ courses: { d: [20, 7, 'x'] }, picks: { e: [true] }, examSubjects: ['d', 5], examPoints: [12, 99, null], assumption: 9 });
    expect(p.courses.d).toEqual([null, 7, null, null]);
    expect(p.picks.e).toEqual([true, false, false, false]);
    expect(p.examSubjects.slice(0, 2)).toEqual(['d', null]);
    expect(p.examPoints.slice(0, 3)).toEqual([12, null, null]);
    expect(p.assumption).toBe(9);
  });
});
