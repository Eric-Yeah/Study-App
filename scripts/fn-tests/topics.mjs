import assert from 'node:assert/strict';
const UID = '11111111-2222-3333-4444-555555555555';
const HAIKU = 'claude-haiku-5-5', SONNET = 'claude-sonnet-5-5';
const PRICE = { [HAIKU]: [0.1, 0.5], [SONNET]: [2, 10] };
const db = {
  rows: {}, rpc: [], log: [],
  exams: { k1: { id: 'k1', title: 'Klausur Deutsch', subject_id: 'de' }, k2: { id: 'k2', title: 'Klausur Englisch', subject_id: 'en' } },
  subjects: { de: { name: 'Deutsch', language: 'de' }, en: { name: 'Englisch', language: 'en' } },
  notes: [
    { id: 'n1', title: 'Gedichtanalyse Romantik', lesson_date: '2026-09-20', summary: { thema: 'Romantik', kernaussagen: ['Sehnsucht nach dem Unendlichen'], begriffe: ['blaue Blume'], formeln: [], offene_fragen: ['Aufgabe 3 offen'] } },
    { id: 'n2', title: 'Erörterung: Aufbau', lesson_date: '2026-09-10', summary: { thema: 'Erörterung', kernaussagen: ['These, Argument, Beleg'], begriffe: [], formeln: [], offene_fragen: [] } },
    { id: 'n3', title: 'Nur Titel', lesson_date: '2026-09-15', summary: null },
    { id: 'n4', title: 'Nicht gewählt', lesson_date: '2026-09-01', summary: { thema: 'Geheim', kernaussagen: ['nicht dabei'] } },
  ],
};
const setRow = (model, input_tokens, output_tokens, requests = 0) => { db.rows[model] = { model, requests, input_tokens, output_tokens }; };
const requestsOf = () => Object.values(db.rows).reduce((s, r) => s + r.requests, 0);
globalThis.__cc = (_url, key, opts) => {
  const service = key === 'service';
  const authz = opts?.global?.headers?.Authorization;
  const q = (table) => { const f = {};
    const o = { select: () => o, insert: async (row) => { db.log.push({ table, ...row }); return { error: null } }, eq: (c, v) => { f[c] = v; return o; }, in: (c, v) => { f[c] = v; return o; },
      maybeSingle: async () => {
        if (table === 'accounts') return { data: 'account' in db ? db.account : { status: 'active', is_admin: true, ai_features: [] } }; if (table === 'app_settings') return { data: db.settings ?? { friends_budget_usd: 3, cards_daily_limit: 30 } }; 
        if (table === 'exams') return { data: db.exams[f.id] ?? null };
        if (table === 'subjects') return { data: db.subjects[f.id] ?? null };
        return { data: null };
      },
      then: (res) => {
        if (table === 'accounts') return Promise.resolve({ data: [{ user_id: 'admin-id' }] }).then(res); 
        if (table === 'lesson_notes') return Promise.resolve({ data: db.notes.filter((n) => (f.id ?? []).includes(n.id)) }).then(res);
        if (table === 'ai_usage') return Promise.resolve({ data: Object.values(db.rows).map((r) => ({ ...r })) }).then(res);
        return Promise.resolve({ data: [] }).then(res);
      } };
    return o; };
  return {
    auth: { getUser: async () => ({ data: { user: authz === 'Bearer good' ? { id: UID } : null } }) },
    from: q,
    rpc: async (name, args) => {
      if (name === 'ai_begin') { db.locks = (db.locks ?? 0) + 1; return { data: !db.busy }; } if (name === 'ai_end') { db.unlocks = (db.unlocks ?? 0) + 1; return { data: null }; } 
      assert.equal(service, true, 'ai_usage_add nur mit Service-Schlüssel'); assert.equal(name, 'ai_usage_add'); assert.ok(args.p_model);
      db.rpc.push(args);
      const r = db.rows[args.p_model] ?? (db.rows[args.p_model] = { model: args.p_model, requests: 0, input_tokens: 0, output_tokens: 0 });
      r.requests++; r.input_tokens += args.p_input; r.output_tokens += args.p_output; return { error: null };
    },
  };
};
const env = { ANTHROPIC_API_KEY: 'sk-test', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
let handler; globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
await import(process.env.FN_COPY);
const { TOPICS_SCHEMA } = await import(new URL('../_shared/topics.ts', 'file://' + process.env.FN_COPY));

const calls = []; let script = [];
const reply = (text, { stop = 'end_turn', usage = { input_tokens: 900, output_tokens: 200 } } = {}) => ({ status: 200, body: { content: [{ type: 'text', text }], stop_reason: stop, usage } });
const err = (status, type, message, headers = {}) => ({ status, body: { type: 'error', error: { type, message } }, headers });
globalThis.fetch = async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body) });
  const r = script.shift(); assert.ok(r, 'unerwarteter Anthropic-Aufruf');
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json', ...(r.headers ?? {}) } });
};
const topicsJson = (o = {}) => JSON.stringify({ themen: [{ titel: 'Erörterung und Argumentation', quellen: [1] }, { titel: 'Gedichte der Romantik', quellen: [2, 3, 9] }, { titel: 'Schon da', quellen: [1] }, { titel: 'Gedichte der Romantik.', quellen: [2] }], ...o });
const call = async (body, authz = 'Bearer good') => { const r = await handler(new Request('http://x', { method: 'POST', headers: { Authorization: authz }, body: JSON.stringify(body) })); return [r.status, await r.json()]; };
const reset = (s = []) => { calls.length = 0; db.rpc.length = 0; db.log.length = 0; db.rows = {}; script = s; };
const body = { examId: 'k1', noteIds: ['n1', 'n2', 'n3'], existing: ['schon da'] };
let n = 0; const ok = (name) => console.log(`✓ ${++n}. ${name}`);
let st, b;

reset([reply(topicsJson())]); [st, b] = await call(body);
assert.equal(st, 200);
const req = calls[0].body;
assert.equal(req.model, HAIKU); assert.equal(req.max_tokens, 1500); assert.deepEqual(req.output_config, { effort: 'medium', format: { type: 'json_schema', schema: TOPICS_SCHEMA } }); // strukturierte Ausgabe
for (const k of ['thinking', 'temperature', 'top_p', 'top_k']) assert.ok(!(k in req), `kein ${k}`);
assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
assert.deepEqual(db.rpc.map((r) => [r.p_model, r.p_input, r.p_output]), [[HAIKU, 900, 200]]);
ok('Haiku (medium), max_tokens 1500, kein thinking/temperature/top_p/top_k, Verbrauch gezählt');

assert.deepEqual(b.topics, [{ title: 'Erörterung und Argumentation', sources: [1] }, { title: 'Gedichte der Romantik', sources: [2, 3] }]);
assert.deepEqual(b.notes.map((x) => x.id), ['n2', 'n3', 'n1']); assert.equal(b.model, HAIKU); assert.equal(b.budget.budgetUsd, 5);
ok('Antwort: Dopplungen und vorhandene Themen entfernt, ungültige Quellen verworfen, Notizen in Unterrichtsreihenfolge');

assert.ok(req.system.includes('Klausur "Klausur Deutsch" im Fach Deutsch') && req.system.includes('6 bis 12 Themen'));
assert.ok(req.system.indexOf('1. Erörterung: Aufbau (2026-09-10)') >= 0 && req.system.indexOf('2. Nur Titel') > req.system.indexOf('1. Erörterung') && req.system.indexOf('3. Gedichtanalyse Romantik') > req.system.indexOf('2. Nur Titel'));
assert.ok(req.system.includes('Sehnsucht nach dem Unendlichen') && req.system.includes('blaue Blume') && !req.system.includes('nicht dabei') && !req.system.includes('Aufgabe 3 offen'));
assert.ok(req.system.includes('- schon da'));
ok('Prompt: Klausur und Fach, nur die gewählten Notizen nummeriert und älteste zuerst, vorhandene Themen');

const l = db.log[0];
assert.deepEqual([l.table, l.kind, l.task, l.model, l.effort, l.status, l.note_id], ['ai_log', 'topics', 'text', HAIKU, 'medium', 'ok', 'k1']);
assert.ok(Math.abs(l.cost_usd - (900 * 0.1 + 200 * 0.5) / 1e6) < 1e-12); assert.ok(!JSON.stringify(l).includes('Romantik'));
ok('Protokoll: Art topics mit Modell und Kosten (Bruchteil eines Cents), ohne Inhalte');

reset([reply(topicsJson())]); await call({ examId: 'k2', noteIds: ['n1'] });
assert.ok(calls[0].body.system.includes('auf Englisch unterrichtet')); ok('Fach mit Unterrichtssprache Englisch: Themen auf Englisch');

reset([reply(topicsJson())]); await call({ ...body, noteIds: ['n1', 'n1', 'fremd'] });
assert.ok(calls[0].body.system.includes('1. Gedichtanalyse Romantik') && !calls[0].body.system.includes('2. '));
ok('unbekannte Notiz-Ids werden ignoriert');

// --- Kosten ---
reset([reply(topicsJson())]); setRow(SONNET, 2_000_000, 99_000, 5); [st, b] = await call(body); assert.equal(st, 200); ok('Budget: Haiku passt auch bei fast leerem Budget noch hinein');
reset([reply(topicsJson())]); setRow(SONNET, 2_000_000, 100_000, 5); [st, b] = await call(body); assert.equal(st, 429); assert.equal(b.error, 'budget_reached'); assert.equal(calls.length, 0); assert.equal(db.log[0].status, 'budget_reached');
ok('Budget aufgebraucht: nichts an Claude, im Protokoll');
reset([reply(topicsJson())]); setRow(HAIKU, 1000, 100, 500); [st, b] = await call(body); assert.equal(b.error, 'cap_reached'); ok('Monatslimit der Anfragen');

// --- Fehler ---
reset([reply('Das ist kein JSON')]); [st, b] = await call(body); assert.equal(st, 502); assert.equal(b.error, 'invalid_json'); assert.equal(requestsOf(), 1); assert.equal(db.log[0].status, 'invalid_json'); ok('ungültiges JSON: deutsche Meldung, Verbrauch trotzdem gezählt, im Protokoll');
reset([reply('{"themen": []}')]); [st, b] = await call(body); assert.equal(st, 200); assert.deepEqual(b.topics, []); ok('keine Themen übrig ist keine Störung (leere Liste)');
reset([reply('{"themen": [', { stop: 'max_tokens' })]); [st, b] = await call(body); assert.equal(b.error, 'truncated'); ok('abgeschnitten: deutsche Meldung');
reset([err(402, 'billing_error', 'Billing problem')]); [st, b] = await call(body); assert.equal(b.error, 'billing'); ok('Guthaben leer');
reset([err(429, 'rate_limit_error', 'x', { 'retry-after': '0' }), reply(topicsJson())]); [st, b] = await call(body); assert.equal(st, 200); assert.equal(calls.length, 2); ok('429: einmal wiederholt');
reset([err(529, 'overloaded_error', 'busy')]); [st, b] = await call(body); assert.equal(b.error, 'unavailable'); ok('überlastet (529): deutsche Meldung');

reset();
[st, b] = await call(body, 'Bearer schlecht'); assert.equal(st, 401);
[st, b] = await call({ ...body, examId: 'fremd' }); assert.equal(st, 404);
[st, b] = await call({ ...body, noteIds: [] }); assert.equal(st, 400);
[st, b] = await call({ ...body, noteIds: 'n1' }); assert.equal(st, 400);
[st, b] = await call({ ...body, examId: '' }); assert.equal(st, 400);
[st, b] = await call({ ...body, noteIds: ['fremd'] }); assert.equal(st, 400);
assert.equal(calls.length, 0);
ok('Anmeldung, fremde Klausur, keine oder nur fremde Notizen: abgelehnt, nichts an Claude');
env.ANTHROPIC_API_KEY = ''; reset(); [st, b] = await call(body); assert.equal(st, 500); assert.equal(b.error, 'not_configured'); env.ANTHROPIC_API_KEY = 'sk-test';
ok('ohne ANTHROPIC_API_KEY: deutsche Meldung');

// --- Freigabe, Topf der Freunde, eine Anfrage zur Zeit ---
const friend = { status: 'active', is_admin: false, ai_features: ['topics'] };
for (const row of [{ status: 'pending', is_admin: false, ai_features: ['topics'] }, { status: 'blocked', is_admin: false, ai_features: ['topics'] }, { status: 'active', is_admin: false, ai_features: ['cards'] }, null]) {
  reset([reply(topicsJson())]); db.account = row; db.locks = 0;
  [st, b] = await call(body); assert.equal(st, 403); assert.equal(b.error, 'not_allowed'); assert.equal(calls.length, 0); assert.equal(db.locks, 0);
}
ok('wartend, gesperrt, Funktion nicht freigeschaltet oder ohne Eintrag: 403, nichts an Claude');

reset([reply(topicsJson())]); db.account = friend;
db.rows = { a: { user_id: 'admin-id', model: SONNET, requests: 5, input_tokens: 2_000_000, output_tokens: 100_000 } }; // 5 $ des Admins zählen nicht
[st, b] = await call(body); assert.equal(st, 200); assert.equal(b.budget.budgetUsd, 3);
ok('Freund: eigener Topf (3 $), der Verbrauch des Admins zählt nicht mit');
reset([reply(topicsJson())]); db.account = friend;
db.rows = { a: { user_id: 'freund-2', model: SONNET, requests: 5, input_tokens: 1_000_000, output_tokens: 100_000 } }; // 3 $ eines anderen Freundes
[st, b] = await call(body); assert.equal(st, 429); assert.equal(b.error, 'budget_reached'); assert.equal(calls.length, 0);
ok('Freund: der gemeinsame Topf ist voll, auch wenn ein anderer Freund ihn verbraucht hat');
reset([reply(topicsJson())]); db.account = friend; db.settings = { friends_budget_usd: 10, cards_daily_limit: 30 };
db.rows = { a: { user_id: 'freund-2', model: SONNET, requests: 5, input_tokens: 1_000_000, output_tokens: 100_000 } };
[st, b] = await call(body); assert.equal(st, 200); assert.equal(b.budget.budgetUsd, 10); db.settings = null;
ok('Freund: Betrag des Topfs kommt aus den Einstellungen');
reset([reply(topicsJson())]); db.account = friend; db.rows = { a: { user_id: 'freund-2', model: HAIKU, requests: 300, input_tokens: 10, output_tokens: 10 } };
[st, b] = await call(body); assert.equal(b.error, 'cap_reached'); assert.ok(!b.message.includes('500'));
ok('Freund: Anfragegrenze des Topfs (300), ohne Zahl im Text');

reset([reply(topicsJson())]); delete db.account; db.busy = true; db.locks = 0; db.unlocks = 0;
[st, b] = await call(body); assert.equal(st, 409); assert.equal(b.error, 'busy'); assert.equal(calls.length, 0); db.busy = false;
ok('läuft schon eine KI-Anfrage dieses Kontos: 409, nichts an Claude');
reset([reply(topicsJson())]); db.locks = 0; db.unlocks = 0; [st] = await call(body); assert.equal(st, 200); assert.deepEqual([db.locks, db.unlocks], [1, 1]);
reset([reply('kein json')]); db.locks = 0; db.unlocks = 0; [st] = await call(body); assert.equal(st, 502); assert.deepEqual([db.locks, db.unlocks], [1, 1]);
reset([err(529, 'overloaded_error', 'x')]); db.locks = 0; db.unlocks = 0; [st] = await call(body); assert.deepEqual([db.locks, db.unlocks], [1, 1]);
reset([]); db.locks = 0; db.unlocks = 0; [st] = await call({ ...body, examId: 'fremd' }); assert.equal(st, 404); assert.deepEqual([db.locks, db.unlocks], [1, 1]);
ok('die Sperre wird nach Erfolg und nach jedem Fehler wieder gelöst');
