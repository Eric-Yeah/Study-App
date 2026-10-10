/**
 * Konten für Freunde: Status (wartet, aktiv, gesperrt), Admin-Rolle und die freigeschalteten KI-Funktionen. Der Server entscheidet mit
 * denselben Funktionen wie die App (canUse), die App blendet nur aus. Reine Funktionen, importiert nichts, wird nach
 * supabase/functions/_shared kopiert (npm run sync:shared).
 */

export const AI_FEATURES = ['summarize', 'cards', 'correct', 'practice', 'topics', 'style'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  summarize: 'Zusammenfassungen',
  cards: 'KI-Karten',
  correct: 'Klausurkorrektur',
  practice: 'Übungsklausuren',
  topics: 'Themenliste',
  style: 'Aufgabenstil',
};

export type AccountStatus = 'pending' | 'active' | 'blocked';

export interface AccountAccess {
  status: AccountStatus;
  isAdmin: boolean;
  features: AiFeature[];
}

export const isAiFeature = (v: unknown): v is AiFeature => typeof v === 'string' && (AI_FEATURES as readonly string[]).includes(v);

/** Kein Eintrag: wartet (so startet jedes neue Konto). */
export const pendingAccess = (): AccountAccess => ({ status: 'pending', isAdmin: false, features: [] });

/** Liest eine Zeile aus accounts sicher (snake_case aus der Datenbank). */
export function readAccess(row: unknown): AccountAccess {
  if (typeof row !== 'object' || row === null) return pendingAccess();
  const o = row as Record<string, unknown>;
  const status: AccountStatus = o.status === 'active' || o.status === 'blocked' ? o.status : 'pending';
  const features = Array.isArray(o.ai_features) ? [...new Set(o.ai_features.filter(isAiFeature))] : [];
  return { status, isAdmin: o.is_admin === true, features };
}

/** Darf das Konto diese KI-Funktion nutzen? Nur aktive Konten; der Admin darf alles. */
export function canUse(a: AccountAccess, feature: AiFeature): boolean {
  return a.status === 'active' && (a.isAdmin || a.features.includes(feature));
}

/** Hat das Konto irgendeine KI-Funktion? (Dann zeigt die App KI-Bereiche überhaupt an.) */
export const hasAnyAi = (a: AccountAccess): boolean => AI_FEATURES.some((f) => canUse(a, f));

export interface BudgetUsageRow {
  user_id: string;
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
}

/**
 * Welche Verbrauchszeilen zählen für das Budget dieses Kontos: der Admin hat seinen eigenen Topf, alle Freunde zusammen einen gemeinsamen.
 */
export function budgetRows(rows: readonly BudgetUsageRow[], userId: string, isAdmin: boolean, adminIds: ReadonlySet<string>): BudgetUsageRow[] {
  return isAdmin ? rows.filter((r) => r.user_id === userId) : rows.filter((r) => !adminIds.has(r.user_id));
}

/** Änderung des Kontos durch den Admin prüfen. null, wenn ungültig. */
export function readAccountPatch(v: unknown): { status?: AccountStatus; features?: AiFeature[] } | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const out: { status?: AccountStatus; features?: AiFeature[] } = {};
  if (o.status !== undefined) {
    if (o.status !== 'pending' && o.status !== 'active' && o.status !== 'blocked') return null;
    out.status = o.status;
  }
  if (o.features !== undefined) {
    if (!Array.isArray(o.features) || !o.features.every(isAiFeature)) return null;
    out.features = [...new Set(o.features as AiFeature[])];
  }
  return out.status === undefined && out.features === undefined ? null : out;
}
