// Supabase Edge Function (Deno): lädt einen Kalender-Link (iCal-Abo, .ics) für den Stundenplan im Studium.
//
// - Läuft nur für angemeldete, freigegebene Konten (Verify JWT an und zusätzlich getUser, accounts.status = active),
//   höchstens 30 Abrufe je Konto in 10 Minuten (rate_hit).
// - Der Link gilt nur für diese Anfrage: nicht gespeichert, nicht geloggt (bei Moodle und anderen Systemen enthält er einen
//   geheimen Schlüssel). Er liegt verschlüsselt nur auf dem Gerät des Nutzers.
// - Anfrage: { url }. Antwort: { bytes } (die Datei als base64, die App dekodiert UTF-8 und UTF-16 selbst).
//   Fehler: bad_request (400, mit reason), blocked (400), unavailable (502), too_big (413), not_calendar (422),
//   unauthorized (401), not_allowed (403), rate_limited (429)
//
// Schutz vor Zugriffen auf interne Server (SSRF): nur https auf Port 443, keine Zugangsdaten in der Adresse, keine IP-Adressen
// und keine internen Namen (checkIcalUrl). Vor jedem Abruf wird der Rechnername aufgelöst, und jede Adresse davon muss öffentlich
// sein (isPrivateIp). Weiterleitungen folgt die Function selbst (höchstens 3) und prüft jede neue Adresse genauso.
// Antwort höchstens 2 MB, Zeitgrenze 10 Sekunden. Rest-Risiko: Zwischen Namensauflösung und Abruf kann ein Angreifer mit eigenem
// Namensserver die Adresse wechseln (DNS-Rebinding), weil Deno den Abruf nicht an die geprüfte Adresse binden lässt. Die Antwort
// muss außerdem mit einem Kalender beginnen, anderes gibt die Function nicht heraus.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { checkIcalUrl, isPrivateIp } from '../_shared/icalUrl.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

class FetchError extends Error {
  code: 'blocked' | 'unavailable' | 'too_big' | 'not_calendar';
  constructor(code: FetchError['code']) {
    super(code);
    this.code = code;
  }
}

/** Alle Adressen eines Rechnernamens (A und AAAA). Keine Adresse oder eine nicht öffentliche: blocked. */
async function assertPublicHost(host: string): Promise<void> {
  const found: string[] = [];
  for (const type of ['A', 'AAAA'] as const) {
    try {
      found.push(...((await Deno.resolveDns(host, type)) as string[]));
    } catch {
      // keine Einträge dieser Art
    }
  }
  if (found.length === 0 || found.some(isPrivateIp)) throw new FetchError('blocked');
}

const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Beginnt der Inhalt mit einem Kalender? (auch UTF-16: Nullbytes und Byte-Order-Mark werden übersprungen) */
export function looksLikeCalendar(bytes: Uint8Array): boolean {
  const head = Array.from(bytes.subarray(0, 400))
    .filter((b) => b !== 0 && b !== 0xff && b !== 0xfe && b !== 0xef && b !== 0xbb && b !== 0xbf)
    .map((b) => String.fromCharCode(b))
    .join('');
  return /^\s*BEGIN:VCALENDAR/i.test(head);
}

async function readLimited(res: Response): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) throw new FetchError('unavailable');
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new FetchError('too_big');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

async function load(start: string): Promise<Uint8Array> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = checkIcalUrl(current);
    if (!check.ok) throw new FetchError('blocked');
    await assertPublicHost(check.host);
    let res: Response;
    try {
      res = await fetch(check.url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.1', 'User-Agent': 'StudyApp-Calendar/1.0' },
      });
    } catch {
      throw new FetchError('unavailable');
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new FetchError('unavailable');
      try {
        current = new URL(loc, check.url).toString();
      } catch {
        throw new FetchError('unavailable');
      }
      await res.body?.cancel();
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new FetchError('unavailable');
    }
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) throw new FetchError('too_big');
    const bytes = await readLimited(res);
    if (!looksLikeCalendar(bytes)) throw new FetchError('not_calendar');
    return bytes;
  }
  throw new FetchError('unavailable'); // zu viele Weiterleitungen
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
  const { data: allowed } = await admin.rpc('rate_hit', { p_key: `ical:${auth.user.id}`, p_max: 30, p_window_seconds: 600 });
  if (allowed !== true) return json({ error: 'rate_limited' }, 429);

  let input: { url?: unknown };
  try {
    input = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const check = checkIcalUrl(typeof input.url === 'string' ? input.url : '');
  if (!check.ok) return json({ error: 'bad_request', reason: check.reason }, 400);

  try {
    const bytes = await load(check.url);
    return json({ bytes: toB64(bytes) });
  } catch (e) {
    if (e instanceof FetchError) {
      const status = e.code === 'blocked' ? 400 : e.code === 'too_big' ? 413 : e.code === 'not_calendar' ? 422 : 502;
      return json({ error: e.code }, status);
    }
    return json({ error: 'unavailable' }, 502);
  }
});
