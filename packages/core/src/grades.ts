/**
 * Einzelnoten und Kursnote: Klausuren, mündliche Mitarbeit, Tests, Referate und mehr, daraus die Halbjahresnote (Kursnote) je
 * Fach und Q-Phase, ein Blick darauf, was in der nächsten Leistung nötig ist, und die Übernahme in den Abiturrechner.
 * Wie Klausuren und sonstige Leistungen zählen, entscheidet die Schule bzw. die Lehrkraft. Das Verhältnis steht darum je Fach
 * zur Wahl (Startwert CONFIG.grades.writtenShare), die Kursnote ist ein Vorschlag, keine Zusage. Reine Funktionen, nur Web-App.
 */
import type { AbiturPlan } from './abitur';
import { CONFIG } from './config';
import { QUARTERS, type Quarter } from './documents';
import type { ExamReview } from './examReviews';
import type { Exam, Subject } from './types';

const G = CONFIG.grades;

export type GradeKind = keyof typeof G.kinds;
export type GradeGroup = 'written' | 'other';

export const GRADE_KINDS = Object.keys(G.kinds) as GradeKind[];

export const isGradeKind = (v: unknown): v is GradeKind => typeof v === 'string' && Object.prototype.hasOwnProperty.call(G.kinds, v);

export const kindLabel = (kind: GradeKind): string => G.kinds[kind].label;
export const groupOf = (kind: GradeKind): GradeGroup => G.kinds[kind].group;
export const defaultWeight = (kind: GradeKind): number => G.kinds[kind].weight;

export interface GradeEntry {
  id: string;
  subjectId: string;
  quarter: Quarter;
  date: string; // YYYY-MM-DD
  kind: GradeKind;
  title: string;
  points: number; // 0 bis 15
  weight: number; // innerhalb der Gruppe, Standard je Art
  examId: string | null; // Verknüpfung mit einer Klausur im Plan
}

/** Verhältnis Klausuren zu sonstigen Leistungen je Fach (Prozent Klausuren), fehlt ein Fach, gilt der Startwert. */
export interface GradeSettings {
  writtenShare: Record<string, number>;
}

export const emptyGradeSettings = (): GradeSettings => ({ writtenShare: {} });

export const clampPoints = (v: number): number => Math.min(15, Math.max(0, Math.round(v)));
export const clampWeight = (v: number): number => {
  if (!Number.isFinite(v)) return 1;
  const stepped = Math.round(v / G.weightStep) * G.weightStep;
  return Math.min(G.weightMax, Math.max(G.weightMin, stepped));
};
export const clampShare = (v: number): number => {
  if (!Number.isFinite(v)) return G.writtenShare;
  const stepped = Math.round(v / G.shareStep) * G.shareStep;
  return Math.min(100, Math.max(0, stepped));
};

/** Liest gespeicherte Einstellungen sicher (aus der Datenbank), sonst leere. */
export function readGradeSettings(v: unknown): GradeSettings {
  const out = emptyGradeSettings();
  if (typeof v !== 'object' || v === null) return out;
  const shares = (v as Record<string, unknown>).writtenShare;
  if (typeof shares === 'object' && shares !== null) {
    for (const [id, n] of Object.entries(shares as Record<string, unknown>)) {
      if (typeof n === 'number' && Number.isFinite(n)) out.writtenShare[id] = clampShare(n);
    }
  }
  return out;
}

export const shareFor = (subjectId: string, settings: GradeSettings): number => settings.writtenShare[subjectId] ?? G.writtenShare;

// ---------------------------------------------------------------------------------------------------------------
// Kursnote

export interface CourseGrade {
  written: number | null; // gewichteter Schnitt der Klausuren
  other: number | null; // gewichteter Schnitt der sonstigen Leistungen
  writtenCount: number;
  otherCount: number;
  /** Anteil der Klausuren, der tatsächlich gilt (100 oder 0, wenn eine Gruppe noch leer ist). */
  share: number;
  exact: number | null; // Punkte mit Nachkommastellen
  points: number | null; // auf ganze Punkte gerundet (ab ,5 auf)
}

function weightedMean(list: readonly GradeEntry[]): number | null {
  let sum = 0;
  let weights = 0;
  for (const e of list) {
    sum += e.points * e.weight;
    weights += e.weight;
  }
  return weights > 0 ? sum / weights : null;
}

export const roundPoints = (exact: number): number => clampPoints(exact + 1e-9);

/** Kursnote aus den Einzelnoten eines Fachs und Halbjahrs. Fehlt eine Gruppe, zählt allein die andere. */
export function courseGrade(entries: readonly GradeEntry[], writtenShare: number = G.writtenShare): CourseGrade {
  const written = entries.filter((e) => groupOf(e.kind) === 'written');
  const other = entries.filter((e) => groupOf(e.kind) !== 'written');
  const w = weightedMean(written);
  const o = weightedMean(other);
  let share = clampShare(writtenShare);
  if (w === null) share = 0;
  else if (o === null) share = 100;
  let exact: number | null = null;
  if (w !== null && o !== null) exact = (w * share + o * (100 - share)) / 100;
  else exact = w ?? o;
  return {
    written: w,
    other: o,
    writtenCount: written.length,
    otherCount: other.length,
    share,
    exact,
    points: exact === null ? null : roundPoints(exact),
  };
}

export const forSubject = (entries: readonly GradeEntry[], subjectId: string, quarter?: Quarter): GradeEntry[] =>
  entries.filter((e) => e.subjectId === subjectId && (quarter === undefined || e.quarter === quarter));

/** Einträge nach Datum, neueste zuerst. */
export const byDateDesc = (entries: readonly GradeEntry[]): GradeEntry[] =>
  [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

// ---------------------------------------------------------------------------------------------------------------
// Was brauche ich? und Trend

export interface Needed {
  status: 'safe' | 'needed' | 'impossible';
  points: number | null; // nötige Punkte in der nächsten Leistung (bei 'safe' reicht auch 0)
}

/**
 * Wie viele Punkte die nächste Leistung (Art und Gewicht) mindestens haben muss, damit die Kursnote auf `target` Punkte
 * (ganz gerundet) kommt. 'safe': auch 0 Punkte würden reichen, 'impossible': selbst 15 Punkte reichen nicht.
 */
export function neededPoints(
  entries: readonly GradeEntry[],
  writtenShare: number,
  next: { kind: GradeKind; weight: number },
  target: number,
): Needed {
  const goal = clampPoints(target);
  const weight = clampWeight(next.weight);
  for (let p = 0; p <= 15; p += 1) {
    const hypothetical: GradeEntry = { id: '_next', subjectId: '', quarter: 'Q1', date: '9999-12-31', kind: next.kind, title: '', points: p, weight, examId: null };
    const result = courseGrade([...entries, hypothetical], writtenShare).points;
    if (result !== null && result >= goal) return { status: p === 0 ? 'safe' : 'needed', points: p };
  }
  return { status: 'impossible', points: null };
}

export type Trend = 'up' | 'down' | 'flat';

/** Die letzten Noten gegen die davor (Mittel der Punkte). Zu wenige Noten: kein Trend. */
export function trendOf(entries: readonly GradeEntry[]): Trend | null {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const n = G.trendWindow;
  if (sorted.length <= n) return null;
  const recent = sorted.slice(-n);
  const before = sorted.slice(0, -n);
  const mean = (l: readonly GradeEntry[]) => l.reduce((s, e) => s + e.points, 0) / l.length;
  const diff = mean(recent) - mean(before);
  if (diff >= G.trendMin) return 'up';
  if (diff <= -G.trendMin) return 'down';
  return 'flat';
}

// ---------------------------------------------------------------------------------------------------------------
// Überblick über alle Fächer

/** Notenpunkte als Durchschnittsnote (KMK: Note = (17 - Punkte) / 3), zum Beispiel 11,5 Punkte sind 1,8. */
export const pointsToDecimalGrade = (points: number): number => (17 - points) / 3;

export interface SubjectRow {
  subject: Subject;
  grade: CourseGrade;
  trend: Trend | null;
  deficit: boolean; // Kursnote unter CONFIG.abitur.deficitBelow Punkten
}

export interface QuarterOverview {
  rows: SubjectRow[];
  /** Schnitt der Kursnoten in Punkten, Leistungskurse doppelt, ohne Fächer ohne Note; null: noch keine Note. */
  average: number | null;
  graded: number;
  deficits: number;
}

export function quarterOverview(subjects: readonly Subject[], entries: readonly GradeEntry[], settings: GradeSettings, quarter: Quarter): QuarterOverview {
  const rows: SubjectRow[] = [];
  let sum = 0;
  let weights = 0;
  let deficits = 0;
  for (const subject of subjects) {
    const own = forSubject(entries, subject.id, quarter);
    if (subject.status === 'dropped' && own.length === 0) continue;
    const grade = courseGrade(own, shareFor(subject.id, settings));
    const deficit = grade.points !== null && grade.points < CONFIG.abitur.deficitBelow;
    if (grade.exact !== null) {
      const w = subject.isAdvanced ? CONFIG.abitur.lkWeight : 1;
      sum += grade.exact * w;
      weights += w;
    }
    if (deficit) deficits += 1;
    rows.push({ subject, grade, trend: trendOf(own), deficit });
  }
  return { rows, average: weights > 0 ? sum / weights : null, graded: rows.filter((r) => r.grade.points !== null).length, deficits };
}

/**
 * Aktueller Notenstand eines Fachs aus den Einzelnoten: das gewählte Halbjahr, hat es keine Noten, das letzte Halbjahr mit Noten.
 */
export function currentPoints(
  entries: readonly GradeEntry[],
  subjectId: string,
  settings: GradeSettings,
  preferred: Quarter,
): { points: number; quarter: Quarter } | null {
  const order = [preferred, ...[...QUARTERS].reverse().filter((q) => q !== preferred)];
  for (const quarter of order) {
    const own = forSubject(entries, subjectId, quarter);
    const grade = courseGrade(own, shareFor(subjectId, settings));
    if (grade.points !== null) return { points: grade.points, quarter };
  }
  return null;
}

/**
 * Kursnoten für den Abiturrechner: je Fach und Halbjahr mit Einzelnoten die gerundete Kursnote. Halbjahre ohne Einzelnoten
 * behalten, was im Plan schon steht. `changed` zählt die Kurse, deren Zahl sich dadurch ändert.
 */
export function courseGradesForAbitur(
  subjects: readonly Subject[],
  entries: readonly GradeEntry[],
  settings: GradeSettings,
  plan: AbiturPlan,
): { courses: AbiturPlan['courses']; changed: number } {
  const courses: AbiturPlan['courses'] = { ...plan.courses };
  let changed = 0;
  for (const subject of subjects) {
    const base = (plan.courses[subject.id] ?? []).slice(0, CONFIG.abitur.quarters);
    const next: (number | null)[] = Array.from({ length: CONFIG.abitur.quarters }, (_, i) => base[i] ?? null);
    let touched = false;
    QUARTERS.forEach((quarter, i) => {
      const grade = courseGrade(forSubject(entries, subject.id, quarter), shareFor(subject.id, settings));
      if (grade.points === null) return;
      if (next[i] !== grade.points) changed += 1;
      next[i] = grade.points;
      touched = true;
    });
    if (touched) courses[subject.id] = next;
  }
  return { courses, changed };
}

/** Vergangene Klausuren aus dem Plan, zu denen noch keine Note eingetragen ist (neueste zuerst). */
export function examsWithoutGrade(exams: readonly Exam[], entries: readonly GradeEntry[], today: string): Exam[] {
  const linked = new Set(entries.map((e) => e.examId).filter((id): id is string => !!id));
  const oldest = new Date(today);
  oldest.setDate(oldest.getDate() - G.pendingExamDays);
  const limit = Number.isNaN(oldest.getTime()) ? '' : oldest.toISOString().slice(0, 10);
  return exams
    .filter((e) => e.date <= today && e.date >= limit && !linked.has(e.id))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------------------------------------------
// Noten aus korrigierten Klausuren

/** Eine Klausurnote der Lehrkraft aus der Klausurenkorrektur, die noch nicht als Einzelnote eingetragen ist. */
export interface ReviewCandidate {
  reviewId: string;
  grade: GradeEntry;
}

/** Id der Einzelnote, die aus einer Korrektur entsteht: gleich bleibend, damit ein erneutes Übernehmen nichts doppelt anlegt. */
export const reviewGradeId = (reviewId: string): string => `review-${reviewId}`;

/**
 * Echte Klausuren (keine Übungsklausuren) mit eingetragener Note der Lehrkraft, zu denen noch keine Einzelnote besteht.
 * Als bereits vorhanden gilt eine Note mit derselben Id, derselben verknüpften Klausur im Plan oder einer Klausur im selben
 * Fach mit gleichem Datum und gleichen Punkten. Das Halbjahr kommt aus der Korrektur, sonst aus `fallback`.
 */
export function reviewCandidates(
  reviews: readonly ExamReview[],
  entries: readonly GradeEntry[],
  exams: readonly Exam[],
  subjectIds: ReadonlySet<string>,
  fallback: Quarter,
): ReviewCandidate[] {
  const examIds = new Set(exams.map((e) => e.id));
  const out: ReviewCandidate[] = [];
  for (const r of reviews) {
    if (r.practiceId !== null || r.teacherPoints === null || r.subjectId === null || !subjectIds.has(r.subjectId)) continue;
    const id = reviewGradeId(r.id);
    const points = clampPoints(r.teacherPoints);
    const known = entries.some(
      (e) =>
        e.id === id ||
        (r.examId !== null && e.examId === r.examId) ||
        (e.subjectId === r.subjectId && groupOf(e.kind) === 'written' && e.date === r.examDate && e.points === points),
    );
    if (known) continue;
    out.push({
      reviewId: r.id,
      grade: {
        id,
        subjectId: r.subjectId,
        quarter: r.quarter ?? fallback,
        date: r.examDate,
        kind: 'exam',
        title: r.title,
        points,
        weight: defaultWeight('exam'),
        examId: r.examId !== null && examIds.has(r.examId) ? r.examId : null,
      },
    });
  }
  return out.sort((a, b) => b.grade.date.localeCompare(a.grade.date));
}
