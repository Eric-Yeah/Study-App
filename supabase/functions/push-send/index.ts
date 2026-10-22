// Supabase Edge Function (Deno): verschickt die Erinnerungen der Study App als Web-Push (iPhone, iPad, Android, Desktop).
//
// - Verify JWT AUS (npx supabase functions deploy push-send --no-verify-jwt), denn den Takt ruft pg_cron ohne Anmeldung auf.
//   Es sind keine Secrets nötig: Die Function erzeugt ihren VAPID-Schlüssel beim ersten Aufruf selbst und legt ihn in der Tabelle
//   push_keys ab (nur service_role, Migration 20261026). Der Takt (pg_cron, einmal pro Minute, nur wenn etwas fällig ist, Migration 20261029) kommt mit
//   einem Token aus push_keys.
// - Ops (POST, JSON): { op: 'key' } liefert den öffentlichen VAPID-Schlüssel für die App, { op: 'tick', token } sendet die fälligen
//   Nachrichten aus push_queue (RPC push_due, markiert sie als gesendet) und löscht Abos, die der Push-Dienst nicht mehr kennt (404, 410).
// - Die Nachricht ist verschlüsselt (RFC 8291, aes128gcm) und signiert (VAPID, RFC 8292) und enthält Titel, Text und Ziel in der App.
//   Der Service Worker (public/sw.js) zeigt sie an. Adressen außer denen von Apple, Google, Mozilla und Microsoft werden nie angerufen.

const SUBJECT = 'https://eric-yeah.github.io/Study-App/';
const HOSTS = /^https:\/\/([a-z0-9-]+\.push\.apple\.com|fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
const TTL: Record<string, number> = { plan: 3600, exam: 3600, behind: 3600, test: 300 };

const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s: string) => {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(t, (c) => c.charCodeAt(0));
};
const cat = (...a: Uint8Array[]) => {
  const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of a) {
    o.set(x, i);
    i += x.length;
  }
  return o;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

/** Nachricht nach RFC 8291 (aes128gcm) verschlüsseln. */
async function encryptPayload(text: string, p256dh: string, auth: string) {
  const ua = unb64u(p256dh);
  const authSecret = unb64u(auth);
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, kp.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, cat(enc.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const data = cat(enc.encode(text), new Uint8Array([2])); // 0x02 = letzter und einziger Block
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']), data));
  const head = new Uint8Array(4);
  new DataView(head.buffer).setUint32(0, 4096);
  return cat(salt, head, new Uint8Array([asPub.length]), asPub, ct);
}

/** VAPID (RFC 8292): JWT mit ES256, Gültigkeit 12 Stunden */
async function vapidAuth(endpoint: string, priv: JsonWebKey, pub: string) {
  const key = await crypto.subtle.importKey('jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${pub}`;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, obj: unknown) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function db() {
  const url = Deno.env.get('SUPABASE_URL')!;
  let sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!sk) {
    try {
      sk = (Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'))[0] as string) || '';
    } catch {
      sk = '';
    }
  }
  const h: Record<string, string> = { 'Content-Type': 'application/json', apikey: sk };
  if (sk.startsWith('eyJ')) h.Authorization = 'Bearer ' + sk;
  return {
    rpc: (fn: string, args: unknown) => fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: h, body: JSON.stringify(args) }).then((r) => r.json()),
    get: (q: string) => fetch(`${url}/rest/v1/${q}`, { headers: h }).then((r) => r.json()),
    patch: (q: string, body: unknown) => fetch(`${url}/rest/v1/${q}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(body) }),
  };
}

/** Schlüssel holen oder beim ersten Mal erzeugen */
async function keys(sb: ReturnType<typeof db>) {
  const rows = await sb.get('push_keys?id=eq.1&select=token,pub,priv');
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error('push_keys fehlt (Migration 20261026 einspielen)');
  if (row.pub && row.priv) return row as { token: string; pub: string; priv: JsonWebKey };
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pub = b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)));
  // Nur setzen, wenn noch keiner da ist (zwei gleichzeitige Aufrufe)
  await sb.patch('push_keys?id=eq.1&pub=is.null', { pub, priv });
  const again = (await sb.get('push_keys?id=eq.1&select=token,pub,priv'))[0];
  return again as { token: string; pub: string; priv: JsonWebKey };
}

const short = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');

async function sendOne(it: Record<string, any>, k: { pub: string; priv: JsonWebKey }) {
  const ep: string = it.sub && it.sub.endpoint;
  if (!ep || !HOSTS.test(ep)) return 410;
  const kind = String(it.kind);
  const msg = JSON.stringify({ k: kind, t: short(it.title, 120), b: short(it.body, 300), u: short(it.url, 120) });
  const body = await encryptPayload(msg, it.sub.keys.p256dh, it.sub.keys.auth);
  const r = await fetch(ep, {
    method: 'POST',
    body,
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(TTL[kind] || 3600),
      Urgency: kind === 'test' ? 'high' : 'normal',
      Authorization: await vapidAuth(ep, k.priv, k.pub),
    },
  });
  await r.text().catch(() => '');
  return r.status;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Nur POST' });
  let p: Record<string, unknown>;
  try {
    p = await req.json();
  } catch {
    return json(400, { error: 'Ungültiges JSON' });
  }
  const sb = db();
  let k;
  try {
    k = await keys(sb);
  } catch (e) {
    return json(503, { error: String((e as Error)?.message || e) });
  }
  if (p.op === 'key') return json(200, { pub: k.pub });
  if (p.op === 'tick') {
    if (typeof p.token !== 'string' || p.token.length < 20 || p.token !== k.token) return json(401, { error: 'Nicht erlaubt' });
    const due = await sb.rpc('push_due', {});
    if (!Array.isArray(due)) return json(500, { error: 'push_due', detail: due });
    const res = await Promise.all(
      due.map(async (it: Record<string, unknown>) => {
        try {
          const st = await sendOne(it, k);
          if (st === 404 || st === 410) await sb.rpc('push_gone', { p_id: it.device });
          return st;
        } catch {
          return 0;
        }
      }),
    );
    return json(200, { sent: res.filter((s) => s >= 200 && s < 300).length, failed: res.filter((s) => s < 200 || s >= 300).length, status: res });
  }
  return json(400, { error: 'Unbekannte Aktion' });
});
