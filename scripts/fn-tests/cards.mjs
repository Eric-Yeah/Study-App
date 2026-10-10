import assert from 'node:assert/strict';
const UID = '11111111-2222-3333-4444-555555555555';
const notes = {
  note1: { subject_id: 'sub-en', title: 'Optik', summary: { thema: 'Brechung', kernaussagen: ['Licht ändert die Richtung', 'Der Winkel hängt vom Medium ab'], begriffe: ['Brechung'], formeln: ['n = c / v'], offene_fragen: [] } },
  leer: { title: 'Leer', summary: { thema: 'x', kernaussagen: [], begriffe: [], formeln: [], offene_fragen: [] } },
};
const logs = [];
const acc = { row: { status: 'active', is_admin: true, ai_features: [] }, todayOk: 0, limit: 30 };
globalThis.__cc = (_u, _k, opts) => ({
  auth: { getUser: async () => ({ data: { user: opts?.global?.headers?.Authorization === 'Bearer good' ? { id: UID } : null } }) },
  from: (table) => {
    const f = {};
    const o = {
      select: () => o,
      insert: async (row) => { logs.push({ table, ...row }); return { error: null }; },
      eq: (c, v) => { f[c] = v; return o; },
      gte: (c, v) => { f[c] = v; return o; },
      maybeSingle: async () => {
        if (table === 'accounts') return { data: acc.row };
        if (table === 'app_settings') return { data: { friends_budget_usd: 3, cards_daily_limit: acc.limit } };
        return table === 'subjects' ? { data: { language: f.id === 'sub-en' ? 'en' : 'de' } } : { data: notes[f.id] ?? null };
      },
      then: (res) => {
        if (table === 'accounts') return Promise.resolve({ data: [{ user_id: 'admin-id' }] }).then(res);
        if (table === 'ai_log') { assert.equal(f.user_id, UID); assert.equal(f.kind, 'cards'); assert.equal(f.status, 'ok'); assert.ok(f.at); return Promise.resolve({ count: acc.todayOk }).then(res); }
        return Promise.resolve({ data: [] }).then(res);
      },
    };
    return o;
  },
});
const env = { GROQ_API_KEY: 'gsk-test', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
let handler; globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
await import(process.env.FN_COPY);
const calls = []; let script = [];
globalThis.fetch = async (url, init) => { calls.push({ url, headers: init.headers, body: JSON.parse(init.body) }); const r = script.shift(); assert.ok(r, 'unerwarteter Aufruf'); return new Response(JSON.stringify(r.body), { status: r.status }); };
const reply = (content, finish = 'stop') => ({ status: 200, body: { choices: [{ message: { content }, finish_reason: finish }], usage: { prompt_tokens: 800, completion_tokens: 300 } } });
const call = async (body, authz = 'Bearer good') => { const r = await handler(new Request('http://x', { method: 'POST', headers: { Authorization: authz }, body: JSON.stringify(body) })); return [r.status, await r.json()]; };
let n = 0; const ok = (m) => console.log(`✓ ${++n}. ${m}`);
const good = JSON.stringify({ cards: [{ front: 'Was ist Brechung?', back: 'Richtungsänderung des Lichts.', difficulty: 3 }] });
let st, b;

script = [reply(good)]; [st, b] = await call({ noteId: 'note1', existingFronts: ['Alte Frage?'] });
assert.equal(st, 200); assert.equal(b.cards.length, 1); assert.equal(b.model, 'openai/gpt-oss-120b'); assert.equal(b.cards[0].difficulty, 3);
const sent = calls[0]; assert.equal(sent.url, 'https://api.groq.com/openai/v1/chat/completions'); assert.equal(sent.headers.Authorization, 'Bearer gsk-test');
assert.equal(sent.body.model, 'openai/gpt-oss-120b'); assert.equal(sent.body.response_format.type, 'json_schema'); assert.equal(sent.body.response_format.json_schema.strict, true);
assert.equal(sent.body.reasoning_effort, 'low'); assert.equal(sent.body.max_completion_tokens, 3000);
assert.ok(sent.body.messages[1].content.includes('Alte Frage?')); assert.ok(sent.body.messages[1].content.includes('n = c / v'));
assert.ok(sent.body.messages[0].content.includes('auf Englisch unterrichtet')); assert.ok(sent.body.messages[0].content.includes('Verteile die Schwierigkeit'));
assert.deepEqual(sent.body.response_format.json_schema.schema.properties.cards.items.required, ['front', 'back', 'difficulty']);
ok('Karten erzeugt: Modell, striktes Schema, vorhandene Karten, Sprache des Fachs, Schwierigkeit gemischt');

calls.length = 0; script = [reply(good)]; [st, b] = await call({ noteId: 'note1', difficulty: 4 });
assert.equal(st, 200); assert.ok(calls[0].body.messages[0].content.includes('Alle Karten haben die Schwierigkeit 4 (sehr schwer)')); assert.equal(b.cards[0].difficulty, 4);
calls.length = 0; script = [reply(good)]; [st, b] = await call({ noteId: 'note1', difficulty: 7 }); assert.ok(calls[0].body.messages[0].content.includes('Verteile die Schwierigkeit')); assert.equal(b.cards[0].difficulty, 3);
ok('Wunschstufe 4 gilt für alle Karten, ungültige Stufe wird ignoriert');
calls.length = 0; script = [reply(good)]; notes.deutsch = { title: 'Bio', summary: notes.note1.summary }; [st, b] = await call({ noteId: 'deutsch' });
assert.equal(st, 200); assert.ok(calls[0].body.messages[0].content.includes('Schreibe auf Deutsch.')); ok('Notiz ohne Fach: Karten auf Deutsch');
calls.length = 0; script = [reply('```json\n' + good + '\n```')]; [st, b] = await call({ noteId: 'note1' }); assert.equal(st, 200); assert.equal(b.cards.length, 1); ok('Codeblock um das JSON wird gelesen');
script = []; [st, b] = await call({ noteId: 'leer' }); assert.equal(st, 422); assert.equal(b.error, 'no_content'); assert.equal(calls.length, 1); ok('zu wenig Inhalt: kein Aufruf an Groq');
[st, b] = await call({ noteId: 'fremd' }); assert.equal(st, 404); ok('fremde oder fehlende Notiz');
[st, b] = await call({ noteId: 'note1' }, 'Bearer schlecht'); assert.equal(st, 401); ok('ohne gültige Anmeldung');
[st, b] = await call({}); assert.equal(st, 400); [st, b] = await call({ noteId: 'x'.repeat(200) }); assert.equal(st, 400); ok('ungültige Anfrage');
for (const [code, error, status] of [[429, 'rate_limit', 429], [401, 'bad_key', 502], [403, 'bad_key', 502], [503, 'unavailable', 503], [500, 'unavailable', 503]]) { script = [{ status: code, body: { error: { message: 'x' } } }]; [st, b] = await call({ noteId: 'note1' }); assert.equal(st, status, String(code)); assert.equal(b.error, error); }
ok('Groq-Fehler 429, 401, 403, 5xx werden in deutsche Meldungen übersetzt');
script = [{ status: 400, body: { error: { message: 'model decommissioned' } } }]; [st, b] = await call({ noteId: 'note1' }); assert.equal(b.error, 'request_failed'); assert.ok(b.message.includes('model decommissioned')); ok('sonstige 400er zeigen den Grund');
script = [reply(good, 'length')]; [st, b] = await call({ noteId: 'note1' }); assert.equal(b.error, 'truncated'); ok('abgeschnittene Antwort');
script = [reply('kein json')]; [st, b] = await call({ noteId: 'note1' }); assert.equal(b.error, 'invalid_json'); ok('ungültiges JSON');
script = [reply('{"cards": []}')]; [st, b] = await call({ noteId: 'note1' }); assert.equal(st, 200); assert.deepEqual(b.cards, []); ok('leere Liste ist erlaubt');
const failFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('netz'); }; [st, b] = await call({ noteId: 'note1' }); assert.equal(b.error, 'unavailable'); globalThis.fetch = failFetch; ok('Netzwerkfehler');

logs.length = 0; calls.length = 0; script = [reply(good)]; [st, b] = await call({ noteId: 'note1' });
assert.equal(logs.length, 1); assert.deepEqual([logs[0].table, logs[0].kind, logs[0].model, logs[0].status, logs[0].input_tokens, logs[0].output_tokens, logs[0].cost_usd, logs[0].note_id, logs[0].user_id], ['ai_log', 'cards', 'openai/gpt-oss-120b', 'ok', 800, 300, 0, 'note1', UID]);
assert.ok(!JSON.stringify(logs[0]).includes('Brechung')); ok('Protokoll: Karten mit Modell, Tokens, Kosten 0 und Status, ohne Inhalte');
logs.length = 0; script = [{ status: 429, body: { error: { message: 'x' } } }]; await call({ noteId: 'note1' }); assert.equal(logs[0].status, 'rate_limit'); ok('Protokoll: Fehler von Groq mit Code');
logs.length = 0; script = []; await call({ noteId: 'leer' }); assert.equal(logs.length, 0); ok('kein Aufruf an Groq, kein Protokolleintrag');
delete env.GROQ_API_KEY; [st, b] = await call({ noteId: 'note1' }); assert.equal(st, 500); assert.equal(b.error, 'not_configured'); ok('ohne Schlüssel auf dem Server: klare Meldung');

// --- Freigabe und Tageslimit ---
env.GROQ_API_KEY = 'gsk-test';
const friend = { status: 'active', is_admin: false, ai_features: ['cards'] };
acc.row = { status: 'pending', is_admin: false, ai_features: ['cards'] }; calls.length = 0;
[st, b] = await call({ noteId: 'note1' }); assert.equal(st, 403); assert.equal(b.error, 'not_allowed'); assert.equal(calls.length, 0);
acc.row = { status: 'active', is_admin: false, ai_features: ['summarize'] }; [st, b] = await call({ noteId: 'note1' }); assert.equal(st, 403);
acc.row = { status: 'blocked', is_admin: false, ai_features: ['cards'] }; [st, b] = await call({ noteId: 'note1' }); assert.equal(st, 403);
acc.row = null; [st, b] = await call({ noteId: 'note1' }); assert.equal(st, 403); assert.equal(calls.length, 0);
ok('wartende, gesperrte, nicht freigeschaltete oder unbekannte Konten: 403, nichts an Groq');
acc.row = friend; acc.todayOk = 29; script = [reply(good)]; [st] = await call({ noteId: 'note1' }); assert.equal(st, 200);
acc.todayOk = 30; calls.length = 0; [st, b] = await call({ noteId: 'note1' }); assert.equal(st, 429); assert.equal(b.error, 'daily_limit'); assert.equal(calls.length, 0);
acc.limit = 0; acc.todayOk = 0; [st, b] = await call({ noteId: 'note1' }); assert.equal(b.error, 'daily_limit'); acc.limit = 30;
ok('Freund mit KI-Karten: Tageslimit aus den Einstellungen, danach nichts mehr an Groq');
acc.row = { status: 'active', is_admin: true, ai_features: [] }; acc.todayOk = 500; script = [reply(good)]; [st] = await call({ noteId: 'note1' }); assert.equal(st, 200);
ok('Admin: alle Funktionen, kein Tageslimit');
console.log(`alle ${n} Gruppen bestanden`);
