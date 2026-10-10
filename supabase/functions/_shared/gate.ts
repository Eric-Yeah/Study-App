// Zugang zu den KI-Functions (nur Deno, wird nicht aus packages/core kopiert, nutzt aber access.ts, config.ts und worksheets.ts von dort).
// - Prüft, ob das Konto freigegeben ist und die KI-Funktion freigeschaltet hat (accounts, canUse). Sonst: not_allowed.
// - Budget: der Admin hat seinen eigenen Topf (CONFIG.ai.monthlyBudgetUsd), alle Freunde zusammen einen gemeinsamen
//   (app_settings.friends_budget_usd, CONFIG.access.friendsRequestCap).
// - lock: höchstens eine laufende KI-Anfrage je Konto (ai_begin/ai_end), damit gleichzeitige Anfragen das Budget nicht überholen.
//   Nach dem Ende der Anfrage gate.end() aufrufen (finally).

import { budgetRows, canUse, readAccess, type AiFeature, type BudgetUsageRow } from './access.ts';
import { CONFIG } from './config.ts';
import { spentUsd } from './worksheets.ts';

export class GateError extends Error {
  code: 'not_allowed' | 'busy';
  constructor(code: 'not_allowed' | 'busy') {
    super(code);
    this.code = code;
  }
}

export interface Gate {
  isAdmin: boolean;
  budgetUsd: number;
  requestCap: number;
  usage(): Promise<{ requests: number; spent: number }>;
  end(): Promise<void>;
}

// deno-lint-ignore no-explicit-any
type Db = any;

export async function openGate(admin: Db, userId: string, feature: AiFeature, opts: { lock?: boolean } = {}): Promise<Gate> {
  const { data } = await admin.from('accounts').select('status, is_admin, ai_features').eq('user_id', userId).maybeSingle();
  const access = readAccess(data);
  if (!canUse(access, feature)) throw new GateError('not_allowed');

  let budgetUsd = CONFIG.ai.monthlyBudgetUsd;
  let requestCap = CONFIG.ai.monthlyRequestCap;
  let adminIds = new Set<string>();
  if (!access.isAdmin) {
    const { data: s } = await admin.from('app_settings').select('friends_budget_usd').eq('id', 1).maybeSingle();
    const set = Number(s?.friends_budget_usd);
    budgetUsd = Number.isFinite(set) && set >= 0 ? set : CONFIG.access.friendsBudgetUsd;
    requestCap = CONFIG.access.friendsRequestCap;
    const { data: admins } = await admin.from('accounts').select('user_id').eq('is_admin', true);
    adminIds = new Set(((admins ?? []) as { user_id: string }[]).map((r) => r.user_id));
  }

  const month = new Date().toISOString().slice(0, 7);
  const usage = async () => {
    let q = admin.from('ai_usage').select('user_id, model, requests, input_tokens, output_tokens').eq('month', month);
    if (access.isAdmin) q = q.eq('user_id', userId);
    const { data: rows } = await q;
    const mine = budgetRows(((rows ?? []) as BudgetUsageRow[]).map((r) => ({ ...r, user_id: String(r.user_id ?? userId) })), userId, access.isAdmin, adminIds);
    return { requests: mine.reduce((n, r) => n + Number(r.requests ?? 0), 0), spent: spentUsd(mine, CONFIG.ai.prices) };
  };

  let locked = false;
  if (opts.lock) {
    const { data: ok } = await admin.rpc('ai_begin', { p_user: userId });
    if (ok !== true) throw new GateError('busy');
    locked = true;
  }
  return {
    isAdmin: access.isAdmin,
    budgetUsd,
    requestCap,
    usage,
    end: async () => {
      if (!locked) return;
      locked = false;
      try {
        await admin.rpc('ai_end', { p_user: userId });
      } catch {
        /* verfällt nach 3 Minuten von selbst */
      }
    },
  };
}
