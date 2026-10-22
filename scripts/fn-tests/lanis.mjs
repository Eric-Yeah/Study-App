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

// --- Kursmappen (Hausaufgaben) und Anhänge: nachgebautes Schulportal ---
const seen = [];
const course = (id, name) => `<html><head><script>var geheim = 1;</script></head><body><div id="menu">Menü</div><h1 data-book="${id}"> ${name} <small>1. Halbjahr</small></h1>
<button title="Muster, Max (Mus)"></button><div id="history"><div id="old"><table><tbody><tr data-entry="7"><td>01.10.2026<br/><small>1. Stunde</small></td><td><b>Thema</b><br/>
<span class="homework"><span class="done hidden"></span><span class="undone "></span></span><br/><span class="markup">Aufgabe 1</span>
<div class="file" data-extension="pdf" data-file="Blatt.pdf"><a href="#">Blatt.pdf <small>(1 KB)</small></a></div><encoded>GEHEIM==</encoded></td><td></td></tr></tbody></table></div></div><div id="marks">Noten</div></body></html>`;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  seen.push(`${init.method ?? 'GET'} ${u.host}${u.pathname}${u.search}`);
  if (u.host === 'login.schulportal.hessen.de') return new Response(null, { status: 302, headers: { location: 'https://connect.schulportal.hessen.de' } });
  if (u.host === 'connect.schulportal.hessen.de') { const h = new Headers(); h.append('set-cookie', 'sid=abc123; path=/'); return new Response('ok', { status: 200, headers: h }); }
  if (u.pathname === '/index.php') return new Response('bye');
  if (u.pathname === '/meinunterricht.php' && !u.search) return new Response('<a href="meinunterricht.php?a=sus_view&id=6829">Bio</a> <a href="meinunterricht.php?a=sus_view&id=6829&halb=1">x</a> <a href="meinunterricht.php?a=sus_view&id=7316">Eng</a>');
  if (u.pathname === '/meinunterricht.php' && u.searchParams.get('a') === 'sus_view') return u.searchParams.get('id') === '7316' ? new Response('kaputt', { status: 500 }) : new Response(course(u.searchParams.get('id'), 'Biologie GK 12 a'));
  if (u.pathname === '/meinunterricht.php' && u.searchParams.get('a') === 'downloadFile') {
    if (u.searchParams.get('f') === 'fehlt.pdf') return new Response('<html>Datei nicht gefunden</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), { headers: { 'content-type': 'application/pdf' } });
  }
  return new Response('nope', { status: 404 });
};
const login = { ...body };

[st, b] = await call({ ...login, parts: ['homework'] });
assert.equal(st, 200);
assert.deepEqual(b.errors, {});
assert.deepEqual(b.courseHtml.map((c) => c.book), ['6829']);
assert.match(b.courseHtml[0].html, /^<h1 data-book="6829"/);
assert.ok(b.courseHtml[0].html.includes('Aufgabe 1') && b.courseHtml[0].html.includes('data-file="Blatt.pdf"'));
assert.ok(!b.courseHtml[0].html.includes('geheim') && !b.courseHtml[0].html.includes('GEHEIM') && !b.courseHtml[0].html.includes('Noten') && !b.courseHtml[0].html.includes('Menü'));
assert.equal(seen.filter((s) => s.includes('sus_view&id=6829')).length, 1, 'jede Kursmappe nur einmal laden');
assert.ok(seen.some((s) => s.includes('/index.php?logout=all')), 'am Ende abmelden');
ok('Kursmappen: nur Überschrift bis Historie, ohne Skripte und kodierte Teile, defekte Kurse fallen weg, Abmeldung');

// Ältere Versionen der App fragen ohne parts: keine Kursmappen, keine Downloads
seen.length = 0;
[st, b] = await call(login);
assert.equal(st, 200);
assert.equal(b.courseHtml, undefined);
assert.ok(!seen.some((s) => s.includes('meinunterricht.php?a=sus_view') || s.includes('downloadFile')));
ok('ohne parts keine Kursmappen und keine Downloads');

seen.length = 0;
[st, b] = await call({ ...login, parts: ['download'], downloads: [{ book: '6829', entry: '7', name: 'Blatt & Co.pdf' }, { book: '6829', entry: '7', name: 'fehlt.pdf' }] });
assert.equal(st, 200);
assert.deepEqual(b.files.map((f) => [f.book, f.entry, f.name, f.type, f.size]), [['6829', '7', 'Blatt & Co.pdf', 'application/pdf', 6]]);
assert.equal(Buffer.from(b.files[0].base64, 'base64').toString('latin1'), '%PDF-1');
assert.deepEqual(b.failed.map((f) => [f.name, f.error]), [['fehlt.pdf', 'not_found']]);
assert.deepEqual(b.errors, {});
assert.ok(seen.some((s) => s === 'GET start.schulportal.hessen.de/meinunterricht.php?a=downloadFile&id=6829&e=7&f=Blatt%20%26%20Co.pdf'));
ok('Download: nur die angeforderten Dateien, URL von der Function gebaut und kodiert, HTML-Antwort zählt als nicht gefunden');

[st, b] = await call({ ...login, parts: ['download'], downloads: [{ book: '6829', entry: '7', name: 'fehlt.pdf' }] });
assert.equal(st, 502); assert.equal(b.error, 'lanis_unavailable');
ok('Download ohne eine einzige Datei: Fehler');

seen.length = 0;
for (const downloads of [undefined, [], 'x', [{ book: '../x', entry: '7', name: 'a.pdf' }], [{ book: '1', entry: '7?x=1', name: 'a.pdf' }], [{ book: '1', entry: '7', name: '../etc/passwd' }], [{ book: '1', entry: '7', name: 'a\\b.pdf' }], [{ book: '1', entry: '7', name: 'a\nb.pdf' }], [{ book: '1', entry: '7', name: 'x'.repeat(201) }], Array.from({ length: 13 }, () => ({ book: '1', entry: '2', name: 'a.pdf' }))]) {
  [st, b] = await call({ ...login, parts: ['download'], downloads }); assert.equal(st, 400, JSON.stringify(downloads)?.slice(0, 60));
}
assert.equal(seen.length, 0, 'bei ungültigen Download-Anfragen kein Aufruf ans Schulportal');
ok('ungültige Download-Anfragen (Pfade, Parameter, Steuerzeichen, zu viele): 400 ohne Aufruf ans Schulportal');
