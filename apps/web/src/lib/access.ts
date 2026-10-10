import { canUse, hasAnyAi, type AiFeature } from '@study/core';
import { useStore } from '../state/store';

/**
 * Was das angemeldete Konto darf. Die App blendet nur aus, entschieden wird auf dem Server (Edge Functions, Row Level Security).
 * isAdmin: Kosten, Modelle, technische Meldungen und das Admin-Protokoll sind nur für den Admin sichtbar.
 */
export function useAccess() {
  const { state } = useStore();
  const a = state.account;
  return {
    status: a.status,
    isAdmin: a.isAdmin && a.status === 'active',
    anyAi: hasAnyAi(a),
    can: (f: AiFeature) => canUse(a, f),
  };
}
