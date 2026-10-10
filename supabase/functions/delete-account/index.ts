// Supabase Edge Function (Deno): löscht das eigene Konto mit allen Daten und Dateien.
//
// - Verify JWT AN. Gelöscht wird nur das angemeldete Konto, nie ein anderes.
// - Anfrage: { confirm: 'LÖSCHEN' } (Schutz gegen versehentliche Aufrufe). Antwort: { ok: true } oder { error, message } auf Deutsch.
// - Erst die Dateien in den Speichern (documents, worksheets, exams), dann das Konto. Alle Zeilen hängen mit "on delete cascade" an auth.users.
// - Das Admin-Konto lässt sich so nicht löschen (sonst wäre niemand mehr da, der freigibt).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { removeUserFiles } from '../_shared/userFiles.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'bad_request', message: 'Anfrage nicht erlaubt.' }, 405);
  try {
    const userDb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: auth } = await userDb.auth.getUser();
    if (!auth?.user) return json({ error: 'unauthorized', message: 'Bitte melde dich neu an.' }, 401);
    const userId = auth.user.id;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'bad_request', message: 'Die Anfrage war unvollständig.' }, 400);
    }
    if (body.confirm !== 'LÖSCHEN') return json({ error: 'bad_request', message: 'Bitte bestätige das Löschen.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: account } = await admin.from('accounts').select('is_admin').eq('user_id', userId).maybeSingle();
    if (account?.is_admin) return json({ error: 'not_allowed', message: 'Das Admin-Konto lässt sich hier nicht löschen.' }, 403);

    await removeUserFiles(admin, userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ error: 'unavailable', message: 'Das Konto konnte gerade nicht gelöscht werden. Versuche es später noch einmal.' }, 503);
    return json({ ok: true });
  } catch (e) {
    console.error('delete-account', e instanceof Error ? e.message : e);
    return json({ error: 'unavailable', message: 'Das Konto konnte gerade nicht gelöscht werden. Versuche es später noch einmal.' }, 503);
  }
});
