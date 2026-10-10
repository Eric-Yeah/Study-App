/**
 * Schwächen über alle Klausuren: wo gehen Punkte verloren (Operatoren, Anforderungsbereiche), wie entwickelt sich ein Fach
 * von Q-Phase zu Q-Phase. Rechnet nur mit den gespeicherten Korrekturen, ohne KI. Echte Klausuren und Übungsklausuren
 * werden getrennt ausgewertet. Nur Web-App, nicht für Deno.
 */
import { CONFIG } from './config';
import { QUARTERS, type Quarter } from './documents';
import { reviewView, type ExamReview } from './examReviews';

interface SubjectLike {
  id: string;
  name: string;
  type: string;
}

export interface BucketStat {
  key: string; // Operator klein geschrieben oder "AFB 1" bis "AFB 3"
  label: string;
  tasks: number;
  max: number;
  points: number;
  share: number; // erreichter Anteil der Punkte 0 bis 1
  lost: number; // verlorene Punkte
}

export interface QuarterStat {
  quarter: Quarter | null;
  reviews: number;
  share: number; // Anteil der Aufgabenpunkte 0 bis 1
  points: number | null; // mittlere Note in Notenpunkten (mit Abgleich), null ohne Ergebnis
}

export interface WeaknessReport {
  reviews: number;
  tasks: number;
  share: number | null; // über alle Aufgaben
  byOperator: BucketStat[]; // schwächste zuerst, nur mit genug Aufgaben
  byAfb: BucketStat[]; // AFB I bis III
  weakOperators: BucketStat[]; // höchstens CONFIG.weaknesses.maxItems, unter weakShare
  perQuarter: QuarterStat[]; // in Reihenfolge Q1 bis Q4, am Ende ohne Q-Phase
  weaknesses: string[]; // Schwächen aus den letzten Korrekturen (Text der KI)
  nextSteps: string[];
  hints: string[]; // Hinweise nach festen Regeln
}

const AFB_LABEL = ['AFB I', 'AFB II', 'AFB III'];
const pct = (x: number) => `${Math.round(x * 100)} %`;
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

const stat = (key: string, label: string, tasks: number, max: number, points: number): BucketStat => ({
  key,
  label,
  tasks,
  max,
  points,
  share: max > 0 ? points / max : 0,
  lost: Math.max(0, max - points),
});

/** Welche Korrekturen zählen: echte Klausuren oder Übungsklausuren, optional nur ein Fach. */
export function reviewsFor(reviews: readonly ExamReview[], opts: { practice: boolean; subjectId?: string | null }): ExamReview[] {
  return reviews.filter((r) => r.main && Boolean(r.practiceId) === opts.practice && (!opts.subjectId || r.subjectId === opts.subjectId));
}

/** Auswertung der Aufgaben, Operatoren und Anforderungsbereiche über die gewählten Korrekturen. */
export function weaknessReport(
  all: readonly ExamReview[],
  subjects: readonly SubjectLike[],
  opts: { practice?: boolean; subjectId?: string | null } = {},
  cfg = CONFIG.weaknesses,
): WeaknessReport {
  const list = reviewsFor(all, { practice: opts.practice === true, subjectId: opts.subjectId });
  const ops = new Map<string, { label: string; tasks: number; max: number; points: number }>();
  const afb: { tasks: number; max: number; points: number }[] = [0, 1, 2].map(() => ({ tasks: 0, max: 0, points: 0 }));
  let tasks = 0;
  let max = 0;
  let points = 0;

  for (const r of list) {
    for (const t of r.main!.result.aufgaben) {
      if (t.max <= 0) continue;
      tasks += 1;
      max += t.max;
      points += Math.min(t.punkte, t.max);
      const key = t.operator.trim().toLowerCase();
      if (key) {
        const o = ops.get(key) ?? { label: cap(key), tasks: 0, max: 0, points: 0 };
        o.tasks += 1;
        o.max += t.max;
        o.points += Math.min(t.punkte, t.max);
        ops.set(key, o);
      }
      if (t.afb) {
        const a = afb[t.afb - 1]!;
        a.tasks += 1;
        a.max += t.max;
        a.points += Math.min(t.punkte, t.max);
      }
    }
  }

  const byOperator = [...ops.entries()]
    .filter(([, o]) => o.tasks >= cfg.minTasks)
    .map(([key, o]) => stat(key, o.label, o.tasks, o.max, o.points))
    .sort((a, b) => a.share - b.share || b.lost - a.lost);
  const byAfb = afb.map((a, i) => stat(`AFB ${i + 1}`, AFB_LABEL[i]!, a.tasks, a.max, a.points)).filter((a) => a.tasks > 0);
  const weakOperators = byOperator.filter((o) => o.share < cfg.weakShare).slice(0, cfg.maxItems);

  // Verlauf: je Q-Phase Anteil und mittlere Note
  const quarters = new Map<Quarter | null, { shares: number[]; pts: number[] }>();
  for (const r of list) {
    const rMax = r.main!.result.aufgaben.reduce((n, t) => n + Math.max(0, t.max), 0);
    if (rMax <= 0) continue;
    const rPts = r.main!.result.aufgaben.reduce((n, t) => n + (t.max > 0 ? Math.min(t.punkte, t.max) : 0), 0);
    const q = quarters.get(r.quarter) ?? { shares: [], pts: [] };
    q.shares.push(rPts / rMax);
    const shown = reviewView(r, all, subjects).shown;
    if (shown !== null) q.pts.push(shown);
    quarters.set(r.quarter, q);
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const perQuarter: QuarterStat[] = [...QUARTERS, null]
    .filter((q) => quarters.has(q))
    .map((q) => {
      const v = quarters.get(q)!;
      return { quarter: q, reviews: v.shares.length, share: mean(v.shares), points: v.pts.length ? Math.round(mean(v.pts) * 10) / 10 : null };
    });

  // Zuletzt genannte Schwächen und Schritte (neueste Korrekturen zuerst, ohne Doppelte)
  const recent = [...list].sort((a, b) => b.examDate.localeCompare(a.examDate) || b.createdAt.localeCompare(a.createdAt)).slice(0, cfg.recentReviews);
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  const weaknesses = uniq(recent.flatMap((r) => r.main!.result.schwaechen));
  const nextSteps = uniq(recent.flatMap((r) => r.main!.result.naechste_schritte));

  // Hinweise nach festen Regeln
  const hints: string[] = [];
  const a1 = byAfb.find((a) => a.key === 'AFB 1');
  const a3 = byAfb.find((a) => a.key === 'AFB 3');
  if (a1 && a3 && a3.tasks >= cfg.minTasks && a1.share - a3.share >= cfg.afbGap) {
    hints.push(`Im Anforderungsbereich III holst du ${pct(a3.share)} der Punkte, im Bereich I ${pct(a1.share)}. Übe Beurteilen, Bewerten und Transfer, zum Beispiel mit einer schweren Übungsklausur.`);
  }
  const worst = weakOperators[0];
  if (worst) {
    hints.push(`Bei „${worst.label}“ bekommst du nur ${pct(worst.share)} der Punkte (${worst.tasks} Aufgaben, ${String(Math.round(worst.lost * 10) / 10).replace('.', ',')} Punkte verloren). Lies zu diesem Operator die Erwartung nach und schreib eine Aufgabe dazu.`);
  }
  if (a1 && a1.tasks >= cfg.minTasks && a1.share < cfg.weakShare) {
    hints.push(`Schon im Anforderungsbereich I fehlen Punkte (${pct(a1.share)}). Dort lohnt sich Wiederholen des Stoffs mit Karteikarten am meisten.`);
  }
  const dated = perQuarter.filter((q) => q.quarter !== null && q.points !== null);
  if (dated.length >= 2) {
    const last = dated[dated.length - 1]!;
    const prev = dated[dated.length - 2]!;
    const diff = Math.round((last.points! - prev.points!) * 10) / 10;
    if (Math.abs(diff) >= cfg.trendPoints) {
      hints.push(diff > 0 ? `Von ${prev.quarter} zu ${last.quarter} hast du dich um ${String(diff).replace('.', ',')} Notenpunkte verbessert.` : `Von ${prev.quarter} zu ${last.quarter} liegst du ${String(Math.abs(diff)).replace('.', ',')} Notenpunkte tiefer.`);
    }
  }

  return { reviews: list.length, tasks, share: max > 0 ? points / max : null, byOperator, byAfb, weakOperators, perQuarter, weaknesses, nextSteps, hints };
}

export interface SubjectWeakness {
  subjectId: string;
  name: string;
  reviews: number;
  share: number | null;
  points: number | null; // mittlere Note der letzten Q-Phase mit Ergebnis
  trend: number | null; // Unterschied der letzten beiden Q-Phasen in Notenpunkten
  weakest: BucketStat | null; // schwächster Operator
  weakestAfb: BucketStat | null;
}

/** Gesamtübersicht: ein Eintrag pro Fach, das schwächste zuerst. */
export function subjectOverview(all: readonly ExamReview[], subjects: readonly SubjectLike[], opts: { practice?: boolean } = {}, cfg = CONFIG.weaknesses): SubjectWeakness[] {
  const ids = [...new Set(reviewsFor(all, { practice: opts.practice === true }).map((r) => r.subjectId))].filter((id): id is string => id !== null);
  return ids
    .map((id) => {
      const rep = weaknessReport(all, subjects, { practice: opts.practice, subjectId: id }, cfg);
      const dated = rep.perQuarter.filter((q) => q.quarter !== null && q.points !== null);
      const last = dated[dated.length - 1];
      const prev = dated[dated.length - 2];
      return {
        subjectId: id,
        name: subjects.find((s) => s.id === id)?.name ?? 'Fach',
        reviews: rep.reviews,
        share: rep.share,
        points: last?.points ?? rep.perQuarter.find((q) => q.points !== null)?.points ?? null,
        trend: last && prev ? Math.round((last.points! - prev.points!) * 10) / 10 : null,
        weakest: rep.weakOperators[0] ?? null,
        weakestAfb: [...rep.byAfb].filter((a) => a.tasks >= cfg.minTasks).sort((a, b) => a.share - b.share)[0] ?? null,
      };
    })
    .sort((a, b) => (a.share ?? 2) - (b.share ?? 2));
}
