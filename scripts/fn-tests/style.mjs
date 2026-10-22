import assert from 'node:assert/strict';
const UID = '11111111-2222-3333-4444-555555555555';
const HAIKU = 'claude-haiku-5-5', SONNET = 'claude-sonnet-5-5';
const P1 = `${UID}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg`;
const P2 = `${UID}/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg`;
const FREMD = `99999999-9999-9999-9999-999999999999/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg`;
const db = {
  rows: {}, rpc: [], log: [], removed: [],
  subjects: { de: { name: 'Deutsch', language: 'de' }, en: { name: 'Englisch', language: 'en' } },
};
const setRow = (model, input_tokens, output_tokens, requests = 0) => { db.rows[model] = { model, requests, input_tokens, output_tokens }; };
const requestsOf = () => Object.values(db.rows).reduce((s, r) => s + r.requests, 0);
globalThis.__cc = (_url, key, opts) => {
  const service = key === 'service';
  const authz = opts?.global?.headers?.Authorization;
  const q = (table) => { const f = {};
    const o = { select: () => o, insert: async (row) => { db.log.push({ table, ...row }); return { error: null } }, eq: (c, v) => { f[c] = v; return o; },
      maybeSingle: async () => { if (table === 'accounts') return { data: 'account' in db ? db.account : { status: 'active', is_admin: true, ai_features: [] } }; if (table === 'app_settings') return { data: db.settings ?? { friends_budget_usd: 3, cards_daily_limit: 30 } }; return table === 'subjects' ? { data: db.subjects[f.id] ?? null } : { data: null }; },
      then: (res) => (table === 'accounts' ? Promise.resolve({ data: [{ user_id: 'admin-id' }] }) : table === 'ai_usage' ? Promise.resolve({ data: Object.values(db.rows).map((r) => ({ ...r })) }) : Promise.resolve({ data: [] })).then(res) };
    return o; };
  return {
    auth: { getUser: async () => ({ data: { user: authz === 'Bearer good' ? { id: UID } : null } }) },
    from: q,
    storage: { from: (bucket) => ({
      download: async (p) => bucket === 'exams' && [P1, P2].includes(p) ? { data: new Blob([new Uint8Array([255, 216, 255, 1])]), error: null } : { data: null, error: { message: 'nf' } },
      remove: async (paths) => { assert.equal(bucket, 'exams'); assert.equal(service, false, 'die Bilder löscht die Function mit dem Token des Nutzers'); db.removed.push(...paths); return { error: null }; },
    }) },
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
const { STYLE_SCHEMA } = await import(new URL('../_shared/taskStyle.ts', 'file://' + process.env.FN_COPY));

const calls = []; let script = [];
const reply = (text, { stop = 'end_turn', usage = { input_tokens: 1500, output_tokens: 300 } } = {}) => ({ status: 200, body: { content: [{ type: 'text', text }], stop_reason: stop, usage } });
const err = (status, type, message, headers = {}) => ({ status, body: { type: 'error', error: { type, message } }, headers });
globalThis.fetch = async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body) });
  const r = script.shift(); assert.ok(r, 'unerwarteter Anthropic-Aufruf');
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json', ...(r.headers ?? {}) } });
};
const styleJson = (o = {}) => JSON.stringify({ zusammenfassung: ' Knapp  und streng. ', aufbau: ['Drei Aufgaben', ''], formulierungen: ['Analysiere M1.'], operatoren: ['analysieren'], materialien: [], bewertung: [], besonderheiten: [], ...o });
const call = async (body, authz = 'Bearer good') => { const r = await handler(new Request('http://x', { method: 'POST', headers: { Authorization: authz }, body: JSON.stringify(body) })); return [r.status, await r.json()]; };
const reset = (s = []) => { calls.length = 0; db.rpc.length = 0; db.log.length = 0; db.removed.length = 0; db.rows = {}; script = s; };
const body = { subjectId: 'de', teacher: 'Müller', pages: [{ type: 'image', path: P1 }, { type: 'text', text: 'Aufgabe 1: Analysiere den Text.' }] };
let n = 0; const ok = (name) => console.log(`✓ ${++n}. ${name}`);
let st, b;

reset([reply(styleJson())]); [st, b] = await call(body);
assert.equal(st, 200);
const req = calls[0].body;
assert.equal(req.model, HAIKU); assert.equal(req.max_tokens, 1800); assert.deepEqual(req.output_config, { effort: 'medium', format: { type: 'json_schema', schema: STYLE_SCHEMA } }); // strukturierte Ausgabe
for (const k of ['thinking', 'temperature', 'top_p', 'top_k']) assert.ok(!(k in req), `kein ${k}`);
assert.deepEqual(db.rpc.map((r) => [r.p_model, r.p_input, r.p_output]), [[HAIKU, 1500, 300]]);
ok('Haiku (medium), max_tokens 1800, kein thinking/temperature/top_p/top_k, Verbrauch gezählt');

assert.deepEqual(b.style, { zusammenfassung: 'Knapp und streng.', aufbau: ['Drei Aufgaben'], formulierungen: ['Analysiere M1.'], operatoren: ['analysieren'], materialien: [], bewertung: [], besonderheiten: [] });
assert.equal(b.model, HAIKU); assert.equal(b.budget.budgetUsd, 5);
ok('Antwort: Stil bereinigt, leere Einträge entfernt');

assert.ok(req.system.includes('im Fach Deutsch, gestellt von der Lehrkraft Müller') && req.system.includes('"formulierungen"'));
const content = req.messages[0].content;
assert.equal(content.filter((c) => c.type === 'image').length, 1); assert.equal(content.find((c) => c.type === 'image').source.media_type, 'image/jpeg');
assert.ok(content.some((c) => c.type === 'text' && c.text.includes('Aufgabe 1: Analysiere den Text.')));
ok('Prompt: Fach und Lehrkraft, Bild als base64-JPEG, Text als Text');

assert.deepEqual(db.removed, [P1]); ok('die hochgeladenen Bilder werden nach dem Lesen gelöscht');

const l = db.log[0];
assert.deepEqual([l.table, l.kind, l.task, l.model, l.effort, l.status, l.note_id], ['ai_log', 'style', 'image', HAIKU, 'medium', 'ok', 'de']);
assert.ok(Math.abs(l.cost_usd - (1500 * 0.1 + 300 * 0.5) / 1e6) < 1e-12); assert.ok(!JSON.stringify(l).includes('Analysiere'));
ok('Protokoll: Art style, Bild-Modell, Kosten, ohne Inhalte');

reset([reply(styleJson())]); await call({ subjectId: 'en', pages: [{ type: 'text', text: 'Task 1' }] });
assert.equal(calls[0].body.model, HAIKU); assert.ok(calls[0].body.system.includes('auf Englisch unterrichtet')); assert.equal(db.log[0].task, 'text'); assert.deepEqual(db.removed, []);
ok('nur Text: Text-Modell, Unterrichtssprache des Fachs, nichts zu löschen');

// --- Kosten ---
reset([reply(styleJson())]); setRow(SONNET, 2_000_000, 99_000, 5); [st] = await call(body); assert.equal(st, 200); ok('Budget: Haiku passt auch bei fast leerem Budget noch hinein');
reset([reply(styleJson())]); setRow(SONNET, 2_000_000, 100_000, 5); [st, b] = await call(body); assert.equal(st, 429); assert.equal(b.error, 'budget_reached'); assert.equal(calls.length, 0); assert.equal(db.log[0].status, 'budget_reached'); assert.deepEqual(db.removed, [P1]);
ok('Budget aufgebraucht: nichts an Claude, im Protokoll, Bilder trotzdem gelöscht');
reset([reply(styleJson())]); setRow(HAIKU, 1000, 100, 500); [st, b] = await call(body); assert.equal(b.error, 'cap_reached'); ok('Monatslimit der Anfragen');

// --- Fehler ---
reset([reply('Das ist kein JSON')]); [st, b] = await call(body); assert.equal(st, 502); assert.equal(b.error, 'invalid_json'); assert.equal(requestsOf(), 1); assert.equal(db.log[0].status, 'invalid_json'); assert.deepEqual(db.removed, [P1]);
ok('ungültiges JSON: deutsche Meldung, Verbrauch gezählt, Bilder gelöscht');
reset([reply('{"aufbau": []}')]); [st, b] = await call(body); assert.equal(b.error, 'invalid_json'); ok('leerer Stil zählt als nicht lesbar');
reset([reply('{"aufbau": [', { stop: 'max_tokens' })]); [st, b] = await call(body); assert.equal(b.error, 'truncated'); ok('abgeschnitten: deutsche Meldung');
reset([err(402, 'billing_error', 'Billing problem')]); [st, b] = await call(body); assert.equal(b.error, 'billing'); ok('Guthaben leer');
reset([err(429, 'rate_limit_error', 'x', { 'retry-after': '0' }), reply(styleJson())]); [st, b] = await call(body); assert.equal(st, 200); assert.equal(calls.length, 2); ok('429: einmal wiederholt');
reset([err(529, 'overloaded_error', 'busy')]); [st, b] = await call(body); assert.equal(b.error, 'unavailable'); assert.deepEqual(db.removed, [P1]); ok('überlastet (529): deutsche Meldung, Bilder gelöscht');

// --- Eingaben ---
reset();
[st] = await call(body, 'Bearer schlecht'); assert.equal(st, 401);
[st] = await call({ ...body, subjectId: 'fremd' }); assert.equal(st, 404);
[st] = await call({ ...body, subjectId: '' }); assert.equal(st, 400);
[st] = await call({ ...body, pages: [] }); assert.equal(st, 400);
[st] = await call({ ...body, pages: 'x' }); assert.equal(st, 400);
[st] = await call({ ...body, pages: Array.from({ length: 9 }, () => ({ type: 'text', text: 'x' })) }); assert.equal(st, 400);
[st] = await call({ ...body, pages: [{ type: 'image', path: FREMD }] }); assert.equal(st, 400);
[st] = await call({ ...body, pages: [{ type: 'image', path: '../../x.jpg' }] }); assert.equal(st, 400);
[st] = await call({ ...body, pages: [{ type: 'pdf', path: P1 }] }); assert.equal(st, 400);
[st] = await call({ ...body, pages: [{ type: 'image', path: `${UID}/dddddddd-dddd-dddd-dddd-dddddddddddd.jpg` }] }); assert.equal(st, 404);
assert.equal(calls.length, 0);
ok('Anmeldung, fremdes Fach, falsche, fremde oder fehlende Seiten, zu viele Seiten: abgelehnt, nichts an Claude');
[st] = await call({ ...body, pages: [{ type: 'text', text: 'x'.repeat(20_001) }, { type: 'text', text: 'y'.repeat(20_000) }, { type: 'text', text: 'z'.repeat(20_000) }, { type: 'text', text: 'w'.repeat(20_000) }] }); assert.equal(st, 400);
ok('Text insgesamt zu lang: abgelehnt');
env.ANTHROPIC_API_KEY = ''; reset(); [st, b] = await call(body); assert.equal(st, 500); assert.equal(b.error, 'not_configured'); env.ANTHROPIC_API_KEY = 'sk-test';
ok('ohne ANTHROPIC_API_KEY: deutsche Meldung');
