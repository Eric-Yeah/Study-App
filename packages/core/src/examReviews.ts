/**
 * Korrigierte Klausuren in der App: Note mit Abgleich zur Lehrkraft, Vergleich der Modelle, Punkte je Aufgabe neben
 * denen der Lehrkraft. Baut auf examGrading.ts auf (dort Muster, Prompt und Rechenregeln). Nur Web-App, nicht für Deno.
 */
import { CONFIG } from './config';
import type { Quarter } from './documents';
import { isLevel, parsePractice, type Level, type PracticeContent, type PracticeMeta } from './practiceExam';
import {
  calibratedPoints,
  calibration,
  defaultRubric,
  gradeExam,
  modelAccuracy,
  parseExamResult,
  type Calibration,
  type ExamGrade,
  type ExamResult,
  type GradedSample,
  type Lesson,
  type ModelAccuracy,
  type Rubric,
} from './examGrading';

/** Ergebnis eines Modells, wie es in exam_reviews.result steht. */
export interface StoredGrading {
  model: string;
  effort: string;
  at: string;
  result: ExamResult;
}

export interface ExamReview {
  id: string;
  subjectId: string | null;
  examId: string | null;
  title: string;
  examDate: string; // YYYY-MM-DD
  teacher: string;
  quarter: Quarter | null;
  maxPoints: number | null;
  horizonText: string; // Erwartungshorizont als Text
  main: StoredGrading | null; // Korrektur mit CONFIG.ai.models.exam
  compare: StoredGrading | null; // freiwilliger Vergleich mit CONFIG.exam.compareModel
  teacherPoints: number | null; // Note der Lehrkraft 0 bis 15
  teacherTasks: { nr: string; punkte: number }[] | null;
  learnedAt: string | null;
  practiceId: string | null; // gehört zu einer Übungsklausur (zählt nicht als echtes Vorbild)
  createdAt: string;
}

/** Eine von der KI erstellte Übungsklausur. */
export interface PracticeRecord {
  id: string;
  subjectId: string | null;
  title: string;
  level: Level;
  teacher: string;
  noteIds: string[]; // Notizen, aus denen das Unterrichtsmaterial stammt
  topic: string;
  durationMin: number;
  content: PracticeContent;
  meta: PracticeMeta | null;
  rating: number | null; // -1 zu leicht, 0 passend, 1 zu schwer
  createdAt: string;
}

/** Korrekturmuster eines Fachs, soweit es vom Standard abweicht: Vorgaben der Lehrkraft und Erfahrungen. */
export interface SubjectRubric {
  subjectId: string;
  teacherText: string;
  lessons: Lesson[];
  updatedAt: string;
}

interface SubjectLike {
  id: string;
  name: string;
  type: string;
}

const isText = (v: unknown): v is string => typeof v === 'string';

/** Liest ein gespeichertes Ergebnis sicher (aus der Datenbank), sonst null. */
export function readStoredGrading(v: unknown): StoredGrading | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const result = parseExamResult(JSON.stringify(o.result ?? null));
  if (!result || !isText(o.model)) return null;
  return { model: o.model, effort: isText(o.effort) ? o.effort : '', at: isText(o.at) ? o.at : '', result };
}

/** Liest gespeicherte Erfahrungen sicher. */
export function readLessons(v: unknown): Lesson[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (typeof x !== 'object' || x === null) return [];
    const o = x as Record<string, unknown>;
    if (!isText(o.text) || !o.text.trim() || !isText(o.id)) return [];
    return [{ id: o.id, text: o.text, source: o.source === 'eigene' ? 'eigene' : 'ki', teacher: isText(o.teacher) ? o.teacher : '', createdAt: isText(o.createdAt) ? o.createdAt : '' } as Lesson];
  });
}

/** Punkte je Aufgabe laut Lehrkraft sicher lesen. */
export function readTeacherTasks(v: unknown): { nr: string; punkte: number }[] | null {
  if (!Array.isArray(v)) return null;
  return v.flatMap((x) => {
    const o = x as Record<string, unknown> | null;
    return o && isText(o.nr) && typeof o.punkte === 'number' && Number.isFinite(o.punkte) ? [{ nr: o.nr, punkte: o.punkte }] : [];
  });
}

/** Korrekturmuster zum Fach (ohne Fach: allgemein). */
export const rubricFor = (subject: Pick<SubjectLike, 'name' | 'type'> | undefined): Rubric => defaultRubric(subject?.name ?? '', subject?.type ?? 'knowledge');

/** Note eines gespeicherten Ergebnisses nach den hessischen Regeln. */
export const gradeOf = (g: StoredGrading, subject: Pick<SubjectLike, 'name' | 'type'> | undefined): ExamGrade =>
  gradeExam(g.result, rubricFor(subject).scheme, CONFIG.exam);

/** Klausuren mit Note der Lehrkraft als Vergleichswerte, je Modell (Korrektur und Vergleich). */
export function gradedSamples(reviews: readonly ExamReview[], subjects: readonly SubjectLike[]): GradedSample[] {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const out: GradedSample[] = [];
  for (const r of reviews) {
    if (r.teacherPoints === null) continue;
    const subject = r.subjectId ? byId.get(r.subjectId) : undefined;
    for (const g of [r.main, r.compare]) {
      if (!g) continue;
      out.push({ subjectId: r.subjectId, teacher: r.teacher, model: g.model, aiPoints: gradeOf(g, subject).points, teacherPoints: r.teacherPoints });
    }
  }
  return out;
}

export interface ReviewView {
  grade: ExamGrade | null;
  calibration: Calibration;
  shown: number | null; // angezeigte Note: mit Abgleich, wenn es frühere Vergleichswerte gibt
  compareGrade: ExamGrade | null;
}

/**
 * Was die Seite einer Korrektur zeigt. Der Abgleich nutzt nur andere Klausuren des Fachs mit demselben Modell, damit
 * die eingetragene Note der Lehrkraft die eigene Einschätzung nicht nachträglich verschiebt.
 */
export function reviewView(review: ExamReview, reviews: readonly ExamReview[], subjects: readonly SubjectLike[]): ReviewView {
  const subject = subjects.find((s) => s.id === review.subjectId);
  const grade = review.main ? gradeOf(review.main, subject) : null;
  const compareGrade = review.compare ? gradeOf(review.compare, subject) : null;
  const model = review.main?.model ?? '';
  const others = gradedSamples(
    reviews.filter((r) => r.id !== review.id),
    subjects,
  ).filter((s) => s.model === model);
  const c = calibration(others, { subjectId: review.subjectId, teacher: review.teacher }, CONFIG.exam.calibration);
  return { grade, calibration: c, shown: grade ? calibratedPoints(grade.points, c) : null, compareGrade };
}

/** Abgleich für die nächste Korrektur eines Fachs (für das Korrekturmuster). */
export function subjectCalibration(subjectId: string, teacher: string, reviews: readonly ExamReview[], subjects: readonly SubjectLike[]): Calibration {
  const model = CONFIG.ai.models.exam.model;
  const samples = gradedSamples(reviews, subjects).filter((s) => s.model === model);
  return calibration(samples, { subjectId, teacher }, CONFIG.exam.calibration);
}

/** Genauigkeit der Modelle gegenüber der Lehrkraft (Admin-Protokoll). */
export const examModelAccuracy = (reviews: readonly ExamReview[], subjects: readonly SubjectLike[]): ModelAccuracy[] =>
  modelAccuracy(gradedSamples(reviews, subjects));

/** Punkte je Aufgabe von KI und Lehrkraft nebeneinander (Zuordnung über die Nummer der Aufgabe). */
export function taskComparison(review: ExamReview): { nr: string; titel: string; max: number; ai: number; teacher: number | null }[] {
  if (!review.main) return [];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const teacher = new Map((review.teacherTasks ?? []).map((t) => [norm(t.nr), t.punkte]));
  return review.main.result.aufgaben.map((a) => ({ nr: a.nr, titel: a.titel, max: a.max, ai: a.punkte, teacher: teacher.get(norm(a.nr)) ?? null }));
}

/** Lehrkraft, die zu einem Fach zuletzt eingetragen war (für den Vorschlag bei einer neuen Korrektur). */
export function lastTeacher(reviews: readonly ExamReview[], subjectId: string): string {
  return [...reviews].filter((r) => r.subjectId === subjectId && r.teacher).sort((a, b) => b.examDate.localeCompare(a.examDate))[0]?.teacher ?? '';
}

/** Liest den gespeicherten Inhalt einer Übungsklausur sicher, sonst null. */
export function readPracticeContent(v: unknown): PracticeContent | null {
  if (typeof v !== 'object' || v === null) return null;
  return parsePractice(JSON.stringify(v), CONFIG.practice.limits);
}

/** Liest die gespeicherte Herkunft einer Übungsklausur sicher, sonst null. */
export function readPracticeMeta(v: unknown): PracticeMeta | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const afb = Array.isArray(o.afb) && o.afb.length === 3 && o.afb.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (o.afb as [number, number, number]) : null;
  if (!isLevel(o.difficulty) || !afb || typeof o.totalBe !== 'number') return null;
  return { difficulty: o.difficulty, profileN: typeof o.profileN === 'number' ? o.profileN : 0, shift: typeof o.shift === 'number' ? o.shift : 0, afb, totalBe: o.totalBe, styleN: typeof o.styleN === 'number' && o.styleN > 0 ? Math.round(o.styleN) : 0 };
}

/** Korrekturen, die zu einer Übungsklausur gehören, die neueste zuerst. */
export const reviewsOfPractice = (reviews: readonly ExamReview[], practiceId: string): ExamReview[] =>
  reviews.filter((r) => r.practiceId === practiceId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
