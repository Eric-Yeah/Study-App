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
const dsb = { fetches: [], login: true, requests: [], failPage: null, big: false };
const menu = {
  Resultcode: 0,
  LastUpdate: '2026-10-22T06:51:00',
  ResultMenuItems: [{ Title: 'Inhalte', Childs: [
    { Title: 'Pläne', Root: { Childs: [
      { Title: 'Heute', Childs: [{ Title: 'Heute', Date: '22.10.2026 06:51', Detail: 'https://light.dsbcontrol.de/DSBlightWebsite/Data/abc/subst_001.htm' }] },
      { Title: 'Morgen', Childs: { Title: 'Morgen', Date: '9.11.2026 18:35', Detail: 'https://dsbmobile.de/data/abc/subst_002.htm' } },
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
  if (dsb.failPage && url.includes(dsb.failPage)) return new Response('x', { status: 500 });
  if (dsb.big) return new Response(Buffer.from('<div>' + 'x'.repeat(590_000) + '</div>'), { headers: { 'content-type': 'text/html' } });
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

dsb.login = true;
dsb.fetches.length = 0;
[st, b] = await call(body);
const v1 = b.version;
assert.match(v1, /^[0-9a-f]{16}$/);
assert.equal(b.published, '9.11.2026 18:35');
assert.equal(b.partial, false); assert.equal(b.failed, 0);
[st, b] = await call(body); assert.equal(b.version, v1);
ok('Kennung (version) bleibt bei gleichem Menü gleich, published ist das neueste Datum (nach Datum, nicht nach Text)');

dsb.fetches.length = 0;
[st, b] = await call({ ...body, onlyMenu: true });
assert.equal(st, 200); assert.equal(b.version, v1); assert.deepEqual(b.plans, []); assert.equal(b.onlyMenu, true);
assert.equal(dsb.fetches.filter((u) => !u.includes('GetData')).length, 0);
assert.equal(dsb.fetches.length, 1);
assert.equal(state.hits.at(-1).p_key, `dsb:${UID}`);
ok('onlyMenu: ein einziger Aufruf bei DSBmobile, keine Seiten, gleiche Kennung, zählt zur Grenze');

menu.ResultMenuItems[0].Childs[0].Root.Childs[0].Childs[0].Date = '23.10.2026 07:05';
[st, b] = await call({ ...body, onlyMenu: true }); assert.notEqual(b.version, v1); assert.equal(b.published, '9.11.2026 18:35');
const v2 = b.version;
menu.ResultMenuItems[0].Childs[0].Root.Childs[0].Childs[0].Date = '22.10.2026 06:51';
menu.ResultMenuItems[0].Childs[0].Root.Childs[0].Childs[0].Detail = 'https://light.dsbcontrol.de/DSBlightWebsite/Data/neu/subst_001.htm';
[st, b] = await call({ ...body, onlyMenu: true }); assert.notEqual(b.version, v1); assert.notEqual(b.version, v2);
menu.ResultMenuItems[0].Childs[0].Root.Childs[0].Childs[0].Detail = 'https://light.dsbcontrol.de/DSBlightWebsite/Data/abc/subst_001.htm';
[st, b] = await call({ ...body, onlyMenu: true }); assert.equal(b.version, v1);
ok('neues Datum oder neue Adresse im Menü ändern die Kennung, zurück ergibt wieder die alte');

dsb.failPage = 'subst_002';
[st, b] = await call(body);
assert.equal(st, 200); assert.equal(b.partial, true); assert.equal(b.failed, 1); assert.equal(b.plans.length, 1);
assert.deepEqual(b.menu.filter((m) => m.loaded).map((m) => m.file), ['subst_001.htm']);
dsb.failPage = 'subst_00';
[st, b] = await call(body); assert.equal(st, 502); assert.equal(b.error, 'dsb_unavailable');
[st, b] = await call({ ...body, onlyMenu: true }); assert.equal(st, 200); assert.equal(b.partial, false);
dsb.failPage = null;
ok('fehlt eine Seite: partial true und failed 1; fehlen alle: 502; onlyMenu lädt keine Seiten und bleibt davon unberührt');

dsb.big = true;
const extra = menu.ResultMenuItems[0].Childs[0].Root.Childs;
for (let i = 5; i <= 9; i++) extra.push({ Title: 'Mehr', Childs: [{ Date: '22.10.2026 06:51', Detail: `https://dsbmobile.de/data/abc/subst_00${i}.htm` }] });
[st, b] = await call(body);
assert.equal(st, 200); assert.ok(b.plans.length >= 1 && b.plans.length <= 4); assert.equal(b.partial, true); assert.ok(b.failed >= 1);
assert.ok(JSON.stringify(b).length < 3_000_000);
dsb.big = false;
ok('Antwortgröße begrenzt: zu viele große Seiten ergeben partial statt einer riesigen Antwort');
