import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
const UID = '11111111-2222-3333-4444-555555555555';
const state = { status: 'active', limited: false, hits: [] };
globalThis.__cc = (_u, key, opts) => ({
  auth: { getUser: async () => ({ data: { user: opts?.global?.headers?.Authorization === 'Bearer good' ? { id: UID } : null } }) },
  from: (table) => { const f = {}; const o = { select: () => o, eq: (c, v) => { f[c] = v; return o; }, maybeSingle: async () => { assert.equal(table, 'accounts'); return { data: state.status ? { status: state.status } : null }; } }; return o; },
  rpc: async (name, args) => { assert.equal(key, 'service'); assert.equal(name, 'rate_hit'); state.hits.push(args); return { data: !state.limited }; },
});
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
let handler; globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
await import(process.env.FN_COPY);

// DSBmobile simuliert: Menü mit zwei erlaubten Plänen, einem fremden Server, einem Bild und einer news-Seite
const dsb = { fetches: [], login: true, requests: [] };
const menu = {
  Resultcode: 0,
  LastUpdate: '2026-10-22T06:51:00',
  ResultMenuItems: [{ Title: 'Inhalte', Childs: [
    { Title: 'Pläne', Root: { Childs: [
      { Title: 'Heute', Childs: [{ Title: 'Heute', Detail: 'https://light.dsbcontrol.de/DSBlightWebsite/Data/abc/subst_001.htm' }] },
      { Title: 'Morgen', Childs: { Title: 'Morgen', Detail: 'https://dsbmobile.de/data/abc/subst_002.htm' } },
      { Title: 'Fremd', Childs: [{ Detail: 'https://evil.example.com/subst_003.htm' }] },
      { Title: 'Bild', Childs: [{ Detail: 'https://light.dsbcontrol.de/x/plan.jpg' }] },
      { Title: 'News', Childs: [{ Detail: 'https://light.dsbcontrol.de/x/news.htm' }] },
      { Title: 'Unverschlüsselt', Childs: [{ Detail: 'http://light.dsbcontrol.de/x/subst_004.htm' }] },
    ] } },
  ] }],
};
globalThis.fetch = async (url, init) => {
  url = String(url);
  dsb.fetches.push(url);
  if (url.startsWith('https://app.dsbcontrol.de/JsonHandler.ashx/GetData')) {
    const body = JSON.parse(init.body);
    assert.equal(body.req.DataType, 1);
    const params = JSON.parse(gunzipSync(Buffer.from(body.req.Data, 'base64')).toString());
    dsb.requests.push(params);
    assert.equal(params.BundleId, 'de.heinekingmedia.dsbmobile');
    const out = dsb.login ? menu : { Resultcode: 1, ResultStatusInfo: 'falsch' };
    return new Response(JSON.stringify({ d: gzipSync(Buffer.from(JSON.stringify(out))).toString('base64') }), { headers: { 'content-type': 'application/json' } });
  }
  if (/subst_001/.test(url)) return new Response(Buffer.from('<div class="mon_title">22.10.2026 Donnerstag</div>'), { headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (/subst_002/.test(url)) return new Response(Buffer.from('<div class="mon_title">Fr\xe4 Plan</div>', 'latin1'), { headers: { 'content-type': 'text/html' } });
  throw new Error('unerwarteter Aufruf ' + url);
};
const call = async (body, authz = 'Bearer good') => { const r = await handler(new Request('http://x', { method: 'POST', headers: { Authorization: authz }, body: JSON.stringify(body) })); return [r.status, await r.json().catch(() => ({}))]; };
const body = { dsbUser: '123456', dsbPassword: 'geheim' };
let n = 0; const ok = (m) => console.log(`✓ ${++n}. ${m}`);
let st, b;

[st, b] = await call(body, 'Bearer schlecht'); assert.equal(st, 401); assert.equal(dsb.fetches.length, 0);
for (const s of ['pending', 'blocked', null]) { state.status = s; [st, b] = await call(body); assert.equal(st, 403); }
state.status = 'active'; assert.equal(dsb.fetches.length, 0);
ok('ohne Anmeldung 401, wartende oder gesperrte Konten 403, kein Aufruf an DSB');
state.limited = true; [st, b] = await call(body); assert.equal(st, 429); assert.equal(dsb.fetches.length, 0); state.limited = false;
assert.deepEqual(state.hits.at(-1), { p_key: `dsb:${UID}`, p_max: 20, p_window_seconds: 600 });
ok('Grenze je Konto (20 in 10 Minuten): 429');
[st] = await call({ dsbUser: 'a b/x', dsbPassword: 'x' }); assert.equal(st, 400);
[st] = await call({ dsbUser: '123456', dsbPassword: '' }); assert.equal(st, 400);
[st] = await call({ dsbUser: '123456', dsbPassword: 'x'.repeat(201) }); assert.equal(st, 400);
assert.equal(dsb.fetches.length, 0);
ok('ungültige Zugangsdaten: 400, kein Aufruf');
[st, b] = await call(body);
assert.equal(st, 200);
assert.deepEqual(b.plans.map((p) => p.html), ['<div class="mon_title">22.10.2026 Donnerstag</div>', '<div class="mon_title">Frä Plan</div>']);
assert.equal(b.updated, '2026-10-22T06:51:00');
assert.deepEqual(b.menu.map((m) => [m.file, m.loaded]), [['subst_001.htm', true], ['subst_002.htm', true], ['subst_003.htm', false], ['plan.jpg', false], ['news.htm', false], ['subst_004.htm', false]]);
assert.ok(b.menu.every((m) => !('url' in m)));
assert.equal(dsb.requests[0].UserId, '123456');
assert.ok(!JSON.stringify(b).includes('geheim'));
ok('lädt die Pläne (UTF-8 und Latin-1), das Passwort steht nie in der Antwort');
const pageCalls = dsb.fetches.filter((u) => !u.includes('GetData'));
assert.deepEqual(pageCalls, ['https://light.dsbcontrol.de/DSBlightWebsite/Data/abc/subst_001.htm', 'https://dsbmobile.de/data/abc/subst_002.htm']);
ok('fremde Server, http, Bilder und news-Seiten werden nicht geladen');
dsb.login = false; [st, b] = await call(body); assert.equal(st, 401); assert.equal(b.error, 'login_failed');
ok('falsche Zugangsdaten: 401 login_failed');
