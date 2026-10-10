import { describe, expect, it } from 'vitest';
import { AI_FEATURES, budgetRows, canUse, hasAnyAi, pendingAccess, readAccess, readAccountPatch } from './access';

describe('Konto lesen', () => {
  it('liest die Zeile sicher, ohne Zeile wartet das Konto', () => {
    expect(readAccess(null)).toEqual(pendingAccess());
    expect(readAccess({ status: 'active', is_admin: true, ai_features: ['cards', 'cards', 'hacken', 5] })).toEqual({ status: 'active', isAdmin: true, features: ['cards'] });
    expect(readAccess({ status: 'irgendwas', is_admin: 'ja' })).toEqual({ status: 'pending', isAdmin: false, features: [] });
  });
});

describe('Zugang', () => {
  it('nur aktive Konten mit freigeschalteter Funktion, der Admin darf alles', () => {
    expect(canUse({ status: 'active', isAdmin: false, features: ['cards'] }, 'cards')).toBe(true);
    expect(canUse({ status: 'active', isAdmin: false, features: ['cards'] }, 'summarize')).toBe(false);
    expect(canUse({ status: 'pending', isAdmin: false, features: ['cards'] }, 'cards')).toBe(false);
    expect(canUse({ status: 'blocked', isAdmin: true, features: [] }, 'cards')).toBe(false);
    for (const f of AI_FEATURES) expect(canUse({ status: 'active', isAdmin: true, features: [] }, f)).toBe(true);
    expect(hasAnyAi({ status: 'active', isAdmin: false, features: [] })).toBe(false);
    expect(hasAnyAi({ status: 'active', isAdmin: false, features: ['topics'] })).toBe(true);
  });
});

describe('Budget', () => {
  const rows = [
    { user_id: 'admin', model: 'm', requests: 1, input_tokens: 1, output_tokens: 1 },
    { user_id: 'f1', model: 'm', requests: 2, input_tokens: 1, output_tokens: 1 },
    { user_id: 'f2', model: 'm', requests: 3, input_tokens: 1, output_tokens: 1 },
  ];
  it('der Admin zählt nur sich, Freunde zählen alle Freunde', () => {
    expect(budgetRows(rows, 'admin', true, new Set(['admin'])).map((r) => r.user_id)).toEqual(['admin']);
    expect(budgetRows(rows, 'f1', false, new Set(['admin'])).map((r) => r.user_id)).toEqual(['f1', 'f2']);
  });
});

describe('Änderung durch den Admin', () => {
  it('nimmt nur gültige Werte an', () => {
    expect(readAccountPatch({ status: 'active' })).toEqual({ status: 'active' });
    expect(readAccountPatch({ features: ['cards', 'cards'] })).toEqual({ features: ['cards'] });
    expect(readAccountPatch({ features: [] })).toEqual({ features: [] });
    expect(readAccountPatch({ status: 'admin' })).toBeNull();
    expect(readAccountPatch({ features: ['root'] })).toBeNull();
    expect(readAccountPatch({ features: 'cards' })).toBeNull();
    expect(readAccountPatch({})).toBeNull();
    expect(readAccountPatch(null)).toBeNull();
  });
});
