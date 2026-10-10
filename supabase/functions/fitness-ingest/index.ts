// Supabase Edge Function (Deno): nimmt Tageszusammenfassungen der Fitness-App Overload entgegen.
//
// WICHTIG: Beim Deployen "Verify JWT" AUSSCHALTEN. Overload hat kein Konto in der Study App,
// die Anfrage wird stattdessen über den Verbindungscode im Header x-link-token geprüft.
//
// Anfrage (POST, JSON):  { "days": [ { "date": "2026-10-07", "sessions": 1, "minutes": 55, "kinds": ["gym"], "sleep": 7.5,
//                                      "load": 330, "rpe": 6, "rpeSet": false, "acute": 210.5, "chronic": 180, "ready": true } ] }
// kinds: gym, run, other. sleep: Stunden oder null.
// Belastung (alle freiwillig, ältere Overload-Versionen senden sie nicht): load = Punkte des Tages (Minuten mal Anstrengung),
// rpe = Anstrengung 1 bis 10, rpeSet = vom Nutzer eingestellt (sonst von Overload geschätzt), acute und chronic = 7-Tage- und
// 28-Tage-Mittel in Punkten pro Tag (EWMA), ready = genug Daten für das Verhältnis.
// - Der Code wird nur als SHA-256-Hash mit fitness_links.token_hash verglichen.
// - Höchstens 60 Tage pro Anfrage, Werte werden geprüft und begrenzt.
// - Gespeichert wird nur diese kleine Zusammenfassung (Anzahl, Minuten, Art, Schlaf, Belastung), keine Trainingsdetails.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-link-token, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const KINDS = new Set(['gym', 'run', 'other']);
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const int = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));
/** Zahl zwischen lo und hi (eine Nachkommastelle), sonst null. Auch Texte und NaN werden null. */
const num = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 10) / 10 : null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (req.headers.get('x-link-token') ?? '').trim();
  if (token.length < 20 || token.length > 200) return json({ error: 'unauthorized' }, 401);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: link } = await db
    .from('fitness_links')
    .select('id, user_id')
    .eq('token_hash', await sha256Hex(token))
    .maybeSingle();
  if (!link) return json({ error: 'unauthorized' }, 401);
  // Höchstens 30 Sendungen je Verbindung und Stunde (Overload sendet höchstens alle 2 Minuten und meist viel seltener)
  const { data: allowed } = await db.rpc('rate_hit', { p_key: `fitness:${link.id}`, p_max: 30, p_window_seconds: 3600 });
  if (allowed !== true) return json({ error: 'rate_limited' }, 429);

  let body: { days?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!Array.isArray(body.days) || body.days.length > 60) return json({ error: 'bad_request' }, 400);

  const today = Date.now() + 2 * 86_400_000; // etwas Spielraum für Zeitzonen
  const rows = [];
  for (const d of body.days as Record<string, unknown>[]) {
    if (!d || !isDate(d.date) || Date.parse(d.date) > today) continue;
    const kinds = Array.isArray(d.kinds) ? [...new Set((d.kinds as unknown[]).filter((k) => KINDS.has(String(k))).map(String))] : [];
    rows.push({
      user_id: link.user_id,
      date: d.date,
      sessions: int(d.sessions, 10),
      minutes: int(d.minutes, 600),
      kinds,
      sleep_hours: typeof d.sleep === 'number' && d.sleep > 0 && d.sleep <= 14 ? Math.round(d.sleep * 10) / 10 : null,
      load: num(d.load, 0, 5000) === null ? null : Math.round(Number(d.load)),
      rpe: num(d.rpe, 1, 10),
      rpe_set: typeof d.rpeSet === 'boolean' ? d.rpeSet : null,
      acute_load: num(d.acute, 0, 5000),
      chronic_load: num(d.chronic, 0, 5000),
      load_ready: typeof d.ready === 'boolean' ? d.ready : null,
      source: 'overload',
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length > 0) {
    const { error } = await db.from('fitness_daily').upsert(rows, { onConflict: 'user_id,date' });
    if (error) return json({ error: 'save_failed' }, 500);
  }
  await db.from('fitness_links').update({ last_used_at: new Date().toISOString() }).eq('id', link.id);
  return json({ ok: true, saved: rows.length });
});
