import { CONFIG } from './config';
import { addDays } from './schedule';

/**
 * Konzentrationsscore: Schätzung, wie viel konzentrierte Lernzeit heute sinnvoll ist.
 * Eine Empfehlung, sie blockiert nichts. Alle Zahlen stehen in CONFIG.concentration.
 */

export interface ConcentrationInput {
  sleepHours: number | null;
  /** Selbsteinschätzung 1 (leer) bis 5 (top). */
  energy: number | null;
  trainingSessions: number | null;
  trainingMinutes: number | null;
  /** Belastung des Tages in Punkten (Dauer mal Anstrengung), aus Overload oder von Hand. Ohne Wert gilt die Minutenregel. */
  trainingLoad?: number | null;
  /** Anstrengung des Trainings 1 (sehr leicht) bis 10 (maximal), nur zur Anzeige und für den Bonus bei kurzen, harten Einheiten. */
  trainingRpe?: number | null;
  /** 7:28-Verhältnis (akut zu chronisch, EWMA) aus Overload, null wenn unbekannt oder noch zu wenig Daten. */
  loadRatio?: number | null;
  learnedMin: number;
  plannedMin: number;
}

export type ConcentrationTip =
  | 'no_data'
  | 'sleep_low'
  | 'energy_low'
  | 'training_heavy'
  | 'load_high'
  | 'load_very_high'
  | 'planned_over_capacity'
  | 'near_capacity'
  | 'over_capacity';

export interface ConcentrationResult {
  hasInput: boolean;
  /** Sinnvolle konzentrierte Lernzeit heute in Minuten, auf 5 Minuten gerundet. */
  capacityMin: number;
  factor: number;
  parts: { sleep: number; energy: number; training: number; load: number };
  /** Einordnung des 7:28-Verhältnisses, null ohne Wert. */
  loadStatus: LoadStatus | null;
  remainingMin: number;
  status: 'free' | 'near' | 'over';
  sessionMin: number;
  tips: ConcentrationTip[];
}

/** Einordnung des Verhältnisses aus 7-Tage- und 28-Tage-Belastung: erholt, optimal, hoch, sehr hoch (Schwellen wie in Overload). */
export type LoadStatus = 'low' | 'ok' | 'high' | 'very';

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export function loadStatus(ratio: number | null | undefined, cfg = CONFIG.concentration): LoadStatus | null {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio) || ratio < 0) return null;
  const l = cfg.load;
  return ratio < l.ratioLow ? 'low' : ratio <= l.ratioHigh ? 'ok' : ratio <= l.ratioVeryHigh ? 'high' : 'very';
}

/** Verhältnis aus akuter (7 Tage) und chronischer (28 Tage) Belastung. null bei fehlenden Werten oder chronisch 0. */
export function loadRatio(acute: number | null | undefined, chronic: number | null | undefined): number | null {
  if (acute === null || acute === undefined || chronic === null || chronic === undefined) return null;
  return chronic > 0 && acute >= 0 ? acute / chronic : null;
}

/** Dämpfung durch hohe Belastung der letzten Woche im Vergleich zu dem, was der Körper gewohnt ist. Bei erholt und optimal keine. */
export function loadFactor(ratio: number | null | undefined, cfg = CONFIG.concentration): number {
  const status = loadStatus(ratio, cfg);
  return status === 'very' ? cfg.load.veryHighFactor : status === 'high' ? cfg.load.highFactor : 1;
}

/** Punkte einer Trainingsbelastung: Minuten mal Anstrengung (1 bis 10). */
export const trainingLoadPoints = (minutes: number, rpe: number): number => Math.round(Math.max(0, minutes) * clamp(rpe, 1, 10));

export function sleepFactor(hours: number | null, cfg = CONFIG.concentration): number {
  if (hours === null) return 1;
  if (hours >= cfg.sleepFullH) return 1;
  const t = clamp((hours - cfg.sleepMinH) / (cfg.sleepFullH - cfg.sleepMinH), 0, 1);
  return cfg.sleepMinFactor + t * (1 - cfg.sleepMinFactor);
}

export function energyFactor(energy: number | null, cfg = CONFIG.concentration): number {
  if (energy === null) return 1;
  const t = (clamp(energy, 1, 5) - 1) / 4;
  return cfg.energyMinFactor + t * (cfg.energyMaxFactor - cfg.energyMinFactor);
}

export function trainingFactor(
  sessions: number | null,
  minutes: number | null,
  cfg = CONFIG.concentration,
  load: number | null = null,
  rpe: number | null = null,
): number {
  const n = sessions ?? 0;
  const m = minutes ?? 0;
  if (n <= 0 && m <= 0) return 1;
  // Mit bekannter Belastung (Dauer mal Anstrengung) entscheidet sie: viel Belastung kostet, eine moderate Einheit hilft leicht
  if (load !== null && load > 0) {
    if (load >= cfg.load.heavyLoadMin) return cfg.trainingHeavyFactor;
    if (load <= cfg.load.moderateLoadMax && (rpe === null || rpe < cfg.load.noBonusRpe)) return cfg.trainingLightBonus;
    return 1;
  }
  if (n >= cfg.trainingHeavySessions || m >= cfg.trainingHeavyMin) return cfg.trainingHeavyFactor;
  if (m <= cfg.trainingLightMaxMin) return cfg.trainingLightBonus;
  return 1;
}

export function concentration(input: ConcentrationInput, cfg = CONFIG.concentration): ConcentrationResult {
  const parts = {
    sleep: sleepFactor(input.sleepHours, cfg),
    energy: energyFactor(input.energy, cfg),
    training: trainingFactor(input.trainingSessions, input.trainingMinutes, cfg, input.trainingLoad ?? null, input.trainingRpe ?? null),
    load: loadFactor(input.loadRatio, cfg),
  };
  const factor = parts.sleep * parts.energy * parts.training * parts.load;
  const capacityMin = Math.round(clamp(cfg.baseMin * factor, cfg.minMin, cfg.maxMin) / 5) * 5;
  const hasInput = input.sleepHours !== null || input.energy !== null || input.trainingSessions !== null || loadStatus(input.loadRatio, cfg) !== null;
  const status =
    input.learnedMin >= capacityMin ? 'over' : input.learnedMin >= capacityMin * cfg.nearShare ? 'near' : 'free';

  const tips: ConcentrationTip[] = [];
  if (!hasInput) tips.push('no_data');
  if (parts.sleep < 0.9) tips.push('sleep_low');
  if (input.energy !== null && input.energy <= 2) tips.push('energy_low');
  if (parts.training < 1) tips.push('training_heavy');
  const status7 = loadStatus(input.loadRatio, cfg);
  if (status7 === 'high') tips.push('load_high');
  if (status7 === 'very') tips.push('load_very_high');
  if (input.plannedMin > capacityMin) tips.push('planned_over_capacity');
  if (status === 'over') tips.push('over_capacity');
  else if (status === 'near') tips.push('near_capacity');

  return {
    hasInput,
    capacityMin,
    factor,
    parts,
    loadStatus: status7,
    remainingMin: Math.max(0, capacityMin - input.learnedMin),
    status,
    sessionMin:
      factor < cfg.lowFactor ? cfg.sessionLowMin : factor >= cfg.highFactor ? cfg.sessionHighMin : cfg.sessionNormalMin,
    tips,
  };
}

/** Belastungswerte eines Tages, wie Overload sie schickt (Felder frei, wenn Overload sie nicht kennt). */
export interface FitnessLoadDay {
  date: string;
  load: number | null;
  rpe: number | null;
  rpeSet: boolean | null;
  acute: number | null;
  chronic: number | null;
  loadReady: boolean | null;
}

/**
 * Das 7:28-Verhältnis: der letzte Wert aus Overload bis zu diesem Tag, höchstens maxAgeDays alt und nur mit genug Daten (loadReady).
 * `known` sagt, ob Overload überhaupt Werte geschickt hat, dann lohnt der Hinweis "noch zu wenig Daten".
 */
export function latestLoadRatio(
  days: readonly FitnessLoadDay[],
  date: string,
  maxAgeDays: number = CONFIG.concentration.load.maxAgeDays,
): { ratio: number | null; acute: number | null; chronic: number | null; known: boolean } {
  const from = addDays(date, -maxAgeDays);
  const latest = days
    .filter((d) => d.date <= date && d.date >= from && d.acute !== null && d.chronic !== null)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) return { ratio: null, acute: null, chronic: null, known: false };
  return { ratio: latest.loadReady === true ? loadRatio(latest.acute, latest.chronic) : null, acute: latest.acute, chronic: latest.chronic, known: true };
}

/**
 * Belastung eines von Hand eingetragenen Trainings: Dauer mal Anstrengung. Ohne Anstrengung schätzt die App eine mittlere
 * (cfg.load.defaultRpe). null ohne Einheit oder ohne Dauer.
 */
export function manualTrainingLoad(
  sessions: number | null,
  minutes: number | null,
  rpe: number | null,
  cfg = CONFIG.concentration,
): { load: number; rpe: number; set: boolean } | null {
  if ((sessions ?? 0) <= 0 || (minutes ?? 0) <= 0) return null;
  const used = rpe ?? cfg.load.defaultRpe;
  return { load: trainingLoadPoints(minutes as number, used), rpe: used, set: rpe !== null };
}
