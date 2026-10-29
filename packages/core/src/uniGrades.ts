import { CONFIG } from './config';

/**
 * Noten im Studium (deutsche Skala 1,0 bis 5,0) mit ECTS-Gewichtung, Studienfortschritt und „Was brauche ich?“.
 * Die Schulnoten (Punkte 0 bis 15, grades.ts) bleiben davon unberührt. Reine Funktionen, Zahlen in CONFIG.study.
 */

export type DegreeKind = 'bachelor' | 'master' | 'staatsexamen' | 'other';
export const DEGREE_LABELS: Record<DegreeKind, string> = {
  bachelor: 'Bachelor',
  master: 'Master',
  staatsexamen: 'Staatsexamen',
  other: 'Anderer Abschluss',
};

/** Ergebnis einer Prüfung: Note (oder nur bestanden/nicht bestanden), Versuch, Leistungspunkte, Gewicht. */
export interface ModuleResult {
  id: string;
  subjectId: string;
  examId: string | null;
  /** 1,0 bis 5,0, null bei unbenotet (nur bestanden oder nicht) */
  grade: number | null;
  /** Nur bei unbenotet: bestanden? Bei Note ergibt sich das aus der Note. */
  passed: boolean | null;
  attempt: number;
  ects: number;
  /** Gewicht im Durchschnitt, Standard = ECTS */
  weight: number;
  date: string; // YYYY-MM-DD
  title: string;
}

export function isGradeStep(n: number, steps: readonly number[] = CONFIG.study.gradeSteps): boolean {
  return steps.some((s) => Math.abs(s - n) < 1e-9);
}

/** Nächste zulässige Note zu einem Wert (zum Beispiel aus einer Eingabe wie 2,4). Bei Gleichstand die bessere. */
export function snapGrade(n: number, steps: readonly number[] = CONFIG.study.gradeSteps): number {
  let best = steps[0];
  for (const s of steps) if (Math.abs(s - n) < Math.abs(best - n)) best = s;
  return best;
}

/** Note als Text mit Komma: 1,3. */
export function formatGrade(n: number, decimals: number = CONFIG.study.averageDecimals): string {
  return n.toFixed(decimals).replace('.', ',');
}

/** Liest eine Eingabe wie „2,3“ oder „2.3“; null bei Unsinn. */
export function parseGradeInput(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

export function gradeLabel(n: number, limits: readonly number[] = CONFIG.study.labelLimits): string {
  const names = ['sehr gut', 'gut', 'befriedigend', 'ausreichend'];
  const i = limits.findIndex((l) => n <= l + 1e-9);
  return i === -1 ? 'nicht ausreichend' : names[i];
}

export function isPassed(r: Pick<ModuleResult, 'grade' | 'passed'>, passGrade: number = CONFIG.study.passGrade): boolean {
  return r.grade !== null ? r.grade <= passGrade + 1e-9 : r.passed === true;
}

/**
 * Welche Ergebnisse zählen: je Modul das beste bestandene (das spätere, wenn mehrere), sonst das letzte, nicht bestandene.
 * Mehrere Prüfungen in einem Modul (zum Beispiel Klausur und Hausarbeit) gelten als getrennte Ergebnisse: Gruppiert wird nach Modul und Titel,
 * ein weiterer Versuch trägt denselben Titel mit höherem Versuch.
 */
export function countedResults(results: ModuleResult[]): ModuleResult[] {
  const groups = new Map<string, ModuleResult[]>();
  for (const r of results) {
    const key = `${r.subjectId}:${r.title.trim().toLowerCase()}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.values()].map((list) => {
    const sorted = list.slice().sort((a, b) => a.attempt - b.attempt || a.date.localeCompare(b.date));
    const passed = sorted.filter((r) => isPassed(r));
    return passed.length > 0 ? passed[passed.length - 1] : sorted[sorted.length - 1];
  });
}

export interface WeightedAverage {
  /** Genauer Wert, null ohne benotete, bestandene Ergebnisse */
  value: number | null;
  /** Nach der Rundungsregel der Ordnung */
  rounded: number | null;
  weight: number;
  count: number;
}

export function roundAverage(x: number, decimals = CONFIG.study.averageDecimals, mode: 'truncate' | 'round' = CONFIG.study.averageRounding): number {
  const f = Math.pow(10, decimals);
  return (mode === 'truncate' ? Math.floor(x * f + 1e-9) : Math.round(x * f)) / f;
}

/** Durchschnitt aus den zählenden, bestandenen und benoteten Ergebnissen, gewichtet (Standard: nach ECTS). */
export function weightedAverage(results: ModuleResult[]): WeightedAverage {
  const used = countedResults(results).filter((r) => r.grade !== null && isPassed(r) && r.weight > 0);
  const weight = used.reduce((s, r) => s + r.weight, 0);
  if (weight === 0) return { value: null, rounded: null, weight: 0, count: 0 };
  const value = used.reduce((s, r) => s + (r.grade as number) * r.weight, 0) / weight;
  return { value, rounded: roundAverage(value), weight, count: used.length };
}

export interface StudyProfile {
  degree: DegreeKind;
  program: string;
  university: string;
  startTerm: 'WS' | 'SS';
  startYear: number;
  totalEcts: number;
  regularSemesters: number;
  /** Vorlesungszeit und Prüfungsphase des laufenden Semesters, YYYY-MM-DD, leer: unbekannt */
  lectureStart: string | null;
  lectureEnd: string | null;
  examStart: string | null;
  examEnd: string | null;
}

export function emptyStudyProfile(now: Date = new Date()): StudyProfile {
  return {
    degree: 'bachelor',
    program: '',
    university: '',
    startTerm: now.getMonth() >= 3 && now.getMonth() < 9 ? 'SS' : 'WS',
    startYear: now.getFullYear(),
    totalEcts: CONFIG.study.defaultTotalEcts.bachelor,
    regularSemesters: CONFIG.study.defaultRegularSemesters.bachelor,
    lectureStart: null,
    lectureEnd: null,
    examStart: null,
    examEnd: null,
  };
}

const isIso = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Gespeicherte Einstellungen sicher lesen; Fehlendes oder Kaputtes wird durch Standardwerte ersetzt. */
export function readStudyProfile(raw: unknown, now: Date = new Date()): StudyProfile {
  const base = emptyStudyProfile(now);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const degree = (['bachelor', 'master', 'staatsexamen', 'other'] as const).find((d) => d === r.degree) ?? base.degree;
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
  return {
    degree,
    program: typeof r.program === 'string' ? r.program.slice(0, 120) : '',
    university: typeof r.university === 'string' ? r.university.slice(0, 120) : '',
    startTerm: r.startTerm === 'SS' ? 'SS' : r.startTerm === 'WS' ? 'WS' : base.startTerm,
    startYear: num(r.startYear, 1990, 2100, base.startYear),
    totalEcts: num(r.totalEcts, 1, 600, CONFIG.study.defaultTotalEcts[degree]),
    regularSemesters: num(r.regularSemesters, 1, 20, CONFIG.study.defaultRegularSemesters[degree]),
    lectureStart: isIso(r.lectureStart) ? r.lectureStart : null,
    lectureEnd: isIso(r.lectureEnd) ? r.lectureEnd : null,
    examStart: isIso(r.examStart) ? r.examStart : null,
    examEnd: isIso(r.examEnd) ? r.examEnd : null,
  };
}

/** Fachsemester zu einem Datum: Das Startsemester ist das erste. Sommersemester beginnt im April, Wintersemester im Oktober. */
export function semesterNumber(p: Pick<StudyProfile, 'startTerm' | 'startYear'>, today: Date = new Date()): number {
  const m = today.getMonth(); // 0 = Januar
  const y = today.getFullYear();
  // Das Semester, in dem man gerade ist: ab April SS, ab Oktober WS, Januar bis März noch WS des Vorjahres
  const termIsWs = m >= 9 || m < 3;
  const termYear = m < 3 ? y - 1 : y;
  const index = (year: number, ws: boolean) => year * 2 + (ws ? 1 : 0);
  return Math.max(1, index(termYear, termIsWs) - index(p.startYear, p.startTerm === 'WS') + 1);
}

export type PaceStatus = 'ahead' | 'ontrack' | 'behind';

export interface StudyProgress {
  earned: number;
  goal: number;
  share: number; // 0 bis 1
  semester: number;
  /** Nach dem Sollwert (ECTS je Semester mal abgeschlossene Semester) */
  expected: number;
  /** earned minus expected */
  diff: number;
  pace: PaceStatus;
  remainingSemesters: number;
  /** Semester, die bei gleichem Tempo bis zum Ziel noch nötig sind, null ohne Fortschritt */
  forecastSemesters: number | null;
  /** Noch nicht bestandene Prüfungen mit Versuchen, die verbraucht sind */
  failed: number;
}

export function studyProgress(results: ModuleResult[], p: StudyProfile, today: Date = new Date()): StudyProgress {
  const counted = countedResults(results);
  const earned = counted.filter((r) => isPassed(r)).reduce((s, r) => s + r.ects, 0);
  const semester = semesterNumber(p, today);
  const expected = Math.min(p.totalEcts, (semester - 1) * CONFIG.study.ectsPerSemester);
  const diff = earned - expected;
  const tolerance = CONFIG.study.ectsPerSemester / 2;
  const pace: PaceStatus = diff > tolerance ? 'ahead' : diff < -tolerance ? 'behind' : 'ontrack';
  const perSemester = semester > 1 ? earned / (semester - 1) : 0;
  const left = Math.max(0, p.totalEcts - earned);
  return {
    earned,
    goal: p.totalEcts,
    share: p.totalEcts > 0 ? Math.min(1, earned / p.totalEcts) : 0,
    semester,
    expected,
    diff,
    pace,
    remainingSemesters: Math.max(0, p.regularSemesters - semester + 1),
    // Eine Prognose, die weit über die Regelstudienzeit hinausgeht, sagt nichts Brauchbares (zum Beispiel nach einem einzigen bestandenen Modul)
    forecastSemesters: perSemester > 0 && Math.ceil(left / perSemester) <= p.regularSemesters * 2 ? Math.ceil(left / perSemester) : null,
    failed: counted.filter((r) => !isPassed(r)).length,
  };
}

export type NeededGrade =
  | { kind: 'sure' } // auch die schlechteste bestandene Note reicht
  | { kind: 'grade'; grade: number } // mindestens diese Note
  | { kind: 'impossible' }
  | { kind: 'unknown' }; // noch keine benoteten Ergebnisse oder kein Gewicht

/**
 * „Was brauche ich?“: Welche Note braucht die nächste benotete Leistung (Gewicht `weight`), damit der Durchschnitt das Ziel erreicht?
 * Verglichen wird mit dem genauen Wert, nicht mit dem gerundeten.
 */
export function neededGrade(results: ModuleResult[], target: number, weight: number, steps: readonly number[] = CONFIG.study.gradeSteps): NeededGrade {
  if (!(weight > 0)) return { kind: 'unknown' };
  const avg = weightedAverage(results);
  const passing = steps.filter((s) => s <= CONFIG.study.passGrade + 1e-9).sort((a, b) => a - b);
  const sum = avg.value === null ? 0 : avg.value * avg.weight;
  const w = avg.weight;
  const reaches = (g: number) => (sum + g * weight) / (w + weight) <= target + 1e-9;
  const worst = passing[passing.length - 1];
  if (reaches(worst)) return { kind: 'sure' };
  if (!reaches(passing[0])) return { kind: 'impossible' };
  // schlechteste Note, die noch reicht
  const ok = passing.filter(reaches);
  return { kind: 'grade', grade: ok[ok.length - 1] };
}

/** Verbrauchte Versuche eines Moduls bei einer Prüfung und wie viele noch bleiben (Freiversuche zählen nicht). */
export function attemptsLeft(
  results: Pick<ModuleResult, 'attempt' | 'grade' | 'passed'>[],
  freeAttempts: number = 0,
  max: number = CONFIG.study.maxAttempts,
): { used: number; left: number; passed: boolean } {
  const passed = results.some((r) => isPassed(r));
  const failed = results.filter((r) => !isPassed(r)).length;
  const used = Math.max(0, failed - freeAttempts);
  return { used, left: passed ? max - used : Math.max(0, max - used), passed };
}

/** Datum des Ergebnisses als Semesterbezeichnung, zum Beispiel WS 24/25. */
export function termLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  if (m >= 4 && m <= 9) return `SS ${y}`;
  const start = m >= 10 ? y : y - 1;
  return `WS ${String(start).slice(2)}/${String(start + 1).slice(2)}`;
}

/** Schnitt je Semester (Wintersemester und Sommersemester), älteste zuerst. */
export function averageByTerm(results: ModuleResult[]): { term: string; average: number | null; ects: number }[] {
  const byTerm = new Map<string, ModuleResult[]>();
  for (const r of countedResults(results)) {
    const t = termLabel(r.date);
    const list = byTerm.get(t);
    if (list) list.push(r);
    else byTerm.set(t, [r]);
  }
  const key = (t: string) => {
    const [kind, rest] = t.split(' ');
    const y = kind === 'SS' ? Number(rest) : 2000 + Number(rest.slice(0, 2));
    return y * 2 + (kind === 'WS' ? 1 : 0);
  };
  return [...byTerm.entries()]
    .map(([term, list]) => {
      const avg = weightedAverage(list);
      return { term, average: avg.value, ects: list.filter((r) => isPassed(r)).reduce((s, r) => s + r.ects, 0) };
    })
    .sort((a, b) => key(a.term) - key(b.term));
}
