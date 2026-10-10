import type { UsageRow } from '@study/core';
import { supabase } from './supabase';
import { friendly } from './adminView';

export interface AdminLogRow {
  id: number;
  at: string;
  kind: 'summarize' | 'cards';
  task: string;
  model: string;
  effort: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | string;
  duration_ms: number;
  status: string;
  note_id: string | null;
  detail: string;
}

export interface AdminReport {
  usage: UsageRow[];
  log: AdminLogRow[];
  counts: Record<string, number | null>;
  storage: Record<string, { files: number; bytes: number } | null>;
  secrets: { anthropic: boolean; groq: boolean };
  serverTime: string;
}

export class AdminError extends Error {
  code: string;
  constructor(message: string, code = 'unavailable') {
    super(message);
    this.code = code;
  }
}

/** Holt die Daten für das Admin-Protokoll. Das Passwort prüft die Edge Function, es steht nirgends in der App. */
export async function fetchAdminReport(password: string): Promise<AdminReport> {
  const { data, error } = await supabase.functions.invoke<AdminReport>('admin-log', { body: { password } });
  if (error || !data) {
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = (await ctx.json()) as { message?: string; error?: string };
        throw new AdminError(body.message ?? 'Das Protokoll ist nicht erreichbar.', body.error);
      } catch (e) {
        if (e instanceof AdminError) throw e;
      }
    }
    throw new AdminError(friendly('Das Protokoll ist nicht erreichbar. Ist die Funktion admin-log in Supabase eingerichtet?'));
  }
  return data;
}

export interface AdminAccount {
  id: string;
  email: string | null;
  name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  status: 'pending' | 'active' | 'blocked' | null;
  is_admin: boolean | null;
  ai_features: string[] | null;
  approved_at: string | null;
  subjects: number;
  exams: number;
  notes: number;
  cards: number;
  reviews: number;
  practice: number;
  sessions: number;
  usage: { model: string; requests: number; input_tokens: number; output_tokens: number }[];
}

export interface AdminSettings {
  friendsBudgetUsd: number;
  cardsDailyLimit: number;
}

async function adminCall<T>(password: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('admin-log', { body: { password, ...body } });
  if (error || !data) {
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.json === 'function') {
      let parsed: { message?: string; error?: string } | null = null;
      try {
        parsed = (await ctx.json()) as { message?: string; error?: string };
      } catch {
        parsed = null;
      }
      if (parsed) throw new AdminError(parsed.message ?? 'Das hat nicht geklappt.', parsed.error);
    }
    throw new AdminError('Das Protokoll ist nicht erreichbar.');
  }
  return data;
}

export const fetchAccounts = (password: string) => adminCall<{ accounts: AdminAccount[]; settings: AdminSettings; month: string }>(password, { op: 'accounts' });

export const updateAccount = (password: string, userId: string, patch: { status?: string; features?: string[] }) =>
  adminCall<{ ok: true }>(password, { op: 'update', userId, ...patch });

export const saveAdminSettings = (password: string, settings: Partial<AdminSettings>) => adminCall<{ settings: AdminSettings }>(password, { op: 'settings', ...settings });

export const deleteAccount = (password: string, userId: string) => adminCall<{ ok: true }>(password, { op: 'delete', userId });
