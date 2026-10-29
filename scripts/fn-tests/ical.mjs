import assert from 'node:assert/strict';
const UID = '11111111-2222-3333-4444-555555555555';
const state = { status: 'active', limited: false, hits: [] };
globalThis.__cc = (_u, key, opts) => ({
  auth: { getUser: async () => ({ data: { user: opts?.global?.headers?.Authorization === 'Bearer good' ? { id: UID } : null } }) },
  from: (table) => { const o = { select: () => o, eq: () => o, maybeSingle: async () => { assert.equal(table, 'accounts'); return { data: state.status ? { status: state.status } : null }; } }; return o; },
  rpc: async (name, args) => { assert.equal(key, 'service'); assert.equal(name, 'rate_hit'); state.hits.push(args); return { data: !state.limited }; },
});
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
const dns = { A: { 'plan.uni.de': ['93.184.216.34'], 'evil.example.com': ['10.0.0.5'], 'mixed.example.com': ['93.184.216.34', '169.254.169.254'], 'rebind6.example.com': [] }, AAAA: { 'rebind6.example.com': ['fd00::1'], 'plan.uni.de': [] }, calls: [] };
let handler;
globalThis.Deno = {
  env: { get: (k) => env[k] },
  serve: (h) => { handler = h; },
  resolveDns: async (host, type) => { dns.calls.push(`${type}:${host}`); const list = dns[type][host]; if (!list) throw new Error('NXDOMAIN'); return list; },
};
await import(process.env.FN_COPY);

const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
const web = { calls: [], plan: () => new Response(ICS, { status: 200, headers: { 'content-type': 'text/calendar' } }) };
globalThis.fetch = async (url, init) => {
  web.calls.push({ url: String(url), init });
  return web.plan(String(url), init);
};
const call = async (body, auth = 'Bearer good', method = 'POST') => {
  const res = await handler(new Request('https://f.test/', { method, headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined }));
  return { status: res.status, body: await res.json().catch(() => null) };
};
const reset = () => { web.calls.length = 0; dns.calls.length = 0; state.limited = false; state.status = 'active'; web.plan = () => new Response(ICS, { status: 200 }); };
const decode = (b64) => Buffer.from(b64, 'base64').toString('utf8');

// 1. Erfolg: https-Adresse, Datei kommt als base64
reset();
let r = await call({ url: 'webcal://plan.uni.de/export.ics?token=geheim' });
assert.equal(r.status, 200);
assert.equal(decode(r.body.bytes), ICS);
assert.equal(web.calls.length, 1);
assert.equal(web.calls[0].url, 'https://plan.uni.de/export.ics?token=geheim');
assert.equal(web.calls[0].init.redirect, 'manual');
assert.deepEqual(dns.calls.sort(), ['A:plan.uni.de', 'AAAA:plan.uni.de']);
assert.deepEqual(state.hits.at(-1), { p_key: `ical:${UID}`, p_max: 30, p_window_seconds: 600 });
console.log('✓ 1. Abruf mit Namensprüfung, webcal wird https, Abrufgrenze je Konto');

// 2. Anmeldung, Freigabe, Abrufgrenze, Methode
reset();
assert.equal((await call({ url: 'https://plan.uni.de/a.ics' }, 'Bearer bad')).status, 401);
state.status = 'pending';
assert.equal((await call({ url: 'https://plan.uni.de/a.ics' })).status, 403);
reset(); state.limited = true;
assert.equal((await call({ url: 'https://plan.uni.de/a.ics' })).status, 429);
assert.equal(web.calls.length, 0);
reset();
assert.equal((await call(null, 'Bearer good', 'GET')).status, 405);
console.log('✓ 2. ohne Anmeldung 401, nicht freigegeben 403, Grenze 429, nur POST');

// 3. unzulässige Adressen: nie ein Abruf
reset();
for (const url of ['http://plan.uni.de/a.ics', 'https://127.0.0.1/a.ics', 'https://localhost/a.ics', 'https://user:pw@plan.uni.de/a.ics', 'https://plan.uni.de:8443/a.ics', 'https://[::1]/a.ics', 'https://169.254.169.254/latest', '', 'kaputt']) {
  const x = await call({ url });
  assert.equal(x.status, 400, url);
  assert.equal(x.body.error, 'bad_request', url);
}
assert.equal((await call({})).status, 400);
assert.equal(web.calls.length, 0);
assert.equal(dns.calls.length, 0);
console.log('✓ 3. unzulässige Adressen: 400 ohne Namensauflösung und ohne Abruf');

// 4. Namen, die auf nicht öffentliche Adressen zeigen
reset();
for (const host of ['evil.example.com', 'mixed.example.com', 'rebind6.example.com', 'unbekannt.example.com']) {
  const x = await call({ url: `https://${host}/a.ics` });
  assert.equal(x.status, 400, host);
  assert.equal(x.body.error, 'blocked', host);
}
assert.equal(web.calls.length, 0);
console.log('✓ 4. Name zeigt auf private Adresse (IPv4 oder IPv6), eine private unter mehreren, oder gar keine: blocked, kein Abruf');

// 5. Weiterleitungen: gefolgt, jede Adresse neu geprüft, höchstens 3
reset();
web.plan = (url) => (url === 'https://plan.uni.de/start' ? new Response(null, { status: 302, headers: { location: '/final.ics' } }) : new Response(ICS, { status: 200 }));
r = await call({ url: 'https://plan.uni.de/start' });
assert.equal(r.status, 200);
assert.deepEqual(web.calls.map((c) => c.url), ['https://plan.uni.de/start', 'https://plan.uni.de/final.ics']);
reset();
web.plan = () => new Response(null, { status: 302, headers: { location: 'https://evil.example.com/a.ics' } });
r = await call({ url: 'https://plan.uni.de/start' });
assert.equal(r.body.error, 'blocked');
assert.equal(web.calls.length, 1); // der zweite Server wird nie abgerufen
reset();
web.plan = () => new Response(null, { status: 302, headers: { location: 'http://plan.uni.de/a.ics' } });
assert.equal((await call({ url: 'https://plan.uni.de/start' })).body.error, 'blocked');
reset();
web.plan = () => new Response(null, { status: 302, headers: { location: '/again' } });
r = await call({ url: 'https://plan.uni.de/start' });
assert.equal(r.status, 502);
assert.equal(web.calls.length, 4); // Start plus drei Weiterleitungen
console.log('✓ 5. Weiterleitungen: neue Adresse wird neu geprüft, Schleifen enden nach drei');

// 6. Antwort prüfen: kein Kalender, zu groß, Fehlerstatus, UTF-16
reset();
web.plan = () => new Response('<html>Anmelden</html>', { status: 200 });
assert.equal((await call({ url: 'https://plan.uni.de/a' })).body.error, 'not_calendar');
web.plan = () => new Response('x', { status: 200, headers: { 'content-length': '3000000' } });
assert.equal((await call({ url: 'https://plan.uni.de/a' })).status, 413);
web.plan = () => new Response('BEGIN:VCALENDAR\r\n' + 'x'.repeat(2_100_000), { status: 200 });
assert.equal((await call({ url: 'https://plan.uni.de/a' })).status, 413);
web.plan = () => new Response('nope', { status: 404 });
assert.equal((await call({ url: 'https://plan.uni.de/a' })).status, 502);
web.plan = () => { throw new Error('Netzfehler'); };
assert.equal((await call({ url: 'https://plan.uni.de/a' })).status, 502);
const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('BEGIN:VCALENDAR\r\nEND:VCALENDAR', 'utf16le')]);
web.plan = () => new Response(u16, { status: 200 });
r = await call({ url: 'https://plan.uni.de/a' });
assert.equal(r.status, 200);
assert.deepEqual(Buffer.from(r.body.bytes, 'base64'), u16);
console.log('✓ 6. kein Kalender 422, zu groß 413, Fehlerstatus und Netzfehler 502, UTF-16 kommt unverändert an');
