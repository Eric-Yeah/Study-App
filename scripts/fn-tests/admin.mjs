import assert from 'node:assert/strict';
const UID = '11111111-2222-3333-4444-555555555555';
const FRIEND = '22222222-3333-4444-5555-666666666666';
const ADMIN2 = '33333333-4444-5555-6666-777777777777';
const queries = [];
const state = {
  accounts: { [UID]: { is_admin: true, status: 'active', approved_at: '2026-10-06' }, [FRIEND]: { is_admin: false, status: 'pending', approved_at: null }, [ADMIN2]: { is_admin: true, status: 'active' } },
  attempts: {},
  settings: { friends_budget_usd: 3, cards_daily_limit: 30 },
  updates: [], deleted: [], removed: [],
};
const data = {
  ai_usage: [{ month: '2026-10', model: 'claude-haiku-5-5', requests: 2, input_tokens: 100, output_tokens: 50 }],
  ai_log: [{ id: 1, at: '2026-10-08T10:00:00Z', kind: 'summarize', task: 'text', model: 'claude-haiku-5-5', effort: 'medium', input_tokens: 100, output_tokens: 50, cost_usd: 0.00003, duration_ms: 900, status: 'ok', note_id: 'n', detail: '' }],
};
const counts = { subjects: 5, exams: 4, exam_topics: 3, focus_sessions: 12, tasks: 6, daily_checkins: 9, lesson_notes: 14, worksheet_files: 20, flashcards: 18, exam_reviews: 2, exam_files: 0, practice_exams: 3, task_styles: 2, abitur_plans: 1, push_subs: 0 };
let failCounts = false;
const users = { 'Bearer good': UID, 'Bearer friend': FRIEND };
globalThis.__cc = (_u, key, opts) => {
  const service = key === 'service';
  const authz = opts?.global?.headers?.Authorization;
  const builder = (table) => {
    const q = { table, filters: {}, ops: [], head: false };
    const o = {
      select: (_cols, o2) => { q.head = Boolean(o2?.head); return o; },
      delete: () => { q.ops.push('delete'); return o; },
      update: (row) => { q.ops.push('update'); q.row = row; return o; },
      upsert: async (row) => { assert.equal(service, true); if (table === 'admin_attempts') state.attempts[row.user_id] = { failed: row.failed, locked_until: row.locked_until }; return { error: null }; },
      eq: (c, v) => { q.filters[c] = v; return o; },
      lt: (c, v) => { q.filters[`${c}<`] = v; return o; },
      order: () => o, limit: (n) => { q.limit = n; return o; },
      maybeSingle: async () => {
        assert.equal(service, true);
        if (table === 'accounts') return { data: state.accounts[q.filters.user_id] ?? null };
        if (table === 'admin_attempts') return { data: state.attempts[q.filters.user_id] ?? null };
        if (table === 'app_settings') return { data: state.settings };
        return { data: null };
      },
      then: (res) => {
        queries.push({ ...q, service });
        if (q.ops.includes('update')) {
          if (table === 'accounts') state.updates.push({ id: q.filters.user_id, ...q.row });
          if (table === 'app_settings') Object.assign(state.settings, q.row);
          if (table === 'admin_attempts') state.attempts[q.filters.user_id] = { ...state.attempts[q.filters.user_id], ...q.row };
          return Promise.resolve({ error: null }).then(res);
        }
        if (q.ops.includes('delete')) return Promise.resolve({ error: null }).then(res);
        if (q.head) return Promise.resolve({ count: failCounts ? null : counts[table], error: failCounts ? { message: 'x' } : null }).then(res);
        return Promise.resolve({ data: data[table] ?? [] }).then(res);
      },
    };
    return o;
  };
  return {
    auth: {
      getUser: async () => ({ data: { user: users[authz] ? { id: users[authz] } : null } }),
      admin: { deleteUser: async (id) => { assert.equal(service, true); state.deleted.push(id); return { error: null }; } },
    },
    from: builder,
    rpc: async (name, args) => { assert.equal(service, true); assert.equal(name, 'admin_account_stats'); assert.match(args.p_month, /^\d{4}-\d{2}$/); return { data: [{ id: FRIEND, email: 'f@x.de', status: 'pending' }], error: null }; },
    storage: { from: (bucket) => ({
      list: async (folder) => { queries.push({ storage: bucket, folder, service }); return { data: bucket === 'documents' ? [{ name: 'a.pdf', metadata: { size: 1000 } }, { name: 'b.pdf', metadata: { size: 500 } }] : [{ name: 'c.jpg', metadata: { size: 200 } }], error: null }; },
      remove: async (paths) => { assert.equal(service, true); state.removed.push(...paths.map((p) => `${bucket}:${p}`)); return { error: null }; },
    }) },
  };
};
const env = { ADMIN_PASSWORD: 'geheim', ANTHROPIC_API_KEY: 'sk', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
let handler; globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
await import(process.env.FN_COPY);
const call = async (body, authz = 'Bearer good') => { const r = await handler(new Request('http://x', { method: 'POST', headers: { Authorization: authz }, body: typeof body === 'string' ? body : JSON.stringify(body) })); return [r.status, await r.json()]; };
let n = 0; const ok = (m) => console.log(`✓ ${++n}. ${m}`);
let st, b;

[st, b] = await call({ password: 'geheim' });
assert.equal(st, 200); assert.equal(b.usage.length, 1); assert.equal(b.log.length, 1); assert.equal(b.log[0].status, 'ok');
assert.deepEqual(b.counts, counts); assert.deepEqual(b.storage.documents, { files: 2, bytes: 1500 }); assert.deepEqual(b.storage.worksheets, { files: 1, bytes: 200 });
assert.deepEqual(b.secrets, { anthropic: true, groq: false }); assert.ok(Date.parse(b.serverTime) > 0);
ok('Admin mit richtigem Passwort: eigener Bericht (Verbrauch, Protokoll, Zählungen, Speicher, Schlüssel)');
assert.ok(queries.filter((q) => q.table && !['accounts', 'admin_attempts'].includes(q.table)).every((q) => q.filters.user_id === UID));
assert.ok(queries.filter((q) => q.folder).every((q) => q.folder === UID)); assert.ok(queries.every((q) => q.service));
ok('der eigene Bericht fragt nur das eigene Konto ab');
assert.ok(JSON.stringify(b).indexOf('geheim') < 0); ok('das Passwort steht nicht in der Antwort');

// --- Nur das Admin-Konto ---
const t0 = Date.now(); [st, b] = await call({ password: 'geheim' }, 'Bearer friend');
assert.equal(st, 403); assert.equal(b.error, 'not_admin'); assert.ok(Date.now() - t0 < 500, 'keine Wartezeit, kein Passwortvergleich'); assert.deepEqual(state.attempts, {});
[st, b] = await call({ password: 'geheim', op: 'accounts' }, 'Bearer friend'); assert.equal(st, 403);
ok('andere Konten: sofort 403, auch mit richtigem Passwort, keine Fehlversuche gezählt');
[st, b] = await call({ password: 'geheim' }, 'Bearer schlecht'); assert.equal(st, 401); ok('ohne Anmeldung: 401');

// --- Fehlversuche und Sperre ---
for (let i = 1; i <= 4; i++) { [st, b] = await call({ password: 'falsch' }); assert.equal(st, 403); assert.equal(b.error, 'wrong_password'); assert.equal(state.attempts[UID].failed, i); }
[st, b] = await call({ password: 'falsch' }); assert.equal(st, 403); assert.ok(b.message.includes('15 Minuten gesperrt')); assert.ok(Date.parse(state.attempts[UID].locked_until) > Date.now());
[st, b] = await call({ password: 'geheim' }); assert.equal(st, 429); assert.equal(b.error, 'locked'); assert.ok(!('usage' in b));
ok('nach 5 falschen Passwörtern 15 Minuten gesperrt, auch das richtige Passwort hilft dann nicht');
state.attempts[UID] = { failed: 2, locked_until: new Date(Date.now() - 1000).toISOString() };
[st, b] = await call({ password: 'geheim' }); assert.equal(st, 200); assert.deepEqual(state.attempts[UID], { failed: 0, locked_until: null });
ok('nach Ablauf der Sperre geht es wieder, der Zähler wird zurückgesetzt');
[st] = await call({ password: '' }); assert.equal(st, 403); [st] = await call({}); assert.equal(st, 403); [st] = await call({ password: 42 }); assert.equal(st, 403); state.attempts = {};
ok('leeres, fehlendes und falsch typisiertes Passwort zählen als falsch');

// --- Konten ---
[st, b] = await call({ password: 'geheim', op: 'accounts' }); assert.equal(st, 200); assert.equal(b.accounts[0].email, 'f@x.de'); assert.deepEqual(b.settings, { friendsBudgetUsd: 3, cardsDailyLimit: 30 }); assert.match(b.month, /^\d{4}-\d{2}$/);
ok('Kontenliste mit Einstellungen');
[st, b] = await call({ password: 'geheim', op: 'update', userId: FRIEND, status: 'active', features: ['summarize', 'cards', 'cards'] }); assert.equal(st, 200);
const u = state.updates.at(-1); assert.equal(u.id, FRIEND); assert.equal(u.status, 'active'); assert.deepEqual(u.ai_features, ['summarize', 'cards']); assert.ok(u.approved_at);
ok('freigeben mit KI-Funktionen (ohne Doppelte), Datum der Freigabe');
[st, b] = await call({ password: 'geheim', op: 'update', userId: FRIEND, features: ['hacken'] }); assert.equal(st, 400);
[st, b] = await call({ password: 'geheim', op: 'update', userId: FRIEND, status: 'admin' }); assert.equal(st, 400);
[st, b] = await call({ password: 'geheim', op: 'update', userId: FRIEND }); assert.equal(st, 400);
[st, b] = await call({ password: 'geheim', op: 'update', userId: 'x', status: 'active' }); assert.equal(st, 400);
[st, b] = await call({ password: 'geheim', op: 'update', userId: UID, status: 'blocked' }); assert.equal(st, 400);
[st, b] = await call({ password: 'geheim', op: 'update', userId: '44444444-4444-4444-4444-444444444444', status: 'active' }); assert.equal(st, 404);
ok('ungültige Funktionen, Status, leere Änderung, falsche Id, eigenes Konto sperren, unbekanntes Konto: abgelehnt');

[st, b] = await call({ password: 'geheim', op: 'settings', friendsBudgetUsd: 4.567, cardsDailyLimit: 10 }); assert.equal(st, 200); assert.deepEqual(b.settings, { friendsBudgetUsd: 4.57, cardsDailyLimit: 10 });
[st] = await call({ password: 'geheim', op: 'settings', friendsBudgetUsd: -1 }); assert.equal(st, 400);
[st] = await call({ password: 'geheim', op: 'settings', friendsBudgetUsd: 1000 }); assert.equal(st, 400);
[st] = await call({ password: 'geheim', op: 'settings', cardsDailyLimit: 2.5 }); assert.equal(st, 400);
ok('Einstellungen: Topf der Freunde und Tageslimit, ungültige Werte abgelehnt');

state.removed.length = 0; [st, b] = await call({ password: 'geheim', op: 'delete', userId: FRIEND }); assert.equal(st, 200); assert.deepEqual(state.deleted, [FRIEND]);
assert.ok(state.removed.includes(`documents:${FRIEND}/a.pdf`) && state.removed.includes(`exams:${FRIEND}/c.jpg`)); assert.ok(state.removed.every((p) => p.includes(`:${FRIEND}/`)));
ok('Konto löschen: erst die Dateien im eigenen Ordner des Kontos, dann das Konto');
[st, b] = await call({ password: 'geheim', op: 'delete', userId: UID }); assert.equal(st, 400);
[st, b] = await call({ password: 'geheim', op: 'delete', userId: ADMIN2 }); assert.equal(st, 400);
[st, b] = await call({ password: 'geheim', op: 'delete' }); assert.equal(st, 400); assert.deepEqual(state.deleted, [FRIEND]);
[st, b] = await call({ password: 'geheim', op: 'unbekannt' }); assert.equal(st, 400);
ok('das eigene und andere Admin-Konten lassen sich nicht löschen, unbekannte Aktion abgelehnt');

[st, b] = await call('kein json'); assert.equal(st, 400); ok('kaputte Anfrage');
failCounts = true; [st, b] = await call({ password: 'geheim' }); assert.equal(st, 200); assert.ok(Object.values(b.counts).every((v) => v === null)); failCounts = false; ok('fehlt eine Tabelle, bleibt der Rest nutzbar');
const saved = env.ADMIN_PASSWORD; delete env.ADMIN_PASSWORD; [st, b] = await call({ password: 'geheim' }); assert.equal(st, 500); assert.equal(b.error, 'not_configured'); env.ADMIN_PASSWORD = saved; ok('ohne Secret ADMIN_PASSWORD: Protokoll aus');
console.log(`alle ${n} Gruppen bestanden`);
