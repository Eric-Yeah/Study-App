import assert from 'node:assert/strict';
const UID = '11111111-2222-3333-4444-555555555555';
const GOOD = `${UID}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg`;
// Bilder mit echtem JPEG-Kopf (Maße lesbar): A4 bei 1600 px und ein riesiges Bild
const jpeg = (w, h) => new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
const A4 = `${UID}/aaaaaaaa-bbbb-cccc-dddd-a4a4a4a4a4a4.jpg`, HUGE = `${UID}/aaaaaaaa-bbbb-cccc-dddd-888888888888.jpg`;
const BYTES = { [A4]: jpeg(1131, 1600), [HUGE]: jpeg(8000, 8000) };
const OTHER = `99999999-2222-3333-4444-555555555555/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg`;
const HAIKU = 'claude-haiku-5-5', SONNET = 'claude-sonnet-5-5';
const PRICE = { [HAIKU]: [0.1, 0.5], [SONNET]: [2, 10] };
const db = { rows: {}, rpc: [], log: [], linked: new Set([GOOD, A4, HUGE]), notes: new Set(['note1', 'note-en', 'note-bili']), files: new Set([GOOD, A4, HUGE]) };
const spentOf = () => Object.entries(db.rows).reduce((s, [m, r]) => s + (r.input_tokens * PRICE[m][0] + r.output_tokens * PRICE[m][1]) / 1e6, 0);
const requestsOf = () => Object.values(db.rows).reduce((s, r) => s + r.requests, 0);
const setRow = (model, input_tokens, output_tokens, requests = 0) => { db.rows[model] = { model, requests, input_tokens, output_tokens }; };
globalThis.__cc = (_url, key, opts) => {
  const service = key === 'service';
  const authz = opts?.global?.headers?.Authorization;
  const q = (table) => { const f = {};
    const o = { select: () => o, insert: async (row) => { db.log.push({ table, ...row }); return { error: null } }, eq: (c, v) => { f[c] = v; return o; }, in: (c, v) => { f[c] = v; return o; },
      maybeSingle: async () => {
        if (table === 'accounts') return { data: 'account' in db ? db.account : { status: 'active', is_admin: true, ai_features: [] } }; if (table === 'app_settings') return { data: db.settings ?? { friends_budget_usd: 3, cards_daily_limit: 30 } }; 
        if (table === 'lesson_notes') return { data: db.notes.has(f.id) ? { id: f.id, subject_id: f.id === 'note-en' ? 'sub-en' : f.id === 'note-bili' ? 'sub-bili' : null } : null };
        if (table === 'subjects') return { data: { language: f.id === 'sub-en' ? 'en' : f.id === 'sub-bili' ? 'la' : 'de' } };
        return { data: null };
      },
      then: (res) => {
        if (table === 'accounts') return Promise.resolve({ data: [{ user_id: 'admin-id' }] }).then(res); 
        if (table === 'worksheet_files') return Promise.resolve({ data: (f.storage_path ?? []).filter((p) => db.linked.has(p)).map((p) => ({ storage_path: p })) }).then(res);
        if (table === 'ai_usage') return Promise.resolve({ data: Object.values(db.rows).map((r) => ({ ...r })) }).then(res);
        return Promise.resolve({ data: [] }).then(res);
      } };
    return o; };
  return {
    auth: { getUser: async () => ({ data: { user: authz === 'Bearer good' ? { id: UID } : null } }) },
    from: q,
    storage: { from: () => ({ download: async (p) => db.files.has(p) ? { data: new Blob([BYTES[p] ?? new Uint8Array([255, 216, 255, 1, 2, 3])]), error: null } : { data: null, error: { message: 'nf' } } }) },
    rpc: async (name, args) => {
      if (name === 'ai_begin') { db.locks = (db.locks ?? 0) + 1; return { data: !db.busy }; } if (name === 'ai_end') { db.unlocks = (db.unlocks ?? 0) + 1; return { data: null }; } 
      assert.equal(service, true, 'ai_usage_add nur mit Service-Schlüssel'); assert.equal(name, 'ai_usage_add'); assert.ok(args.p_model, 'Modell wird mitgezählt');
      db.rpc.push(args);
      const r = db.rows[args.p_model] ?? (db.rows[args.p_model] = { model: args.p_model, requests: 0, input_tokens: 0, output_tokens: 0 });
      r.requests++; r.input_tokens += args.p_input; r.output_tokens += args.p_output; return { error: null };
    },
  };
};
const env = { ANTHROPIC_API_KEY: 'sk-test', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
let handler; globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
await import(process.env.FN_COPY);
// Dieselbe Konfiguration wie in der Function (gleiche Moduldatei), damit der Test die Eskalation ein- und ausschalten kann
const { CONFIG } = await import(new URL('../_shared/config.ts', 'file://' + process.env.FN_COPY));
// Strukturierte Ausgabe: Effort und JSON-Schema stehen zusammen in output_config
const { SUMMARY_SCHEMA } = await import(new URL('../_shared/worksheets.ts', 'file://' + process.env.FN_COPY));
const oc = (effort) => ({ effort, format: { type: 'json_schema', schema: SUMMARY_SCHEMA } });

const anthropicCalls = []; let script = [];
const reply = (text, { stop = 'end_turn', usage = { input_tokens: 100, output_tokens: 50 } } = {}) => ({ status: 200, body: { content: [{ type: 'text', text }], stop_reason: stop, usage } });
const err = (status, type, message, headers = {}) => ({ status, body: { type: 'error', error: { type, message } }, headers });
globalThis.fetch = async (url, init) => {
  anthropicCalls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
  const r = script.shift(); assert.ok(r, 'unerwarteter Anthropic-Aufruf');
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json', ...(r.headers ?? {}) } });
};
const good = (o = {}) => JSON.stringify({ thema: 'Optik', kernaussagen: ['Licht ist eine Welle'], begriffe: ['Brechung'], formeln: [], offene_fragen: [], lesbarkeit: 'sicher', ...o });
const call = async (body, authz = 'Bearer good') => { const r = await handler(new Request('http://x', { method: 'POST', headers: { Authorization: authz }, body: JSON.stringify(body) })); return [r.status, await r.json()]; };
const reset = (s = []) => { anthropicCalls.length = 0; db.rpc.length = 0; db.log.length = 0; db.rows = {}; script = s; };
const text = { type: 'text', text: 'Hallo Welt' }, img = { type: 'image', path: GOOD };
let n = 0; const ok = (name) => console.log(`✓ ${++n}. ${name}`);
let st, b;

// --- Modelle je Aufgabe ---
reset([reply(good())]); [st, b] = await call({ lessonNoteId: 'note1', pages: [text] });
assert.equal(st, 200); assert.equal(b.effort, 'medium'); assert.equal(b.model, HAIKU); assert.equal(b.retried, false);
const body1 = anthropicCalls[0].body;
assert.equal(body1.model, HAIKU); assert.equal(body1.max_tokens, 2000); assert.deepEqual(body1.output_config, oc('medium'));
for (const k of ['thinking', 'temperature', 'top_p', 'top_k']) assert.ok(!(k in body1), `kein ${k}`);
assert.equal(anthropicCalls[0].url, 'https://api.anthropic.com/v1/messages'); assert.equal(anthropicCalls[0].headers['x-api-key'], 'sk-test');
assert.deepEqual(db.rpc, [{ p_user: UID, p_month: new Date().toISOString().slice(0, 7), p_model: HAIKU, p_input: 100, p_output: 50 }]);
ok('nur Text: Haiku, Effort medium, kein thinking/temperature/top_p/top_k, Verbrauch mit Modell gezählt');

reset([reply(good())]); [st, b] = await call({ lessonNoteId: 'note1', pages: [text, img] });
assert.equal(b.effort, 'medium'); assert.equal(b.model, HAIKU); assert.deepEqual(anthropicCalls[0].body.output_config, oc('medium'));
const imgBlock = anthropicCalls[0].body.messages[0].content.find((c) => c.type === 'image');
assert.equal(imgBlock.source.type, 'base64'); assert.equal(imgBlock.source.media_type, 'image/jpeg'); assert.equal(imgBlock.source.data, Buffer.from([255, 216, 255, 1, 2, 3]).toString('base64'));
ok('mit Bild: Haiku, Effort medium, Bild als base64 JPEG');

// Standard: keine automatische Wiederholung mit Sonnet (spart Kosten), die Notiz bleibt "unsicher" und "Genauer lesen" gibt es auf Wunsch
assert.equal(CONFIG.ai.autoEscalate, false);
for (const [label, pages] of [['Text', [text]], ['Bild', [img]]]) {
  reset([reply(good({ lesbarkeit: 'unsicher' }))]); [st, b] = await call({ lessonNoteId: 'note1', pages });
  assert.equal(anthropicCalls.length, 1); assert.equal(anthropicCalls[0].body.model, HAIKU); assert.equal(b.retried, false); assert.equal(b.summary.lesbarkeit, 'unsicher');
  ok(`unsicher bei ${label}: standardmäßig keine automatische Wiederholung mit Sonnet`);
}

CONFIG.ai.autoEscalate = true;
for (const [label, pages] of [['Text', [text]], ['Bild', [img]]]) {
  reset([reply(good({ lesbarkeit: 'unsicher' }), { usage: { input_tokens: 1000, output_tokens: 200 } }), reply(good({ thema: 'Genauer' }), { usage: { input_tokens: 1000, output_tokens: 300 } })]);
  [st, b] = await call({ lessonNoteId: 'note1', pages });
  assert.equal(anthropicCalls.length, 2); assert.equal(anthropicCalls[0].body.model, HAIKU);
  assert.equal(anthropicCalls[1].body.model, SONNET); assert.deepEqual(anthropicCalls[1].body.output_config, oc('medium'));
  assert.equal(b.retried, true); assert.equal(b.model, SONNET); assert.equal(b.summary.thema, 'Genauer');
  assert.equal(db.rows[HAIKU].requests, 1); assert.equal(db.rows[SONNET].requests, 1); assert.equal(db.rows[SONNET].output_tokens, 300);
  ok(`unsicher bei ${label}: mit autoEscalate einmal mit Sonnet (medium), Verbrauch je Modell getrennt gezählt`);
}

reset([reply(good({ lesbarkeit: 'unsicher' }))]); [st, b] = await call({ lessonNoteId: 'note1', pages: [img], forceEffort: 'high' });
assert.equal(anthropicCalls.length, 1); assert.equal(anthropicCalls[0].body.model, SONNET); assert.deepEqual(anthropicCalls[0].body.output_config, oc('high')); assert.equal(b.retried, false);
ok('"Genauer lesen": gleich Sonnet mit high, keine weitere Wiederholung bei unsicher');
reset([reply(good())]); await call({ lessonNoteId: 'note1', pages: [text], forceEffort: 'medium' }); assert.equal(anthropicCalls[0].body.model, SONNET);
for (const bad of ['max', 'low', 'xhigh; drop table', 42]) { reset([reply(good())]); await call({ lessonNoteId: 'note1', pages: [text], forceEffort: bad }); assert.equal(anthropicCalls[0].body.model, HAIKU, String(bad)); assert.equal(anthropicCalls[0].body.output_config.effort, 'medium'); }
ok('forceEffort: nur medium und high gelten, ungültige Werte werden ignoriert');

reset([reply(good({ lesbarkeit: 'unsicher' })), err(429, 'rate_limit_error', 'zu viele', { 'retry-after': '0' }), err(429, 'rate_limit_error', 'zu viele', { 'retry-after': '0' })]);
[st, b] = await call({ lessonNoteId: 'note1', pages: [text] }); assert.equal(st, 200); assert.equal(b.retried, false); assert.equal(b.model, HAIKU); assert.equal(b.summary.lesbarkeit, 'unsicher');
ok('scheitert die Wiederholung mit Sonnet, bleibt das erste Ergebnis von Haiku');

// --- Protokoll (ai_log) ---
reset([reply(good({ lesbarkeit: 'unsicher' }), { usage: { input_tokens: 2000, output_tokens: 100 } }), reply(good(), { usage: { input_tokens: 2000, output_tokens: 300 } })]);
await call({ lessonNoteId: 'note1', pages: [img] });
assert.equal(db.log.length, 2); const [l1, l2] = db.log;
assert.deepEqual([l1.table, l1.kind, l1.task, l1.model, l1.effort, l1.status, l1.input_tokens, l1.output_tokens, l1.note_id], ['ai_log', 'summarize', 'image', HAIKU, 'medium', 'unsicher', 2000, 100, 'note1']);
assert.deepEqual([l2.task, l2.model, l2.status, l2.output_tokens], ['escalation', SONNET, 'ok', 300]);
assert.ok(Math.abs(l1.cost_usd - (2000 * 0.1 + 100 * 0.5) / 1e6) < 1e-12); assert.ok(Math.abs(l2.cost_usd - (2000 * 2 + 300 * 10) / 1e6) < 1e-12);
assert.ok(l1.duration_ms >= 0 && l1.user_id === UID && !JSON.stringify(l1).includes('Hallo') && !JSON.stringify(l1).includes('Licht'));
ok('Protokoll: jede Anfrage mit Aufgabe, Modell, Tokens, Kosten und Status, ohne Inhalte');
reset([reply('Das ist kein JSON', { usage: { input_tokens: 50, output_tokens: 20 } })]); await call({ lessonNoteId: 'note1', pages: [text] });
assert.equal(db.log.length, 1); assert.equal(db.log[0].status, 'invalid_json'); assert.equal(db.log[0].output_tokens, 20); ok('Protokoll: Fehler mit Code und den schon gezählten Tokens');
reset([err(402, 'billing_error', 'Billing problem')]); await call({ lessonNoteId: 'note1', pages: [text] }); assert.equal(db.log[0].status, 'billing'); assert.equal(db.log[0].input_tokens, 0); ok('Protokoll: Guthaben leer wird als billing vermerkt');
reset(); setRow(SONNET, 2_400_000, 20_000, 10); await call({ lessonNoteId: 'note1', pages: [text] }); assert.equal(db.log.length, 1); assert.equal(db.log[0].status, 'budget_reached'); ok('Protokoll: abgelehnt wegen Budget steht auch drin');
const realCc = globalThis.__cc;
globalThis.__cc = (...a) => { const c = realCc(...a); const from = c.from; c.from = (t) => { const b = from(t); if (t === 'ai_log') b.insert = async () => { throw new Error('Log kaputt'); }; return b; }; return c; };
reset([reply(good())]); [st, b] = await call({ lessonNoteId: 'note1', pages: [text] }); assert.equal(st, 200); globalThis.__cc = realCc;
ok('ein Fehler beim Schreiben des Protokolls stört die Zusammenfassung nicht');

CONFIG.ai.autoEscalate = false;

// --- Sprache ---
reset([reply(good())]); await call({ lessonNoteId: 'note-en', pages: [text] }); assert.ok(anthropicCalls[0].body.system.includes('auf Englisch unterrichtet')); ok('Fach mit Unterrichtssprache Englisch: Prompt verlangt Englisch');
reset([reply(good())]); await call({ lessonNoteId: 'note-bili', pages: [text] }); assert.ok(anthropicCalls[0].body.system.includes('Das Fach ist Latein')); ok('Fach mit Latein: Regel für Latein');
reset([reply(good())]); await call({ lessonNoteId: 'note1', pages: [text] }); assert.ok(!anthropicCalls[0].body.system.includes('unterrichtet')); ok('Notiz ohne Fach: Deutsch, keine Sprachregel');

// --- Fehler ---
reset([reply('Das ist kein JSON')]); [st, b] = await call({ lessonNoteId: 'note1', pages: [text] });
assert.equal(st, 502); assert.equal(b.error, 'invalid_json'); assert.equal(requestsOf(), 1); ok('ungültiges JSON: deutsche Meldung, Verbrauch trotzdem gezählt');
reset([reply('{"thema": "abgeschnitten', { stop: 'max_tokens' })]); [st, b] = await call({ lessonNoteId: 'note1', pages: [text] }); assert.equal(st, 502); assert.equal(b.error, 'truncated'); ok('max_tokens erreicht: deutsche Meldung');
reset([err(402, 'billing_error', 'Billing problem')]); [st, b] = await call({ lessonNoteId: 'note1', pages: [text] }); assert.equal(st, 402); assert.equal(b.error, 'billing');
reset([err(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.')]); [st, b] = await call({ lessonNoteId: 'note1', pages: [text] }); assert.equal(b.error, 'billing');
reset([err(400, 'invalid_request_error', 'messages.0.content: etwas anderes')]); [st, b] = await call({ lessonNoteId: 'note1', pages: [text] }); assert.equal(b.error, 'request_failed'); ok('zu wenig Guthaben als 402 und als 400, andere 400 getrennt');
reset([err(429, 'rate_limit_error', 'langsam', { 'retry-after': '0' }), reply(good())]); const t0 = Date.now(); [st, b] = await call({ lessonNoteId: 'note1', pages: [text] });
assert.equal(st, 200); assert.equal(anthropicCalls.length, 2); assert.ok(Date.now() - t0 >= 900); ok('429: einmal mit Wartezeit wiederholt');
reset([err(429, 'rate_limit_error', 'x', { 'retry-after': '0' }), err(429, 'rate_limit_error', 'x', { 'retry-after': '0' })]); [st, b] = await call({ lessonNoteId: 'note1', pages: [text] }); assert.equal(st, 429); assert.equal(b.error, 'rate_limit'); ok('429 zweimal: deutsche Meldung');
reset([err(529, 'overloaded_error', 'busy')]); [st, b] = await call({ lessonNoteId: 'note1', pages: [text] }); assert.equal(b.error, 'unavailable'); ok('überlastet (529): deutsche Meldung');

reset(); setRow(HAIKU, 1000, 100, 300); setRow(SONNET, 1000, 100, 200); [st, b] = await call({ lessonNoteId: 'note1', pages: [text] });
assert.equal(st, 429); assert.equal(b.error, 'cap_reached'); assert.equal(anthropicCalls.length, 0); ok('Monatslimit zählt die Anfragen aller Modelle zusammen');
reset([reply(good({ lesbarkeit: 'unsicher' }))]); setRow(HAIKU, 1000, 100, 499); [st, b] = await call({ lessonNoteId: 'note1', pages: [text] }); assert.equal(st, 200); assert.equal(anthropicCalls.length, 1); assert.equal(b.retried, false); ok('Limit gilt auch für die Wiederholung mit Sonnet');

reset(); [st, b] = await call({ lessonNoteId: 'note1', pages: [text] }, 'Bearer schlecht'); assert.equal(st, 401);
[st, b] = await call({ lessonNoteId: 'fremd', pages: [text] }); assert.equal(st, 404);
[st, b] = await call({ lessonNoteId: 'note1', pages: [{ type: 'image', path: OTHER }] }); assert.equal(st, 400);
[st, b] = await call({ lessonNoteId: 'note1', pages: [{ type: 'image', path: `${UID}/../x.jpg` }] }); assert.equal(st, 400);
[st, b] = await call({ lessonNoteId: 'note1', pages: [{ type: 'image', path: `${UID}/ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee.jpg` }] }); assert.equal(st, 404);
[st, b] = await call({ lessonNoteId: 'note1', pages: [] }); assert.equal(st, 400);
[st, b] = await call({ lessonNoteId: 'note1', pages: Array(11).fill(img) }); assert.equal(st, 400);
[st, b] = await call({ lessonNoteId: 'note1', pages: [{ type: 'pdf' }] }); assert.equal(st, 400);
[st, b] = await call({ pages: [text] }); assert.equal(st, 400);
assert.equal(anthropicCalls.length, 0); ok('Anmeldung, fremde Notiz, fremde und nicht verknüpfte Bilder, ungültige Formen: abgewiesen');

// --- Kostengrenze mit Preisen je Modell ---
const BUDGET = 5;
reset(); setRow(SONNET, 2_400_000, 20_000, 10); // 5,0 $
[st, b] = await call({ lessonNoteId: 'note1', pages: [text] }); assert.equal(st, 429); assert.equal(b.error, 'budget_reached'); assert.equal(anthropicCalls.length, 0);
ok('Budget aufgebraucht (Sonnet-Verbrauch): selbst Haiku wird vorher abgelehnt, nichts geht an Claude');

reset([reply(good())]); setRow(HAIKU, 1_000_000, 100_000, 5); setRow(SONNET, 100_000, 10_000, 3);
[st, b] = await call({ lessonNoteId: 'note1', pages: [text] }); assert.equal(st, 200);
assert.ok(b.budget.spentUsd > 0.45 && b.budget.spentUsd < BUDGET && Math.abs(b.budget.spentUsd - spentOf()) < 1e-9); assert.equal(b.budget.budgetUsd, BUDGET);
ok('Budget frei: Verbrauch aller Modelle zusammen und Budget in der Antwort');

reset([reply(good())]); setRow(SONNET, 2_380_000, 20_000, 10);
[st, b] = await call({ lessonNoteId: 'note1', pages: Array(5).fill(img) }); assert.equal(st, 200, 'Haiku mit 5 Bildern passt noch'); assert.equal(b.model, HAIKU);
reset(); setRow(SONNET, 2_380_000, 20_000, 10);
[st, b] = await call({ lessonNoteId: 'note1', pages: Array(5).fill(img), forceEffort: 'high' }); assert.equal(st, 429); assert.equal(b.error, 'budget_reached'); assert.equal(anthropicCalls.length, 0);
ok('Restbudget: dieselbe Anfrage geht mit Haiku, wird mit Sonnet (Genauer lesen) vorher abgelehnt');

// Bild-Tokens aus den echten Maßen: 5 A4-Seiten (je 41 x 58 Kacheln) passen noch, dieselbe Anfrage mit unlesbaren oder riesigen
// Bildern rechnet mit dem Höchstwert je Bild und wird vorher abgelehnt (Rest 0,06 $, Sonnet high)
reset([reply(good())]); setRow(SONNET, 2_470_000, 0, 10);
[st, b] = await call({ lessonNoteId: 'note1', pages: Array(5).fill({ type: 'image', path: A4 }), forceEffort: 'high' }); assert.equal(st, 200); assert.equal(anthropicCalls.length, 1);
for (const path of [GOOD, HUGE]) {
  reset(); setRow(SONNET, 2_470_000, 0, 10);
  [st, b] = await call({ lessonNoteId: 'note1', pages: Array(5).fill({ type: 'image', path }), forceEffort: 'high' }); assert.equal(st, 429, path); assert.equal(b.error, 'budget_reached'); assert.equal(anthropicCalls.length, 0);
}
ok('Kostengrenze mit Bildmaßen aus dem JPEG-Kopf: A4 genauer, unlesbare und riesige Bilder mit dem Höchstwert (bleibt Obergrenze)');

reset([reply(good({ lesbarkeit: 'unsicher' }), { usage: { input_tokens: 5000, output_tokens: 1000 } }), reply(good())]); setRow(SONNET, 2_000_000, 99_500, 10);
[st, b] = await call({ lessonNoteId: 'note1', pages: [text] });
assert.equal(st, 200); assert.equal(b.retried, false); assert.equal(anthropicCalls.length, 1); assert.equal(b.model, HAIKU); assert.equal(b.summary.lesbarkeit, 'unsicher'); assert.ok(spentOf() <= BUDGET);
ok('Budget reicht für Haiku, nicht für die Wiederholung mit Sonnet: erstes Ergebnis bleibt, nichts wird überzogen');

reset(); globalThis.fetch = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: good() }], stop_reason: 'end_turn', usage: { input_tokens: 34_000, output_tokens: 2_000 } }), { status: 200, headers: { 'content-type': 'application/json' } });
let calls = 0, last = 200;
for (let i = 0; i < 300 && last === 200; i++) { [last, b] = await call({ lessonNoteId: 'note1', pages: Array(10).fill(img), forceEffort: 'high' }); if (last === 200) calls++; }
assert.equal(last, 429); assert.ok(spentOf() <= BUDGET); assert.ok(calls >= 30);
ok(`Dauerlauf Sonnet mit größten Anfragen: ${calls} Anfragen, ${spentOf().toFixed(2)} $ von ${BUDGET} $, danach Sperre`);
reset(); let h = 0; last = 200;
for (let i = 0; i < 300 && last === 200; i++) { [last, b] = await call({ lessonNoteId: 'note1', pages: Array(10).fill(img) }); if (last === 200) h++; }
assert.ok(h > calls * 5); assert.ok(spentOf() <= BUDGET);
ok(`Dauerlauf Haiku: ${h} Anfragen für ${spentOf().toFixed(2)} $ (Sonnet: ${calls})`);
globalThis.fetch = async () => { throw new Error('unerwartet'); };

delete env.ANTHROPIC_API_KEY; [st, b] = await call({ lessonNoteId: 'note1', pages: [text] }); assert.equal(st, 500); assert.equal(b.error, 'not_configured'); ok('ohne API-Schlüssel auf dem Server: klare Meldung');
console.log(`alle ${n} Gruppen bestanden`);
