// Supabase Edge Function (Deno): lädt den Vertretungsplan aus DSBmobile (Heinekingmedia), den viele Schulen statt
// Lanis benutzen.
//
// - Läuft nur für angemeldete, freigegebene Konten (Verify JWT an und zusätzlich getUser, accounts.status = active),
//   höchstens 20 Abrufe je Konto in 10 Minuten (rate_hit), damit die Function nicht zum Durchprobieren von Passwörtern taugt.
// - Die DSB-Zugangsdaten gelten nur für diese Anfrage: nicht gespeichert, nicht geloggt.
// - Anfrage: { dsbUser, dsbPassword }
// - Antwort: { plans: [{ title, html }], updated }  (HTML-Seiten der Pläne im Untis-Aufbau, die App liest sie selbst)
//   Fehler: login_failed (401), dsb_unavailable (502), bad_request (400), not_allowed (403), rate_limited (429)
//
// Protokoll der inoffiziellen "Mobile API" (aus den Bibliotheken dsbapi/dsbuntis): POST app.dsbcontrol.de/JsonHandler.ashx/GetData
// mit { req: { Data: base64(gzip(JSON)), DataType: 1 } }, Antwort { d: base64(gzip(JSON)) } mit Resultcode (0 = in Ordnung)
// und ResultMenuItems, deren Knoten mit "Detail" die Adressen der Pläne enthalten. Die Adressen kommen von DSB und werden
// nur geladen, wenn sie https auf dsbcontrol.de oder heinekingmedia.de sind (kein Zugriff auf beliebige Server).

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const DATA_URL = 'https://app.dsbcontrol.de/JsonHandler.ashx/GetData';
const MAX_PLANS = 8;
const MAX_PAGE_BYTES = 600_000;
const TIMEOUT_MS = 15_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

class DsbError extends Error {
  code: 'login_failed' | 'dsb_unavailable';
  constructor(code: 'login_failed' | 'dsb_unavailable') {
    super(code);
    this.code = code;
  }
}

const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const allowedHost = (host: string) => /(^|\.)dsbcontrol\.de$/i.test(host) || /(^|\.)heinekingmedia\.de$/i.test(host);

/** Alle Knoten mit Detail-Adresse (https, erlaubter Server, .htm oder .html), in der Reihenfolge der Antwort. */
export function collectPlans(node: unknown, out: { title: string; url: string }[] = [], depth = 0): { title: string; url: string }[] {
  if (depth > 12 || node === null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const n of node) collectPlans(n, out, depth + 1);
    return out;
  }
  const o = node as Record<string, unknown>;
  if (typeof o.Detail === 'string') {
    try {
      const u = new URL(o.Detail);
      if (u.protocol === 'https:' && allowedHost(u.hostname) && /\.html?$/i.test(u.pathname) && !/news\.html?$/i.test(u.pathname)) {
        if (!out.some((p) => p.url === u.toString())) out.push({ title: typeof o.Title === 'string' ? o.Title.slice(0, 80) : '', url: u.toString() });
      }
    } catch {
      /* keine gültige Adresse: überspringen */
    }
  }
  for (const v of Object.values(o)) collectPlans(v, out, depth + 1);
  return out;
}

async function getMenu(user: string, password: string): Promise<{ plans: { title: string; url: string }[]; updated: string | null }> {
  const now = new Date().toISOString();
  const params = {
    UserId: user,
    UserPw: password,
    AppVersion: '2.5.9',
    Language: 'de',
    OsVersion: '28 8.0',
    AppId: crypto.randomUUID(),
    Device: 'SM-G930F',
    BundleId: 'de.heinekingmedia.dsbmobile',
    Date: now,
    LastUpdate: now,
  };
  const zipped = await pipe(new TextEncoder().encode(JSON.stringify(params)), new CompressionStream('gzip'));
  let res: Response;
  try {
    res = await fetch(DATA_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ req: { Data: toB64(zipped), DataType: 1 } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new DsbError('dsb_unavailable');
  }
  if (!res.ok) throw new DsbError('dsb_unavailable');
  let data: Record<string, unknown>;
  try {
    const d = ((await res.json()) as { d?: unknown }).d;
    if (typeof d !== 'string') throw new Error('kein d');
    data = JSON.parse(new TextDecoder().decode(await pipe(fromB64(d), new DecompressionStream('gzip'))));
  } catch {
    throw new DsbError('dsb_unavailable');
  }
  if (data.Resultcode !== 0) throw new DsbError('login_failed');
  const plans = collectPlans(data.ResultMenuItems).slice(0, MAX_PLANS);
  return { plans, updated: typeof data.LastUpdate === 'string' ? data.LastUpdate : null };
}

/** Lädt eine Plan-Seite. Zeichensatz aus dem Header, sonst UTF-8; bei kaputten Zeichen Windows-1252 (Untis exportiert oft so). */
async function getPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_PAGE_BYTES) return null;
    const charset = /charset=([\w-]+)/i.exec(res.headers.get('content-type') ?? '')?.[1];
    let text: string;
    try {
      text = new TextDecoder(charset ?? 'utf-8').decode(buf);
    } catch {
      text = new TextDecoder('utf-8').decode(buf);
    }
    if (!charset && text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    return text;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const userDb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: auth } = await userDb.auth.getUser();
  if (!auth?.user) return json({ error: 'unauthorized' }, 401);
  const { data: account } = await userDb.from('accounts').select('status').eq('user_id', auth.user.id).maybeSingle();
  if (account?.status !== 'active') return json({ error: 'not_allowed' }, 403);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: allowed } = await admin.rpc('rate_hit', { p_key: `dsb:${auth.user.id}`, p_max: 20, p_window_seconds: 600 });
  if (allowed !== true) return json({ error: 'rate_limited' }, 429);

  let input: { dsbUser?: unknown; dsbPassword?: unknown };
  try {
    input = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const user = String(input.dsbUser ?? '').trim();
  const password = String(input.dsbPassword ?? '');
  if (!/^[\p{L}\p{N}._@-]{1,64}$/u.test(user) || !password || password.length > 200) return json({ error: 'bad_request' }, 400);

  try {
    const { plans, updated } = await getMenu(user, password);
    const pages = await Promise.all(plans.map(async (p) => ({ title: p.title, html: await getPage(p.url) })));
    const ok = pages.filter((p): p is { title: string; html: string } => p.html !== null);
    if (plans.length > 0 && ok.length === 0) return json({ error: 'dsb_unavailable' }, 502);
    return json({ plans: ok, updated });
  } catch (e) {
    if (e instanceof DsbError) return json({ error: e.code }, e.code === 'login_failed' ? 401 : 502);
    return json({ error: 'dsb_unavailable' }, 502);
  }
});
