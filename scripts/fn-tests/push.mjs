import assert from 'node:assert/strict';
import { webcrypto as crypto } from 'node:crypto';
const enc = new TextEncoder();
const b64u = (b) => Buffer.from(b).toString('base64url');
const unb64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
const cat = (...a) => Buffer.concat(a.map((x) => Buffer.from(x)));
const hkdf = async (salt, ikm, info, len) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));

// Empfänger (das Gerät): Schlüsselpaar und Auth-Geheimnis
const rcv = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const rcvPub = new Uint8Array(await crypto.subtle.exportKey('raw', rcv.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));
const sub = { endpoint: 'https://web.push.apple.com/abc123', keys: { p256dh: b64u(rcvPub), auth: b64u(authSecret) } };

/** Entschlüsselt eine Nachricht nach RFC 8291 wie das Gerät. */
async function decrypt(body) {
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, rcv.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, cat(enc.encode('WebPush: info\0'), rcvPub, asPub), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
  assert.equal(plain.at(-1), 2); return new TextDecoder().decode(plain.slice(0, -1));
}

const TOKEN = 'T'.repeat(40);
const state = { keys: { token: TOKEN, pub: null, priv: null }, due: [], rpc: [], sent: [], patched: 0, pushStatus: 201 };
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJservice' };
let handler; globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
await import(process.env.FN_COPY);
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith('https://x.supabase.co/rest/v1/push_keys') && !init.method) return Response.json([state.keys]);
  if (url.startsWith('https://x.supabase.co/rest/v1/push_keys') && init.method === 'PATCH') { assert.ok(url.includes('pub=is.null')); const b = JSON.parse(init.body); state.keys = { ...state.keys, ...b }; state.patched++; return new Response(null, { status: 204 }); }
  if (url.endsWith('/rpc/push_due')) return Response.json(state.due);
  if (url.endsWith('/rpc/push_gone')) { state.rpc.push(JSON.parse(init.body)); return Response.json(null); }
  state.sent.push({ url, headers: init.headers, body: init.body });
  return new Response('', { status: state.pushStatus });
};
const call = async (body, method = 'POST') => { const r = await handler(new Request('http://x', { method, body: method === 'POST' ? JSON.stringify(body) : undefined })); return [r.status, await r.json().catch(() => ({}))]; };
const item = (o = {}) => ({ id: 1, kind: 'plan', title: 'Heute: 1 Std. lernen', body: 'Mathe 60 min.', url: '/', device: 'd1', sub, ...o });
let n = 0; const ok = (name) => console.log(`✓ ${++n}. ${name}`);
let st, b;

[st, b] = await call({ op: 'key' });
assert.equal(st, 200); assert.ok(b.pub && b.pub.length > 60); assert.equal(state.patched, 1); assert.ok(state.keys.priv?.d);
const pub1 = b.pub; [st, b] = await call({ op: 'key' }); assert.equal(b.pub, pub1); assert.equal(state.patched, 1);
ok('Schlüssel: beim ersten Aufruf erzeugt und gespeichert, danach derselbe');

state.due = [item()];
[st, b] = await call({ op: 'tick', token: TOKEN });
assert.equal(st, 200); assert.deepEqual([b.sent, b.failed], [1, 0]);
const s = state.sent[0];
assert.equal(s.url, sub.endpoint); assert.equal(s.headers['Content-Encoding'], 'aes128gcm'); assert.equal(s.headers.TTL, '3600'); assert.equal(s.headers.Urgency, 'normal');
const msg = JSON.parse(await decrypt(s.body));
assert.deepEqual(msg, { k: 'plan', t: 'Heute: 1 Std. lernen', b: 'Mathe 60 min.', u: '/' });
ok('Tick: die Nachricht kommt verschlüsselt an und das Gerät kann sie lesen (RFC 8291)');

const auth = s.headers.Authorization; const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(auth); assert.ok(m);
const head = JSON.parse(Buffer.from(m[1], 'base64url')), claims = JSON.parse(Buffer.from(m[2], 'base64url'));
assert.deepEqual(head, { typ: 'JWT', alg: 'ES256' }); assert.equal(claims.aud, 'https://web.push.apple.com'); assert.equal(claims.sub, 'https://eric-yeah.github.io/Study-App/'); assert.ok(claims.exp > Date.now() / 1000 + 3600 && claims.exp < Date.now() / 1000 + 13 * 3600);
const vkey = await crypto.subtle.importKey('raw', unb64u(m[4]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vkey, unb64u(m[3]), enc.encode(`${m[1]}.${m[2]}`)), true); assert.equal(m[4], pub1);
ok('VAPID: Signatur stimmt mit dem öffentlichen Schlüssel, Gültigkeit 12 Stunden, Absender die App');

state.sent.length = 0; state.due = [item({ kind: 'test', title: 'T'.repeat(500), body: 'B'.repeat(900), url: 'x'.repeat(400) })];
await call({ op: 'tick', token: TOKEN });
const long = JSON.parse(await decrypt(state.sent[0].body)); assert.equal(long.t.length, 120); assert.equal(long.b.length, 300); assert.equal(long.u.length, 120);
assert.equal(state.sent[0].headers.TTL, '300'); assert.equal(state.sent[0].headers.Urgency, 'high');
ok('Texte werden gekürzt, die Testnachricht hat kurze Gültigkeit und hohe Dringlichkeit');

state.sent.length = 0; state.due = [item({ sub: { ...sub, endpoint: 'https://evil.example.com/x' } }), item({ id: 2, sub: { ...sub, endpoint: 'http://web.push.apple.com/x' } })]; state.rpc.length = 0;
[st, b] = await call({ op: 'tick', token: TOKEN });
assert.equal(state.sent.length, 0); assert.deepEqual(b.status, [410, 410]); assert.equal(state.rpc.length, 2);
ok('Fremde und unverschlüsselte Adressen werden nie angerufen, das Abo wird gelöscht');

state.due = [item()]; state.pushStatus = 410; state.rpc.length = 0; await call({ op: 'tick', token: TOKEN });
assert.deepEqual(state.rpc, [{ p_id: 'd1' }]); state.pushStatus = 404; state.rpc.length = 0; await call({ op: 'tick', token: TOKEN }); assert.equal(state.rpc.length, 1);
state.pushStatus = 503; state.rpc.length = 0; [st, b] = await call({ op: 'tick', token: TOKEN }); assert.equal(state.rpc.length, 0); assert.deepEqual([b.sent, b.failed], [0, 1]); state.pushStatus = 201;
ok('404 und 410 löschen das Abo, andere Fehler nicht');

state.sent.length = 0;
[st] = await call({ op: 'tick', token: 'falsch'.repeat(8) }); assert.equal(st, 401);
[st] = await call({ op: 'tick' }); assert.equal(st, 401);
[st] = await call({ op: 'tick', token: 'kurz' }); assert.equal(st, 401);
[st] = await call({ op: 'nix' }); assert.equal(st, 400);
[st] = await call({}, 'GET'); assert.equal(st, 405);
assert.equal(state.sent.length, 0);
ok('falsches oder fehlendes Token, unbekannte Aktion, falsche Methode: abgelehnt');

state.due = { code: 'x' }; [st] = await call({ op: 'tick', token: TOKEN }); assert.equal(st, 500); state.due = [];
[st, b] = await call({ op: 'tick', token: TOKEN }); assert.deepEqual([st, b.sent, b.failed], [200, 0, 0]);
ok('Fehler beim Holen und leere Warteschlange sind keine Störung');
