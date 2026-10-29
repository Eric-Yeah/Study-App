import { describe, expect, it } from 'vitest';
import {
  attemptsLeft,
  averageByTerm,
  countedResults,
  emptyStudyProfile,
  formatGrade,
  gradeLabel,
  isGradeStep,
  isPassed,
  neededGrade,
  parseGradeInput,
  readStudyProfile,
  roundAverage,
  semesterNumber,
  snapGrade,
  studyProgress,
  termLabel,
  weightedAverage,
  type ModuleResult,
} from './uniGrades';

let n = 0;
const res = (grade: number | null, ects: number, extra: Partial<ModuleResult> = {}): ModuleResult => ({
  id: `r${(n += 1)}`,
  subjectId: `m${n}`,
  examId: null,
  grade,
  passed: null,
  attempt: 1,
  ects,
  weight: ects,
  date: '2025-02-10',
  title: 'Klausur',
  ...extra,
});

describe('Noten 1,0 bis 5,0', () => {
  it('Schritte, Anpassen, Anzeige und Eingabe', () => {
    expect(isGradeStep(1.3)).toBe(true);
    expect(isGradeStep(1.5)).toBe(false);
    expect(isGradeStep(4.3)).toBe(false);
    expect(snapGrade(2.4)).toBe(2.3);
    expect(snapGrade(4.4)).toBe(4.0);
    expect(snapGrade(4.6)).toBe(5.0);
    expect(formatGrade(1.3)).toBe('1,3');
    expect(parseGradeInput('2,3')).toBe(2.3);
    expect(parseGradeInput('2.3')).toBe(2.3);
    expect(parseGradeInput('6')).toBeNull();
    expect(parseGradeInput('abc')).toBeNull();
  });

  it('Notenbezeichnung', () => {
    expect(gradeLabel(1.0)).toBe('sehr gut');
    expect(gradeLabel(1.7)).toBe('gut');
    expect(gradeLabel(3.3)).toBe('befriedigend');
    expect(gradeLabel(4.0)).toBe('ausreichend');
    expect(gradeLabel(5.0)).toBe('nicht ausreichend');
  });

  it('bestanden ab 4,0, unbenotet nach Haken', () => {
    expect(isPassed({ grade: 4.0, passed: null })).toBe(true);
    expect(isPassed({ grade: 5.0, passed: null })).toBe(false);
    expect(isPassed({ grade: null, passed: true })).toBe(true);
    expect(isPassed({ grade: null, passed: null })).toBe(false);
  });
});

describe('Durchschnitt nach ECTS', () => {
  it('gewichtet nach ECTS, zählt nur bestandene benotete Ergebnisse', () => {
    const avg = weightedAverage([res(1.0, 9), res(3.0, 3), res(5.0, 6), res(null, 6, { passed: true })]);
    expect(avg.value).toBeCloseTo((1.0 * 9 + 3.0 * 3) / 12);
    expect(avg.count).toBe(2);
    expect(avg.weight).toBe(12);
  });

  it('ohne Ergebnis kein Schnitt', () => {
    expect(weightedAverage([]).value).toBeNull();
  });

  it('Rundung: streichen oder runden', () => {
    expect(roundAverage(1.79, 1, 'truncate')).toBe(1.7);
    expect(roundAverage(1.79, 1, 'round')).toBe(1.8);
    expect(roundAverage(2.0, 1, 'truncate')).toBe(2);
  });

  it('bei einem Wiederholungsversuch zählt der bestandene, nicht der durchgefallene', () => {
    const first = res(5.0, 6, { subjectId: 'x', attempt: 1, date: '2025-02-10' });
    const second = res(3.3, 6, { subjectId: 'x', attempt: 2, date: '2025-08-10' });
    const counted = countedResults([first, second]);
    expect(counted).toHaveLength(1);
    expect(counted[0].grade).toBe(3.3);
    expect(weightedAverage([first, second]).value).toBeCloseTo(3.3);
  });

  it('nur durchgefallen: das letzte Ergebnis zählt als offen', () => {
    const first = res(5.0, 6, { subjectId: 'x', attempt: 1 });
    expect(countedResults([first])).toHaveLength(1);
    expect(weightedAverage([first]).value).toBeNull();
  });

  it('Klausur und Hausarbeit im selben Modul sind getrennte Ergebnisse', () => {
    const a = res(2.0, 3, { subjectId: 'x', title: 'Klausur' });
    const b = res(1.0, 3, { subjectId: 'x', title: 'Hausarbeit' });
    expect(countedResults([a, b])).toHaveLength(2);
  });
});

describe('Studienfortschritt', () => {
  const profile = { ...emptyStudyProfile(new Date(2024, 9, 1)), startTerm: 'WS' as const, startYear: 2024, totalEcts: 180, regularSemesters: 6 };

  it('Fachsemester aus Start und Datum', () => {
    expect(semesterNumber(profile, new Date(2024, 9, 15))).toBe(1);
    expect(semesterNumber(profile, new Date(2025, 0, 20))).toBe(1); // Januar gehört noch zum Wintersemester
    expect(semesterNumber(profile, new Date(2025, 3, 20))).toBe(2);
    expect(semesterNumber(profile, new Date(2025, 10, 1))).toBe(3);
    expect(semesterNumber(profile, new Date(2020, 0, 1))).toBe(1);
  });

  it('Sommersemester als Start', () => {
    const ss = { startTerm: 'SS' as const, startYear: 2025 };
    expect(semesterNumber(ss, new Date(2025, 5, 1))).toBe(1);
    expect(semesterNumber(ss, new Date(2025, 10, 1))).toBe(2);
    expect(semesterNumber(ss, new Date(2026, 1, 1))).toBe(2);
  });

  it('ECTS, Soll und Tempo', () => {
    const results = [res(2.0, 30), res(2.0, 30), res(2.0, 30)];
    const p = studyProgress(results, profile, new Date(2025, 10, 1)); // 3. Semester, Soll 60
    expect(p.earned).toBe(90);
    expect(p.expected).toBe(60);
    expect(p.pace).toBe('ahead');
    expect(p.share).toBeCloseTo(0.5);
    expect(p.remainingSemesters).toBe(4);
    expect(p.forecastSemesters).toBe(2);
  });

  it('keine Prognose, wenn sie weit über die Regelstudienzeit hinausgeht', () => {
    const p = studyProgress([res(2.0, 3)], profile, new Date(2025, 10, 1)); // 3 ECTS in 2 Semestern
    expect(p.forecastSemesters).toBeNull();
  });

  it('im Rückstand und durchgefallene Prüfungen', () => {
    const p = studyProgress([res(2.0, 12), res(5.0, 6)], profile, new Date(2025, 10, 1));
    expect(p.pace).toBe('behind');
    expect(p.failed).toBe(1);
  });
});

describe('Was brauche ich?', () => {
  it('rechnet die nötige Note aus', () => {
    const results = [res(2.0, 12)];
    const need = neededGrade(results, 2.0, 6);
    expect(need).toEqual({ kind: 'grade', grade: 2.0 });
    expect(neededGrade(results, 2.5, 6)).toEqual({ kind: 'grade', grade: 3.3 });
  });

  it('sicher und unmöglich', () => {
    expect(neededGrade([res(1.0, 24)], 3.0, 6)).toEqual({ kind: 'sure' });
    expect(neededGrade([res(3.0, 6)], 1.0, 6)).toEqual({ kind: 'impossible' });
    expect(neededGrade([res(3.0, 6)], 2.0, 0)).toEqual({ kind: 'unknown' });
  });

  it('ohne bisherige Noten entscheidet allein die neue Leistung', () => {
    expect(neededGrade([], 2.0, 6)).toEqual({ kind: 'grade', grade: 2.0 });
  });
});

describe('Versuche und Semester', () => {
  it('Versuche, Freiversuch zählt nicht', () => {
    expect(attemptsLeft([{ attempt: 1, grade: 5.0, passed: null }]).left).toBe(2);
    expect(attemptsLeft([{ attempt: 1, grade: 5.0, passed: null }], 1).left).toBe(3);
    expect(attemptsLeft([{ attempt: 1, grade: 2.0, passed: null }]).passed).toBe(true);
  });

  it('Semesterbezeichnung', () => {
    expect(termLabel('2025-02-10')).toBe('WS 24/25');
    expect(termLabel('2025-07-10')).toBe('SS 2025');
    expect(termLabel('2025-11-10')).toBe('WS 25/26');
  });

  it('Schnitt je Semester, älteste zuerst', () => {
    const rows = averageByTerm([res(2.0, 6, { date: '2025-11-10' }), res(1.0, 6, { date: '2025-02-10' }), res(3.0, 6, { date: '2025-07-10' })]);
    expect(rows.map((r) => r.term)).toEqual(['WS 24/25', 'SS 2025', 'WS 25/26']);
    expect(rows[0].average).toBe(1);
  });
});

describe('Einstellungen lesen', () => {
  it('ersetzt Kaputtes durch Standardwerte', () => {
    const p = readStudyProfile({ degree: 'x', totalEcts: -3, lectureStart: 'morgen', program: 5 });
    expect(p.degree).toBe('bachelor');
    expect(p.totalEcts).toBe(180);
    expect(p.lectureStart).toBeNull();
    expect(p.program).toBe('');
    expect(readStudyProfile(null).degree).toBe('bachelor');
  });

  it('übernimmt gültige Werte', () => {
    const p = readStudyProfile({ degree: 'master', totalEcts: 120, regularSemesters: 4, lectureStart: '2026-10-19', startTerm: 'SS' });
    expect(p.degree).toBe('master');
    expect(p.lectureStart).toBe('2026-10-19');
    expect(p.startTerm).toBe('SS');
  });
});
