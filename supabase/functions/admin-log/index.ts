// Supabase Edge Function (Deno): Daten für das versteckte Admin-Protokoll der App.
//
// - Verify JWT AN. Nur das Admin-Konto (accounts.is_admin, setzt nur die Migration) und zusätzlich ein Passwort (Secret
//   ADMIN_PASSWORD, nur auf dem Server). Andere Konten bekommen sofort not_admin, ohne dass das Passwort geprüft wird. Nach
//   CONFIG.access.adminMaxAttempts falschen Passwörtern ist es CONFIG.access.adminLockMinutes gesperrt (admin_attempts).
// - Anfrage: { password, op?: 'report' | 'accounts' | 'update' | 'settings' | 'delete', ... }
//   report (Standard): eigene Daten { usage, log, counts, storage, secrets, serverTime }
//   accounts: alle Konten mit Zahlen (keine Inhalte) und den Einstellungen { accounts, settings, month }
//   update: { userId, status?, features? } Freigabe, Sperre, KI-Funktionen eines Kontos
//   settings: { friendsBudgetUsd?, cardsDailyLimit? } gemeinsamer Topf der Freunde, Tageslimit KI-Karten
//   delete: { userId } Konto mit allen Daten und Dateien löschen (nicht das eigene)
// - Fehler als { error, message } auf Deutsch.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { readAccountPatch } from '../_shared/access.ts';
import { CONFIG } from '../_shared/config.ts';
import { removeUserFiles } from '../_shared/userFiles.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Vergleicht zwei Texte in gleicher Zeit (über SHA-256), damit die Antwortzeit nichts über das Passwort verrät. */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(expected))]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const TABLES = ['subjects', 'exams', 'exam_topics', 'focus_sessions', 'tasks', 'daily_checkins', 'lesson_notes', 'worksheet_files', 'flashcards', 'exam_reviews', 'exam_files', 'practice_exams', 'task_styles', 'abitur_plans', 'push_subs'] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'bad_request', message: 'Anfrage nicht erlaubt.' }, 405);

  try {
    const expected = Deno.env.get('ADMIN_PASSWORD');
    if (!expected) return json({ error: 'not_configured', message: 'Das Admin-Protokoll ist noch nicht eingerichtet (Secret ADMIN_PASSWORD fehlt in Supabase).' }, 500);

    const userDb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: auth } = await userDb.auth.getUser();
    if (!auth?.user) return json({ error: 'unauthorized', message: 'Bitte melde dich neu an.' }, 401);
    const userId = auth.user.id;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

    // Nur das Admin-Konto. Andere Konten erfahren nichts über das Passwort.
    const { data: me } = await admin.from('accounts').select('is_admin, status').eq('user_id', userId).maybeSingle();
    if (!me?.is_admin || me.status !== 'active') return json({ error: 'not_admin', message: 'Nicht erlaubt.' }, 403);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'bad_request', message: 'Die Anfrage war unvollständig.' }, 400);
    }

    // Sperre nach zu vielen Fehlversuchen
    const { data: attempt } = await admin.from('admin_attempts').select('failed, locked_until').eq('user_id', userId).maybeSingle();
    if (attempt?.locked_until && new Date(attempt.locked_until).getTime() > Date.now()) {
      const min = Math.ceil((new Date(attempt.locked_until).getTime() - Date.now()) / 60_000);
      return json({ error: 'locked', message: `Zu viele falsche Passwörter. Versuche es in ${min} ${min === 1 ? 'Minute' : 'Minuten'} wieder.` }, 429);
    }
    const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
    if (!password || !(await sameSecret(password, expected))) {
      const failed = Number(attempt?.failed ?? 0) + 1;
      const lock = failed >= CONFIG.access.adminMaxAttempts;
      await admin.from('admin_attempts').upsert({
        user_id: userId,
        failed: lock ? 0 : failed,
        locked_until: lock ? new Date(Date.now() + CONFIG.access.adminLockMinutes * 60_000).toISOString() : null,
      });
      await sleep(CONFIG.admin.wrongPasswordDelayMs);
      return json({ error: 'wrong_password', message: lock ? `Das Passwort stimmt nicht. Das Protokoll ist jetzt ${CONFIG.access.adminLockMinutes} Minuten gesperrt.` : 'Das Passwort stimmt nicht.' }, 403);
    }
    if (attempt && (attempt.failed || attempt.locked_until)) await admin.from('admin_attempts').update({ failed: 0, locked_until: null }).eq('user_id', userId);

    const op = typeof body.op === 'string' ? body.op : 'report';
    const month = new Date().toISOString().slice(0, 7);
    const readSettings = async () => {
      const { data } = await admin.from('app_settings').select('friends_budget_usd, cards_daily_limit').eq('id', 1).maybeSingle();
      return {
        friendsBudgetUsd: Number(data?.friends_budget_usd ?? CONFIG.access.friendsBudgetUsd),
        cardsDailyLimit: Number(data?.cards_daily_limit ?? CONFIG.access.cardsDailyLimit),
      };
    };
    const targetId = typeof body.userId === 'string' && /^[0-9a-f-]{36}$/i.test(body.userId) ? body.userId : '';

    if (op === 'accounts') {
      const { data, error } = await admin.rpc('admin_account_stats', { p_month: month });
      if (error) return json({ error: 'unavailable', message: 'Die Konten konnten nicht geladen werden.' }, 503);
      return json({ accounts: data ?? [], settings: await readSettings(), month });
    }

    if (op === 'update') {
      const patch = readAccountPatch(body);
      if (!targetId || !patch) return json({ error: 'bad_request', message: 'Die Änderung ist ungültig.' }, 400);
      if (targetId === userId && patch.status && patch.status !== 'active') return json({ error: 'bad_request', message: 'Dein eigenes Konto kannst du nicht sperren.' }, 400);
      const { data: current } = await admin.from('accounts').select('status, approved_at').eq('user_id', targetId).maybeSingle();
      if (!current) return json({ error: 'not_found', message: 'Das Konto gibt es nicht.' }, 404);
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.status) row.status = patch.status;
      if (patch.status === 'active' && !current.approved_at) row.approved_at = new Date().toISOString();
      if (patch.features) row.ai_features = patch.features;
      const { error } = await admin.from('accounts').update(row).eq('user_id', targetId);
      if (error) return json({ error: 'unavailable', message: 'Die Änderung konnte nicht gespeichert werden.' }, 503);
      return json({ ok: true });
    }

    if (op === 'settings') {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const budget = Number(body.friendsBudgetUsd);
      const limit = Number(body.cardsDailyLimit);
      if (body.friendsBudgetUsd !== undefined) {
        if (!Number.isFinite(budget) || budget < 0 || budget > 100) return json({ error: 'bad_request', message: 'Das Budget muss zwischen 0 und 100 $ liegen.' }, 400);
        row.friends_budget_usd = Math.round(budget * 100) / 100;
      }
      if (body.cardsDailyLimit !== undefined) {
        if (!Number.isInteger(limit) || limit < 0 || limit > 1000) return json({ error: 'bad_request', message: 'Das Tageslimit muss zwischen 0 und 1000 liegen.' }, 400);
        row.cards_daily_limit = limit;
      }
      const { error } = await admin.from('app_settings').update(row).eq('id', 1);
      if (error) return json({ error: 'unavailable', message: 'Die Einstellungen konnten nicht gespeichert werden.' }, 503);
      return json({ settings: await readSettings() });
    }

    if (op === 'delete') {
      if (!targetId) return json({ error: 'bad_request', message: 'Kein Konto gewählt.' }, 400);
      if (targetId === userId) return json({ error: 'bad_request', message: 'Dein eigenes Konto kannst du hier nicht löschen.' }, 400);
      const { data: target } = await admin.from('accounts').select('is_admin').eq('user_id', targetId).maybeSingle();
      if (target?.is_admin) return json({ error: 'bad_request', message: 'Ein Admin-Konto lässt sich nicht löschen.' }, 400);
      const removed = await removeUserFiles(admin, targetId);
      const { error } = await admin.auth.admin.deleteUser(targetId);
      if (error) return json({ error: 'unavailable', message: 'Das Konto konnte nicht gelöscht werden.' }, 503);
      return json({ ok: true, removedFiles: removed });
    }

    if (op !== 'report') return json({ error: 'bad_request', message: 'Unbekannte Aktion.' }, 400);

    // Alte Protokolleinträge aufräumen
    const cutoff = new Date(Date.now() - CONFIG.admin.logKeepDays * 86_400_000).toISOString();
    await admin.from('ai_log').delete().eq('user_id', userId).lt('at', cutoff);

    const [usage, log] = await Promise.all([
      admin.from('ai_usage').select('month, model, requests, input_tokens, output_tokens').eq('user_id', userId).order('month', { ascending: false }),
      admin
        .from('ai_log')
        .select('id, at, kind, task, model, effort, input_tokens, output_tokens, cost_usd, duration_ms, status, note_id, detail')
        .eq('user_id', userId)
        .order('at', { ascending: false })
        .limit(CONFIG.admin.logLimit),
    ]);

    const counts: Record<string, number | null> = {};
    await Promise.all(
      TABLES.map(async (table) => {
        const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId);
        counts[table] = error ? null : (count ?? 0);
      }),
    );

    const storage: Record<string, { files: number; bytes: number } | null> = {};
    for (const bucket of ['documents', 'worksheets', 'exams']) {
      const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
      storage[bucket] = error
        ? null
        : { files: data?.length ?? 0, bytes: (data ?? []).reduce((sum, f) => sum + Number((f.metadata as { size?: number } | null)?.size ?? 0), 0) };
    }

    return json({
      usage: usage.data ?? [],
      log: log.data ?? [],
      counts,
      storage,
      secrets: { anthropic: Boolean(Deno.env.get('ANTHROPIC_API_KEY')), groq: Boolean(Deno.env.get('GROQ_API_KEY')) },
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    console.error('admin-log', e instanceof Error ? e.message : e);
    return json({ error: 'unavailable', message: 'Das Protokoll ist gerade nicht erreichbar.' }, 503);
  }
});
