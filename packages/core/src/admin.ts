/**
 * Verstecktes Admin-Protokoll: geheimer Tipp-Zähler und Auswertung des KI-Verbrauchs. Reine Funktionen ohne UI.
 */
import { costUsd, type ModelPrice } from './worksheets';

export interface TapState {
  count: number;
  last: number; // Zeitpunkt des letzten Tipps in ms, 0 = noch keiner
}

export const NO_TAPS: TapState = { count: 0, last: 0 };

/**
 * Zählt Tipps hintereinander. Kommt der nächste Tipp später als `gapMs`, beginnt die Zählung bei 1.
 * Nach `needed` Tipps ist es freigeschaltet und der Zähler beginnt von vorn.
 */
export function registerTap(state: TapState, now: number, needed = 5, gapMs = 1500): { state: TapState; unlocked: boolean } {
  const count = state.last > 0 && now - state.last <= gapMs ? state.count + 1 : 1;
  if (count >= needed) return { state: NO_TAPS, unlocked: true };
  return { state: { count, last: now }, unlocked: false };
}

export interface UsageRow {
  month: string;
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
}

export interface ModelUsage {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface MonthUsage {
  month: string;
  models: ModelUsage[];
  requests: number;
  costUsd: number;
}

/** Verbrauch je Monat und Modell mit Kosten, neueste Monate zuerst, Modelle nach Kosten. */
export function usageByMonth(rows: readonly UsageRow[], prices: Record<string, ModelPrice>): MonthUsage[] {
  const months = new Map<string, Map<string, ModelUsage>>();
  for (const r of rows) {
    const models = months.get(r.month) ?? new Map<string, ModelUsage>();
    const m = models.get(r.model) ?? { model: r.model, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    m.requests += Number(r.requests);
    m.inputTokens += Number(r.input_tokens);
    m.outputTokens += Number(r.output_tokens);
    m.costUsd = costUsd(r.model, m.inputTokens, m.outputTokens, prices);
    models.set(r.model, m);
    months.set(r.month, models);
  }
  return [...months.entries()]
    .map(([month, models]) => {
      const list = [...models.values()].sort((a, b) => b.costUsd - a.costUsd || a.model.localeCompare(b.model));
      return { month, models: list, requests: list.reduce((s, m) => s + m.requests, 0), costUsd: list.reduce((s, m) => s + m.costUsd, 0) };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
}

/** Dollar mit passender Genauigkeit: kleine Beträge mit vier Stellen, sonst zwei. */
export function formatUsd(usd: number): string {
  const digits = usd !== 0 && Math.abs(usd) < 0.1 ? 4 : 2;
  return `${usd.toFixed(digits).replace('.', ',')} $`;
}

/** Token-Zahl lesbar: 1.234 oder 1,2 Mio. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} Mio.`;
  return Math.round(n).toLocaleString('de-DE');
}
