import assert from 'node:assert/strict';
const UID = '11111111-2222-3333-4444-555555555555';
const P1 = `${UID}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee1.jpg`;
const P2 = `${UID}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee2.jpg`;
const P3 = `${UID}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee3.jpg`;
const OTHER = `99999999-2222-3333-4444-555555555555/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee1.jpg`;
const HAIKU = 'claude-haiku-5-5', SONNET = 'claude-sonnet-5-5';
const PRICE = { [HAIKU]: [0.1, 0.5], [SONNET]: [2, 10] };

const graded = {
  aufgaben: [{ nr: '1', titel: 'Analyse', operator: 'analysieren', afb: 2, max: 20, max_geschaetzt: false, punkte: 14, richtig: [], fehlt: ['Belege'], tipp: '', unsicher: false }],
  teile: { darstellung: 10, richtigkeit: null, ausdruck: null, uebersetzung_fehler: null, uebersetzung_woerter: null },
  sprache: { fehler: null, woerter: null, anteil: null },
  staerken: [], schwaechen: [], naechste_schritte: [], lesbarkeit: 'sicher', erwartung_genutzt: false,
};
const db = {
  rows: {}, rpc: [], log: [],
  reviews: {
    r1: { id: 'r1', subject_id: 'de', teacher: 'Müller', max_points: 60, horizon_text: 'Aufgabe 1: Einleitung mit Basissatz (4 BE)', result: null },
    r2: { id: 'r2', subject_id: 'de', teacher: 'Müller', max_points: null, horizon_text: '', result: { main: { model: SONNET, result: graded } } },
    ren: { id: 'ren', subject_id: 'en', teacher: '', max_points: null, horizon_text: '', result: null },
    rla: { id: 'rla', subject_id: 'la', teacher: '', max_points: null, horizon_text: '', result: null },
  },
  subjects: { de: { name: 'Deutsch', type: 'writing', language: 'de' }, en: { name: 'Englisch', type: 'knowledge', language: 'en' }, la: { name: 'Latein', type: 'knowledge', language: 'la' } },
  rubrics: {
    de: {
      teacher_text: 'Die Einleitung zählt besonders.',
      lessons: [
        { id: 'a', text: 'Erwartet Zeilenangaben bei jedem Zitat.', source: 'ki', teacher: 'Müller', createdAt: '' },
        { id: 'b', text: 'Zieht für Umgangssprache ab.', source: 'ki', teacher: 'Schmidt', createdAt: '' },
        { id: 'c', text: 'Mag kurze Schlüsse.', source: 'eigene', teacher: '', createdAt: '' },
      ],
    },
  },
  linked: { r1: new Set([P1, P2, P3]), r2: new Set([P1]), ren: new Set([P1]), rla: new Set([P1]) },
};
const requestsOf = () => Object.values(db.rows).reduce((s, r) => s + r.requests, 0);
const setRow = (model, input_tokens, output_tokens, requests = 0) => { db.rows[model] = { model, requests, input_tokens, output_tokens }; };
globalThis.__cc = (_url, key, opts) => {
  const service = key === 'service';
  const authz = opts?.global?.headers?.Authorization;
  const q = (table) => { const f = {};
    const o = { select: () => o, insert: async (row) => { db.log.push({ table, ...row }); return { error: null } }, eq: (c, v) => { f[c] = v; return o; }, in: (c, v) => { f[c] = v; return o; },
      maybeSingle: async () => {
        if (table === 'accounts') return { data: 'account' in db ? db.account : { status: 'active', is_admin: true, ai_features: [] } }; if (table === 'app_settings') return { data: db.settings ?? { friends_budget_usd: 3, cards_daily_limit: 30 } }; 
        if (table === 'exam_reviews') return { data: db.reviews[f.id] ?? null };
        if (table === 'subjects') return { data: db.subjects[f.id] ?? null };
        if (table === 'subject_rubrics') return { data: db.rubrics[f.subject_id] ?? null };
        return { data: null };
      },
      then: (res) => {
        if (table === 'accounts') return Promise.resolve({ data: [{ user_id: 'admin-id' }] }).then(res); 
        if (table === 'exam_files') return Promise.resolve({ data: (f.storage_path ?? []).filter((p) => db.linked[f.review_id]?.has(p)).map((p) => ({ storage_path: p })) }).then(res);
        if (table === 'ai_usage') return Promise.resolve({ data: Object.values(db.rows).map((r) => ({ ...r })) }).then(res);
        return Promise.resolve({ data: [] }).then(res);
      } };
    return o; };
  return {
    auth: { getUser: async () => ({ data: { user: authz === 'Bearer good' ? { id: UID } : null } }) },
    from: q,
    storage: { from: (bucket) => ({ download: async (p) => bucket === 'exams' && [P1, P2, P3].includes(p) ? { data: new Blob([new Uint8Array([255, 216, 255, Number(p.at(-5))])]), error: null } : { data: null, error: { message: 'nf' } } }) },
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
// Strukturierte Ausgabe: Effort und JSON-Schema des Modus stehen zusammen in output_config
const { EXAM_RESULT_SCHEMA, LEARN_SCHEMA } = await import(new URL('../_shared/examGrading.ts', 'file://' + process.env.FN_COPY));
const oc = (effort, schema = EXAM_RESULT_SCHEMA) => ({ effort, format: { type: 'json_schema', schema } });

const calls = []; let script = [];
const reply = (text, { stop = 'end_turn', usage = { input_tokens: 5000, output_tokens: 1500 } } = {}) => ({ status: 200, body: { content: [{ type: 'text', text }], stop_reason: stop, usage } });
const err = (status, type, message, headers = {}) => ({ status, body: { type: 'error', error: { type, message } }, headers });
globalThis.fetch = async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body) });
  const r = script.shift(); assert.ok(r, 'unerwarteter Anthropic-Aufruf');
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json', ...(r.headers ?? {}) } });
};
const good = (o = {}) => JSON.stringify({ ...graded, ...o });
const learned = JSON.stringify({ punkte_lehrkraft: 8, aufgaben_lehrkraft: [{ nr: '1', punkte: 11 }], lehren: ['Verlangt eine These in der Einleitung.'] });
const call = async (body, authz = 'Bearer good') => { const r = await handler(new Request('http://x', { method: 'POST', headers: { Authorization: authz }, body: JSON.stringify(body) })); return [r.status, await r.json()]; };
const reset = (s = []) => { calls.length = 0; db.rpc.length = 0; db.log.length = 0; db.rows = {}; script = s; };
const img = (path, role) => ({ type: 'image', path, role });
const grade = { mode: 'grade', reviewId: 'r1', pages: [img(P2, 'loesung'), img(P1, 'aufgabe'), { type: 'text', text: 'Meine Antwort als Text', role: 'loesung' }] };
const texts = (c) => c.body.messages[0].content.filter((x) => x.type === 'text').map((x) => x.text);
let n = 0; const ok = (name) => console.log(`✓ ${++n}. ${name}`);
let st, b;

// --- Korrektur ---
reset([reply(good())]); [st, b] = await call(grade);
assert.equal(st, 200);
const req = calls[0].body;
assert.equal(req.model, SONNET); assert.equal(req.max_tokens, 8000); assert.deepEqual(req.output_config, oc('medium'));
for (const k of ['thinking', 'temperature', 'top_p', 'top_k']) assert.ok(!(k in req), `kein ${k}`);
assert.equal(b.main.model, SONNET); assert.equal(b.main.result.aufgaben[0].punkte, 14); assert.equal(b.compare, null);
assert.deepEqual(db.rpc.map((r) => r.p_model), [SONNET]);
ok('Korrektur mit Sonnet (medium), max_tokens 8000, kein thinking/temperature/top_p/top_k, Verbrauch gezählt');

assert.ok(req.system.includes('Korrekturmuster Deutsch')); assert.ok(req.system.includes('Verstehensleistung'));
assert.ok(req.system.includes('Die Einleitung zählt besonders.'));
assert.ok(req.system.includes('Zeilenangaben bei jedem Zitat') && req.system.includes('Mag kurze Schlüsse') && !req.system.includes('Umgangssprache'));
assert.ok(req.system.includes('Insgesamt sind 60 Punkte erreichbar') && req.system.includes('Erwartungshorizont ist dabei'));
ok('Prompt: Muster des Fachs, Vorgaben der Lehrkraft, nur Erfahrungen zu dieser Lehrkraft und allgemeine, Gesamtpunkte');

const labels = texts(calls[0]).filter((t) => /Seite/.test(t)).map((t) => t.split(' (')[0]);
assert.deepEqual(labels, ['AUFGABE Seite 1', 'ERWARTUNG Seite 1', 'LÖSUNG Seite 1', 'LÖSUNG Seite 2']);
assert.ok(texts(calls[0]).some((t) => t.includes('Einleitung mit Basissatz (4 BE)')));
const imgs = req.messages[0].content.filter((x) => x.type === 'image');
assert.equal(imgs.length, 2); assert.equal(imgs[0].source.media_type, 'image/jpeg');
assert.equal(imgs[0].source.data, Buffer.from([255, 216, 255, 1]).toString('base64')); // Aufgabe (P1) zuerst
ok('Seiten nach Rolle geordnet und beschriftet, Erwartungshorizont als Text dabei, Bilder als base64 JPEG');

const l = db.log[0];
assert.deepEqual([l.table, l.kind, l.task, l.model, l.effort, l.status, l.note_id], ['ai_log', 'exam', 'exam', SONNET, 'medium', 'ok', 'r1']);
assert.ok(Math.abs(l.cost_usd - (5000 * 2 + 1500 * 10) / 1e6) < 1e-12); assert.ok(!JSON.stringify(l).includes('Antwort'));
ok('Protokoll: Art exam mit Modell, Kosten, Status, ohne Inhalte');

reset([reply(good({ aufgaben: [{ ...graded.aufgaben[0], unsicher: true }] }))]); [st, b] = await call(grade);
assert.equal(b.main.result.lesbarkeit, 'unsicher'); assert.equal(db.log[0].status, 'unsicher'); ok('unsicher gelesene Stellen: Lesbarkeit unsicher, im Protokoll vermerkt');

// --- Vergleich ---
reset([reply(good()), reply(good({ aufgaben: [{ ...graded.aufgaben[0], punkte: 18 }] }), { usage: { input_tokens: 5000, output_tokens: 900 } })]);
[st, b] = await call({ ...grade, compare: true });
assert.equal(st, 200); assert.equal(calls.length, 2);
assert.equal(calls[1].body.model, HAIKU); assert.deepEqual(calls[1].body.output_config, oc('high'));
assert.equal(b.compare.model, HAIKU); assert.equal(b.compare.result.aufgaben[0].punkte, 18); assert.equal(b.main.result.aufgaben[0].punkte, 14);
assert.equal(db.rows[HAIKU].requests, 1); assert.equal(db.rows[SONNET].requests, 1); assert.deepEqual(db.log.map((x) => x.model), [SONNET, HAIKU]);
ok('Vergleich: dieselbe Klausur zusätzlich mit Haiku (high), Verbrauch und Protokoll je Modell');
reset([reply(good()), reply('kein JSON')]); [st, b] = await call({ ...grade, compare: true });
assert.equal(st, 200); assert.equal(b.compare, null); assert.match(b.compareError, /nicht gelesen/); assert.equal(b.main.result.aufgaben[0].punkte, 14);
ok('scheitert der Vergleich, bleibt die Korrektur gültig (mit Hinweis)');

// --- Sprache und Fach ---
reset([reply(good())]); await call({ mode: 'grade', reviewId: 'ren', pages: [img(P1, 'loesung')] });
assert.ok(calls[0].body.system.includes('Moderne Fremdsprache') && calls[0].body.system.includes('Rückmeldung auf Deutsch') && calls[0].body.system.includes('"richtigkeit": Zahl 0 bis 15'));
ok('Englisch: Muster Fremdsprache (Sprache und Inhalt), Rückmeldung auf Deutsch');
reset([reply(good())]); await call({ mode: 'grade', reviewId: 'rla', pages: [img(P1, 'loesung')] });
assert.ok(calls[0].body.system.includes('"uebersetzung_fehler": Zahl oder null') && calls[0].body.system.includes('Anlage 9c') === false);
assert.ok(calls[0].body.system.includes('Fehlergewichtung')); ok('Latein: Fehlergewichtung der Übersetzung im Muster');

// --- Lernen aus der Korrektur der Lehrkraft ---
reset(); [st, b] = await call({ mode: 'learn', reviewId: 'r1', pages: [img(P1, 'korrigiert')] });
assert.equal(st, 409); assert.equal(b.error, 'not_graded'); assert.equal(calls.length, 0); ok('Lernen ohne KI-Korrektur: abgelehnt, nichts an Claude');
reset([reply(learned, { usage: { input_tokens: 4000, output_tokens: 300 } })]); [st, b] = await call({ mode: 'learn', reviewId: 'r2', pages: [img(P1, 'korrigiert')] });
assert.equal(st, 200); assert.deepEqual(calls[0].body.output_config, oc('medium', LEARN_SCHEMA)); assert.deepEqual(b.learn, { teacherPoints: 8, tasks: [{ nr: '1', punkte: 11 }], lessons: ['Verlangt eine These in der Einleitung.'] });
assert.equal(calls[0].body.max_tokens, 4000); assert.equal(calls[0].body.model, SONNET);
assert.ok(calls[0].body.system.includes('höchstens 5 allgemeine Erfahrungen') && calls[0].body.system.includes('- Erwartet Zeilenangaben'));
const first = texts(calls[0])[0];
assert.match(first, /Note der KI: \d+ Punkte/); assert.match(first, /1 Analyse: 14 von 20 \(fehlt: Belege\)/);
assert.deepEqual([db.log[0].kind, db.log[0].status], ['exam_learn', 'ok']);
ok('Lernen: vergleicht die gespeicherte KI-Korrektur mit der Lehrkraft, liest Punkte und Erfahrungen, Protokoll exam_learn');

// --- Kosten ---
reset([reply(good())]); setRow(SONNET, 2_000_000, 85_000, 5); // 4,85 $ verbraucht
[st, b] = await call(grade); assert.equal(st, 200); ok('Budget: passt die Klausur im schlimmsten Fall noch hinein, wird korrigiert');
reset([reply(good())]); setRow(SONNET, 2_000_000, 95_000, 5); // 4,95 $: mit Bildern und 8000 Tokens Ausgabe zu viel
[st, b] = await call(grade); assert.equal(st, 429); assert.equal(b.error, 'budget_reached'); assert.equal(calls.length, 0); assert.equal(db.log[0].status, 'budget_reached');
ok('Budget: schlimmster Fall (Prompt, Bilder, volle Ausgabe) über dem Monatsbudget, nichts an Claude');
reset([reply(good())]); setRow(SONNET, 1000, 100, 500); [st, b] = await call(grade); assert.equal(b.error, 'cap_reached'); ok('Monatslimit der Anfragen');

// --- Fehler ---
reset([reply('Das ist kein JSON')]); [st, b] = await call(grade); assert.equal(st, 502); assert.equal(b.error, 'invalid_json'); assert.equal(requestsOf(), 1); assert.equal(db.log[0].status, 'invalid_json');
ok('ungültiges JSON: deutsche Meldung, Verbrauch trotzdem gezählt, im Protokoll');
reset([reply(good({ aufgaben: [] }))]); [st, b] = await call(grade); assert.equal(b.error, 'invalid_json'); ok('Antwort ohne Aufgaben gilt als ungültig');
reset([reply('{"aufgaben": [', { stop: 'max_tokens' })]); [st, b] = await call(grade); assert.equal(st, 502); assert.equal(b.error, 'truncated'); ok('abgeschnitten: deutsche Meldung');
reset([err(402, 'billing_error', 'Billing problem')]); [st, b] = await call(grade); assert.equal(b.error, 'billing'); ok('Guthaben leer');
reset([err(429, 'rate_limit_error', 'x', { 'retry-after': '0' }), reply(good())]); [st, b] = await call(grade); assert.equal(st, 200); assert.equal(calls.length, 2); ok('429: einmal wiederholt');

reset();
[st, b] = await call(grade, 'Bearer schlecht'); assert.equal(st, 401);
[st, b] = await call({ ...grade, reviewId: 'fremd' }); assert.equal(st, 404);
[st, b] = await call({ ...grade, mode: 'irgendwas' }); assert.equal(st, 400);
[st, b] = await call({ ...grade, pages: [img(P1, 'korrigiert')] }); assert.equal(st, 400);
[st, b] = await call({ mode: 'learn', reviewId: 'r2', pages: [img(P1, 'loesung')] }); assert.equal(st, 400);
[st, b] = await call({ ...grade, pages: [img(P1, 'quatsch')] }); assert.equal(st, 400);
[st, b] = await call({ ...grade, pages: [img(OTHER, 'loesung')] }); assert.equal(st, 400);
[st, b] = await call({ ...grade, pages: [img(`${UID}/../x.jpg`, 'loesung')] }); assert.equal(st, 400);
[st, b] = await call({ ...grade, reviewId: 'r2', pages: [img(P2, 'loesung')] }); assert.equal(st, 404); // Bild gehört zu einer anderen Korrektur
[st, b] = await call({ ...grade, pages: [] }); assert.equal(st, 400);
[st, b] = await call({ ...grade, pages: Array(25).fill(img(P1, 'loesung')) }); assert.equal(st, 400);
[st, b] = await call({ ...grade, pages: [{ type: 'text', text: 'x'.repeat(20_000), role: 'loesung' }, ...Array(4).fill({ type: 'text', text: 'x'.repeat(20_000), role: 'loesung' })] }); assert.equal(st, 400);
assert.equal(calls.length, 0);
ok('Anmeldung, fremde Korrektur, falscher Modus, falsche Rollen, fremde Pfade, zu viele Seiten: abgelehnt, nichts an Claude');

env.ANTHROPIC_API_KEY = ''; reset(); [st, b] = await call(grade); assert.equal(st, 500); assert.equal(b.error, 'not_configured'); env.ANTHROPIC_API_KEY = 'sk-test';
ok('ohne ANTHROPIC_API_KEY: deutsche Meldung');
