// Supabase Edge Function (Deno): erstellt Karteikarten aus der Zusammenfassung einer Notiz mit Groq (kostenloser Tarif).
//
// - Verify JWT AN. Der Nutzer wird aus dem Token bestimmt, die Notiz muss ihm gehören (Row Level Security).
// - Der API-Schlüssel liegt nur als Secret GROQ_API_KEY hier, nie im Frontend.
// - Anfrage: { noteId: string, existingFronts?: string[], difficulty?: 1 | 2 | 3 | 4 }  (ohne difficulty: gemischt)
// - Antwort: { cards: [{front, back, difficulty}], model } oder { error, message } auf Deutsch.
// - Zahlen (Modell, Grenzen) stehen in CONFIG.cardsAi (../_shared/config.ts, Kopie aus packages/core: npm run sync:shared).
// - Nur für Konten mit freigeschalteten KI-Karten (accounts, _shared/gate.ts), Freunde mit Tageslimit (app_settings.cards_daily_limit).
// - Sprache der Karten: Unterrichtssprache des Fachs der Notiz (subjects.language)
// - Es geht nur die Zusammenfassung der Notiz an Groq (kein Bild, keine Dateien, keine Namen).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { CARDS_SCHEMA, cardsPrompt, cardsUserContent, hasCardContent, parseGeneratedCards, type CardDifficulty, type NoteForCards } from '../_shared/cardsAi.ts';
import { CONFIG } from '../_shared/config.ts';
import { GateError, openGate } from '../_shared/gate.ts';
import { languageRule } from '../_shared/languages.ts';

const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ErrorCode = 'bad_request' | 'unauthorized' | 'not_allowed' | 'daily_limit' | 'not_found' | 'no_content' | 'rate_limit' | 'bad_key' | 'unavailable' | 'invalid_json' | 'truncated' | 'not_configured' | 'request_failed';

const FAILURES: Record<ErrorCode, { status: number; message: string }> = {
  bad_request: { status: 400, message: 'Die Anfrage war unvollständig. Bitte versuche es noch einmal.' },
  unauthorized: { status: 401, message: 'Bitte melde dich neu an.' },
  not_allowed: { status: 403, message: 'Diese KI-Funktion ist für dein Konto nicht freigeschaltet.' },
  daily_limit: { status: 429, message: 'Für heute sind die KI-Karten aufgebraucht. Morgen geht es wieder.' },
  not_found: { status: 404, message: 'Die Notiz wurde nicht gefunden.' },
  no_content: { status: 422, message: 'Diese Notiz hat noch zu wenig Inhalt für Karten. Es braucht eine Zusammenfassung mit mindestens zwei Einträgen.' },
  rate_limit: { status: 429, message: 'Das kostenlose Limit von Groq ist für den Moment erreicht. Warte kurz oder versuche es später noch einmal.' },
  bad_key: { status: 502, message: 'Der Groq-Schlüssel auf dem Server wird nicht angenommen. Bitte den Schlüssel in Supabase prüfen.' },
  unavailable: { status: 503, message: 'Die KI ist gerade nicht erreichbar. Versuche es später noch einmal.' },
  invalid_json: { status: 502, message: 'Die Antwort der KI konnte nicht gelesen werden. Versuche es noch einmal.' },
  truncated: { status: 502, message: 'Die Antwort der KI wurde abgeschnitten. Versuche es noch einmal.' },
  not_configured: { status: 500, message: 'Die KI-Karten sind auf dem Server noch nicht eingerichtet (GROQ_API_KEY fehlt).' },
  request_failed: { status: 502, message: 'Die KI hat die Anfrage nicht angenommen.' },
};

class Failure extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, detail?: string) {
    super(FAILURES[code].message + (detail ? ` (${detail})` : ''));
    this.code = code;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'bad_request', message: FAILURES.bad_request.message }, 405);

  try {
    const apiKey = Deno.env.get('GROQ_API_KEY');
    if (!apiKey) throw new Failure('not_configured');

    const authorization = req.headers.get('Authorization') ?? '';
    const userDb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: auth } = await userDb.auth.getUser();
    if (!auth?.user) throw new Failure('unauthorized');
    const userId = auth.user.id;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const gate = await openGate(admin, userId, 'cards').catch((e) => {
      throw e instanceof GateError ? new Failure(e.code === 'busy' ? 'rate_limit' : 'not_allowed') : e;
    });
    // Freunde: Tageslimit je Konto, damit niemand das kostenlose Kontingent von Groq für alle aufbraucht (app_settings.cards_daily_limit)
    if (!gate.isAdmin) {
      const { data: s } = await admin.from('app_settings').select('cards_daily_limit').eq('id', 1).maybeSingle();
      const set = Number(s?.cards_daily_limit);
      const limit = Number.isFinite(set) && set >= 0 ? set : CONFIG.access.cardsDailyLimit;
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      const { count } = await admin.from('ai_log').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'cards').eq('status', 'ok').gte('at', since.toISOString());
      if ((count ?? 0) >= limit) throw new Failure('daily_limit');
    }

    let body: { noteId?: unknown; existingFronts?: unknown; difficulty?: unknown };
    try {
      body = await req.json();
    } catch {
      throw new Failure('bad_request');
    }
    const noteId = typeof body.noteId === 'string' ? body.noteId : '';
    if (!noteId || noteId.length > 100) throw new Failure('bad_request');
    const existing = Array.isArray(body.existingFronts) ? body.existingFronts.filter((x): x is string => typeof x === 'string').slice(0, CONFIG.cardsAi.maxExistingFronts) : [];

    const wanted = [1, 2, 3, 4].includes(body.difficulty as number) ? (body.difficulty as CardDifficulty) : null;

    const { data: row } = await userDb.from('lesson_notes').select('title, summary, subject_id').eq('id', noteId).maybeSingle();
    if (!row) throw new Failure('not_found');
    // Unterrichtssprache des Fachs: die Karten kommen in dieser Sprache (Englisch bei Englisch und bilingualen Fächern)
    let language = 'de';
    if (row.subject_id) {
      const { data: subject } = await userDb.from('subjects').select('language').eq('id', row.subject_id).maybeSingle();
      if (subject?.language) language = String(subject.language);
    }
    const note: NoteForCards = { title: String(row.title ?? ''), summary: row.summary ?? null };
    if (!hasCardContent(note)) throw new Failure('no_content');

    // Protokoll für das Admin-Protokoll: nur Zahlen und Fehlercodes, nie Inhalte. Ein Fehler beim Schreiben stört nichts.
    const started = Date.now();
    const seen = { input: 0, output: 0 };
    let outcome = 'ok';
    const writeLog = async () => {
      try {
        await admin
          .from('ai_log')
          .insert({
            user_id: userId,
            kind: 'cards',
            task: 'cards',
            model: CONFIG.cardsAi.model,
            effort: 'low',
            input_tokens: seen.input,
            output_tokens: seen.output,
            cost_usd: 0, // kostenloser Tarif bei Groq
            duration_ms: Date.now() - started,
            status: outcome,
            note_id: noteId,
            detail: '',
          });
      } catch (e) {
        console.error('ai_log fehlgeschlagen', e instanceof Error ? e.message : e);
      }
    };

    try {
      return await callGroq();
    } catch (e) {
      outcome = e instanceof Failure ? e.code : 'error';
      throw e;
    } finally {
      await writeLog();
    }

    async function callGroq(): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: CONFIG.cardsAi.model,
          messages: [
            { role: 'system', content: cardsPrompt(CONFIG.cardsAi.maxCards, wanted, languageRule(language)) },
            { role: 'user', content: cardsUserContent(note, existing, CONFIG.cardsAi) },
          ],
          response_format: { type: 'json_schema', json_schema: { name: 'flashcards', strict: true, schema: CARDS_SCHEMA } },
          temperature: 0.3,
          reasoning_effort: 'low',
          max_completion_tokens: CONFIG.cardsAi.maxTokens,
        }),
      });
    } catch {
      throw new Failure('unavailable');
    }
    if (res.status === 429) throw new Failure('rate_limit');
    if (res.status === 401 || res.status === 403) throw new Failure('bad_key');
    if (res.status >= 500) throw new Failure('unavailable');
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        detail = String((await res.json())?.error?.message ?? detail).slice(0, 200);
      } catch {
        /* kein JSON */
      }
      throw new Failure('request_failed', detail);
    }

    const data = await res.json();
    seen.input = Number(data?.usage?.prompt_tokens ?? 0);
    seen.output = Number(data?.usage?.completion_tokens ?? 0);
    const choice = data?.choices?.[0];
    if (choice?.finish_reason === 'length') throw new Failure('truncated');
    const cards = parseGeneratedCards(String(choice?.message?.content ?? ''), CONFIG.cardsAi, wanted);
    if (!cards) throw new Failure('invalid_json');
    return json({ cards, model: CONFIG.cardsAi.model });
    }
  } catch (e) {
    if (e instanceof Failure) return json({ error: e.code, message: e.message }, FAILURES[e.code].status);
    console.error('generate-cards', e instanceof Error ? e.message : e);
    return json({ error: 'unavailable', message: FAILURES.unavailable.message }, 503);
  }
});
