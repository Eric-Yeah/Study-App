// Supabase Edge Function (Deno): liest Klausuren, Stundenplan und Vertretungsplan aus Lanis (Schulportal Hessen).
//
// - Läuft nur für angemeldete, freigegebene Konten (Verify JWT an und zusätzlich getUser, accounts.status = active), höchstens
//   20 Abrufe je Konto in 10 Minuten (rate_hit), damit die Function nicht zum Durchprobieren von Schulportal-Passwörtern taugt.
// - Das Schulportal-Passwort wird nur für diese Anfrage verwendet: nicht gespeichert, nicht geloggt.
// - Anfrage: { schoolId, username, password, parts?: ['calendar', 'timetable', 'substitutions', 'absences'] }
// - Antwort: { events, timetableHtml, substitutions, absencesHtml, errors }
//   events: nur Klausur-Einträge mit Id, title, description, start, allDay
//   timetableHtml: nur der Abschnitt "Persönlicher Stundenplan" (nicht der Gesamtplan der Stufe)
//   substitutions: pro Tag die Rohliste von "Mein Vertretungsplan" ([{ date: 'dd.mm.yyyy', raw }])
//   absencesHtml: nur die Anwesenheitstabelle (id="anwesend") von "Mein Unterricht" mit den Fehlstunden je Kurs
//   errors: pro Teil ein Fehlercode, wenn nur dieser Teil nicht gelesen werden konnte
// Ablauf der Anmeldung nach SPHclient (MIT), mit sauber kodiertem Passwort.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UA = 'Lanis-Mobile/v4+SPHClient-ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

class LanisError extends Error {
  code: 'login_failed' | 'lanis_unavailable';
  constructor(code: 'login_failed' | 'lanis_unavailable', message: string) {
    super(message);
    this.code = code;
  }
}

function makeJar() {
  const jar = new Map<string, string>();
  return {
    jar,
    store(res: Response) {
      for (const line of res.headers.getSetCookie()) {
        const [pair] = line.split(';');
        const i = pair.indexOf('=');
        if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    },
    header: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
  };
}

async function login(schoolId: string, username: string, password: string) {
  const c = makeJar();
  const body = new URLSearchParams({ user2: username, user: `${schoolId}.${username}`, password });
  const r1 = await fetch(`https://login.schulportal.hessen.de/?i=${schoolId}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
    body,
  });
  await r1.body?.cancel();
  if (!r1.headers.has('location')) throw new LanisError('login_failed', 'Anmeldung abgelehnt');
  c.store(r1);
  // Weiterleitungen von Hand verfolgen, bis die Sitzung (sid) da ist. Lanis hat hier schon Schritte ergänzt.
  let next = 'https://connect.schulportal.hessen.de';
  for (let hop = 2; hop <= 9 && !c.jar.has('sid'); hop++) {
    const r = await fetch(next, { redirect: 'manual', headers: { cookie: c.header(), 'user-agent': UA } });
    await r.body?.cancel();
    c.store(r);
    const loc = r.headers.get('location');
    if (!loc) break;
    next = new URL(loc, next).toString();
  }
  const sid = c.jar.get('sid');
  if (!sid) throw new LanisError('lanis_unavailable', 'Keine Sitzung erhalten');
  return { sid, cookies: c.header() };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function getCalendar(schoolId: string, sid: string, start: Date, end: Date) {
  const res = await fetch('https://start.schulportal.hessen.de/kalender.php', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'user-agent': UA,
      cookie: `sph-login-upstream=4; schulportal_lastschool=${schoolId}; i=${schoolId}; sid=${sid}`,
    },
    body: new URLSearchParams({ f: 'getEvents', start: iso(start), end: iso(end) }),
  });
  try {
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('keine Liste');
    return data as Record<string, unknown>[];
  } catch {
    throw new LanisError('lanis_unavailable', 'Kalender-Antwort nicht lesbar');
  }
}

const BASE = 'https://start.schulportal.hessen.de';
const sessionCookie = (schoolId: string, sid: string) =>
  `sph-login-upstream=4; schulportal_lastschool=${schoolId}; i=${schoolId}; sid=${sid}`;

/** Nur der persönliche Stundenplan, nicht der Gesamtplan der Stufe (dort stehen alle Kurse). */
async function getTimetableHtml(schoolId: string, sid: string): Promise<string | null> {
  const res = await fetch(`${BASE}/stundenplan.php`, { headers: { 'user-agent': UA, cookie: sessionCookie(schoolId, sid) } });
  const html = await res.text();
  const start = html.indexOf('Persönlicher Stundenplan');
  if (start < 0) return null;
  const tableStart = html.indexOf('<table', start);
  const tableEnd = tableStart < 0 ? -1 : html.indexOf('</table>', tableStart);
  return tableEnd < 0 ? null : html.slice(start, tableEnd + '</table>'.length);
}

/** "Mein Vertretungsplan": Tage aus der Seite, pro Tag die JSON-Liste von vertretungsplan.php?a=my. */
async function getSubstitutions(schoolId: string, sid: string): Promise<{ date: string; raw: unknown }[]> {
  const headers = { 'user-agent': UA, cookie: sessionCookie(schoolId, sid) };
  const page = await (await fetch(`${BASE}/vertretungsplan.php`, { headers })).text();
  const dates = new Set<string>();
  for (const m of page.matchAll(/data-tag="(\d{2})\.(\d{2})\.(\d{4})"/g)) dates.add(`${m[1]}.${m[2]}.${m[3]}`);
  for (const m of page.matchAll(/id="tag(\d{2})_(\d{2})_(\d{4})"/g)) dates.add(`${m[1]}.${m[2]}.${m[3]}`);
  const out: { date: string; raw: unknown }[] = [];
  for (const date of [...dates].slice(0, 8)) {
    const res = await fetch(`${BASE}/vertretungsplan.php?a=my`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ tag: date, ganzerPlan: 'true' }),
    });
    const text = await res.text();
    try {
      out.push({ date, raw: JSON.parse(text) });
    } catch {
      /* kein JSON: Tag überspringen */
    }
  }
  return out;
}

/** Fehlstunden: die Tabelle id="anwesend" auf "Mein Unterricht". Gibt nur dieses Stück Seite zurück (höchstens 200 KB). */
async function getAbsencesHtml(schoolId: string, sid: string): Promise<string | null> {
  const res = await fetch(`${BASE}/meinunterricht.php?cacheBreaker=${Date.now()}`, { headers: { 'user-agent': UA, cookie: sessionCookie(schoolId, sid) } });
  const html = await res.text();
  const at = html.search(/id=["']anwesend["']/i);
  if (at < 0) return null;
  const start = html.lastIndexOf('<', at);
  const tableEnd = html.indexOf('</table>', at);
  if (start < 0 || tableEnd < 0) return null;
  return html.slice(start, tableEnd + '</table>'.length).slice(0, 200_000);
}

async function logout(cookies: string) {
  await fetch('https://start.schulportal.hessen.de/index.php?logout=all', {
    headers: { cookie: cookies, 'user-agent': UA },
  })
    .then((r) => r.body?.cancel())
    .catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Nur angemeldete, freigegebene Konten, mit Grenze je Konto
  const userDb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: auth } = await userDb.auth.getUser();
  if (!auth?.user) return json({ error: 'unauthorized' }, 401);
  const { data: account } = await userDb.from('accounts').select('status').eq('user_id', auth.user.id).maybeSingle();
  if (account?.status !== 'active') return json({ error: 'not_allowed' }, 403);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: allowed } = await admin.rpc('rate_hit', { p_key: `lanis:${auth.user.id}`, p_max: 20, p_window_seconds: 600 });
  if (allowed !== true) return json({ error: 'rate_limited' }, 429);

  let input: { schoolId?: unknown; username?: unknown; password?: unknown; days?: unknown; parts?: unknown };
  try {
    input = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const schoolId = String(input.schoolId ?? '').trim();
  const username = String(input.username ?? '').trim();
  const password = String(input.password ?? '');
  const days = Math.min(400, Math.max(1, Number(input.days) || 200));
  const ALL = ['calendar', 'timetable', 'substitutions', 'absences'];
  const parts = Array.isArray(input.parts) ? ALL.filter((p) => (input.parts as unknown[]).includes(p)) : ALL;
  // schoolId und username landen in URL und Formular: nur erwartete Zeichen zulassen.
  if (!/^\d{1,6}$/.test(schoolId) || !/^[\p{L}\p{N}._-]{1,64}$/u.test(username) || !password || password.length > 200) {
    return json({ error: 'bad_request' }, 400);
  }

  let cookies = '';
  try {
    const session = await login(schoolId, username, password);
    cookies = session.cookies;
    const result: {
      events?: unknown[];
      timetableHtml?: string | null;
      substitutions?: { date: string; raw: unknown }[];
      absencesHtml?: string | null;
      errors: Record<string, string>;
    } = { errors: {} };
    if (parts.includes('calendar')) {
      try {
        const start = new Date();
        const end = new Date(start.getTime() + days * 86_400_000);
        const events = await getCalendar(schoolId, session.sid, start, end);
        result.events = events
          .filter((e) => typeof e.title === 'string' && /\bklausur\b/i.test(e.title))
          .map((e) => ({ Id: e.Id, title: e.title, description: e.description, start: e.start, allDay: e.allDay }));
      } catch {
        result.errors.calendar = 'lanis_unavailable';
      }
    }
    if (parts.includes('timetable')) {
      try {
        result.timetableHtml = await getTimetableHtml(schoolId, session.sid);
        if (result.timetableHtml === null) result.errors.timetable = 'not_found';
      } catch {
        result.errors.timetable = 'lanis_unavailable';
      }
    }
    if (parts.includes('substitutions')) {
      try {
        result.substitutions = await getSubstitutions(schoolId, session.sid);
      } catch {
        result.errors.substitutions = 'lanis_unavailable';
      }
    }
    if (parts.includes('absences')) {
      try {
        result.absencesHtml = await getAbsencesHtml(schoolId, session.sid);
        if (result.absencesHtml === null) result.errors.absences = 'not_found';
      } catch {
        result.errors.absences = 'lanis_unavailable';
      }
    }
    // Nur wenn gar nichts gelesen werden konnte, ist die Anfrage insgesamt fehlgeschlagen.
    if (parts.length > 0 && Object.keys(result.errors).length === parts.length) return json({ error: 'lanis_unavailable' }, 502);
    return json(result);
  } catch (e) {
    if (e instanceof LanisError) return json({ error: e.code }, e.code === 'login_failed' ? 401 : 502);
    return json({ error: 'lanis_unavailable' }, 502);
  } finally {
    if (cookies) await logout(cookies);
  }
});
