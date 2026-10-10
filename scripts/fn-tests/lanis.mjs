import assert from 'node:assert/strict';
const UID = '11111111-2222-3333-4444-555555555555';
const state = { status: 'active', limited: false, hits: [], fetches: 0 };
globalThis.__cc = (_u, key, opts) => ({
  auth: { getUser: async () => ({ data: { user: opts?.global?.headers?.Authorization === 'Bearer good' ? { id: UID } : null } }) },
  from: (table) => { const f = {}; const o = { select: () => o, eq: (c, v) => { f[c] = v; return o; }, maybeSingle: async () => { assert.equal(table, 'accounts'); assert.equal(f.user_id, UID); return { data: state.status ? { status: state.status } : null }; } }; return o; },
  rpc: async (name, args) => { assert.equal(key, 'service'); assert.equal(name, 'rate_hit'); state.hits.push(args); return { data: !state.limited }; },
});
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
let handler; globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
await import(process.env.FN_COPY);
// Das Schulportal ist nicht erreichbar: jeder Aufruf zählt, die Antwort ist ein Fehler
globalThis.fetch = async () => { state.fetches++; throw new Error('offline'); };
const call = async (body, authz = 'Bearer good') => { const r = await handler(new Request('http://x', { method: 'POST', headers: { Authorization: authz }, body: JSON.stringify(body) })); return [r.status, await r.json().catch(() => ({}))]; };
const body = { schoolId: '1234', username: 'max.muster', password: 'geheim' };
let n = 0; const ok = (m) => console.log(`✓ ${++n}. ${m}`);
let st, b;

[st, b] = await call(body, 'Bearer schlecht'); assert.equal(st, 401); assert.equal(state.fetches, 0); assert.equal(state.hits.length, 0);
[st, b] = await call(body, ''); assert.equal(st, 401); assert.equal(state.fetches, 0);
ok('ohne gültige Anmeldung (auch nur mit dem öffentlichen Schlüssel): 401, kein Aufruf ans Schulportal');
for (const s of ['pending', 'blocked', null]) { state.status = s; [st, b] = await call(body); assert.equal(st, 403); assert.equal(b.error, 'not_allowed'); }
assert.equal(state.fetches, 0); state.status = 'active';
ok('wartende, gesperrte oder unbekannte Konten: 403, kein Aufruf ans Schulportal');
state.limited = true; [st, b] = await call(body); assert.equal(st, 429); assert.equal(b.error, 'rate_limited'); assert.equal(state.fetches, 0); state.limited = false;
assert.deepEqual(state.hits.at(-1), { p_key: `lanis:${UID}`, p_max: 20, p_window_seconds: 600 });
ok('Grenze je Konto (20 in 10 Minuten): 429, kein Aufruf ans Schulportal');
[st, b] = await call({ ...body, schoolId: 'abc' }); assert.equal(st, 400); assert.equal(state.fetches, 0);
[st, b] = await call({ ...body, username: 'a b/../x' }); assert.equal(st, 400);
[st, b] = await call({ ...body, password: 'x'.repeat(201) }); assert.equal(st, 400);
ok('ungültige Schulnummer, Benutzername oder Passwort: 400');
[st, b] = await call(body); assert.ok(state.fetches > 0); assert.ok(st >= 400); assert.ok(!JSON.stringify(b).includes('geheim'));
ok('freigegebenes Konto erreicht das Schulportal, das Passwort steht nie in der Antwort');
