// Supabase Edge Function (Deno): schlägt die Themenliste einer Klausur aus den Notizen vor (Claude Haiku).
//
// - Verify JWT AN. Der Nutzer wird aus dem Token bestimmt, Klausur und Notizen müssen ihm gehören (Row Level Security).
// - Der API-Schlüssel liegt nur als Secret ANTHROPIC_API_KEY hier, nie im Frontend.
// - Anfrage: { examId, noteIds: string[], existing?: string[] }. Antwort: { topics: [{ title, sources }], notes: [{ id, title }], model, usage, budget }
//   oder { error, message } auf Deutsch. "sources" sind Nummern ab 1 in der Reihenfolge von "notes".
// - Modell: CONFIG.ai.models.text (Haiku, Effort medium über output_config.effort, Antwort als JSON-Schema über
//   output_config.format), kein thinking, temperature, top_p, top_k.
// - Kostengrenze wie bei den anderen Functions: vor der Anfrage der schlimmste Fall mit dem Preis des Modells (CONFIG.ai).
// - Gespeichert wird hier nichts: Die App legt die Themen erst an, wenn der Nutzer sie abhakt.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { CONFIG } from '../_shared/config.ts';
import { languageRule } from '../_shared/languages.ts';
import { parseTopics, TOPICS_SCHEMA, topicsMaterial, topicsPrompt } from '../_shared/topics.ts';
import { costUsd, fitsBudget, outputConfig, spentUsd, worstCaseUsd, type ModelChoice } from '../_shared/worksheets.ts';
import { GateError, openGate, type Gate } from '../_shared/gate.ts';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'not_allowed'
  | 'busy'
  | 'not_found'
  | 'cap_reached'
  | 'budget_reached'
  | 'billing'
  | 'rate_limit'
  | 'unavailable'
  | 'invalid_json'
  | 'truncated'
  | 'refused'
  | 'not_configured'
  | 'request_failed';

const FAILURES: Record<ErrorCode, { status: number; message: string }> = {
  bad_request: { status: 400, message: 'Die Anfrage war unvollständig. Wähle mindestens eine Notiz.' },
  unauthorized: { status: 401, message: 'Bitte melde dich neu an.' },
  not_allowed: { status: 403, message: 'Diese KI-Funktion ist für dein Konto nicht freigeschaltet.' },
  busy: { status: 409, message: 'Es läuft gerade schon eine KI-Anfrage. Warte, bis sie fertig ist, und versuche es dann noch einmal.' },
  not_found: { status: 404, message: 'Die Klausur wurde nicht gefunden.' },
  cap_reached: {
    status: 429,
    message: 'Das Monatslimit an KI-Anfragen ist erreicht. Im nächsten Monat geht es wieder.',
  },
  budget_reached: { status: 429, message: 'Das Monatsbudget für die KI ist aufgebraucht. Im nächsten Monat geht es weiter.' },
  billing: {
    status: 402,
    message: 'Das Guthaben für die KI ist aufgebraucht oder das Ausgabenlimit ist erreicht. Bitte in der Anthropic Console aufladen.',
  },
  rate_limit: { status: 429, message: 'Die KI ist gerade ausgelastet. Warte kurz und versuche es noch einmal.' },
  unavailable: { status: 503, message: 'Die KI ist gerade nicht erreichbar. Versuche es später noch einmal.' },
  invalid_json: { status: 502, message: 'Die Antwort der KI konnte nicht gelesen werden. Versuche es noch einmal.' },
  truncated: { status: 502, message: 'Die Antwort der KI wurde abgeschnitten. Wähle weniger Notizen und versuche es noch einmal.' },
  refused: { status: 422, message: 'Die KI hat keine Themen vorgeschlagen.' },
  not_configured: { status: 500, message: 'Die KI ist auf dem Server noch nicht eingerichtet (ANTHROPIC_API_KEY fehlt).' },
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Rechnet einen Fehler der Claude-API in einen Fehlercode um. */
async function failureFrom(res: Response): Promise<Failure> {
  let type = '';
  let message = '';
  try {
    const body = await res.json();
    type = String(body?.error?.type ?? '');
    message = String(body?.error?.message ?? '');
  } catch {
    /* kein JSON */
  }
  if (res.status === 402 || type === 'billing_error' || (res.status === 400 && /credit balance|billing|spend limit/i.test(message))) {
    return new Failure('billing');
  }
  if (res.status === 429) return new Failure('rate_limit');
  if (res.status === 529 || res.status >= 500) return new Failure('unavailable');
  return new Failure('request_failed', message.slice(0, 200) || `HTTP ${res.status}`);
}

const strings = (v: unknown, max: number, chars: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max).map((x) => x.trim().slice(0, chars)).filter(Boolean) : [];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'bad_request', message: FAILURES.bad_request.message }, 405);

  let gate: Gate | null = null;

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Failure('not_configured');

    const authorization = req.headers.get('Authorization') ?? '';
    const userDb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: auth } = await userDb.auth.getUser();
    const user = auth?.user;
    if (!user) throw new Failure('unauthorized');
    // Zähler und Protokoll schreibt nur der Service-Schlüssel.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });
    gate = await openGate(admin, user.id, 'topics', { lock: true }).catch((e) => {
      throw e instanceof GateError ? new Failure(e.code) : e;
    });

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new Failure('bad_request');
    }
    const examId = typeof body.examId === 'string' ? body.examId.slice(0, 100) : '';
    const noteIds = strings(body.noteIds, CONFIG.topics.maxNotes, 100);
    if (!examId || noteIds.length === 0) throw new Failure('bad_request');
    const existing = strings(body.existing, 60, CONFIG.topics.maxTitleChars);

    const { data: exam } = await userDb.from('exams').select('id, title, subject_id').eq('id', examId).maybeSingle();
    if (!exam) throw new Failure('not_found');
    const { data: subject } = await userDb.from('subjects').select('name, language').eq('id', exam.subject_id).maybeSingle();

    // Notizen: nur die gewählten, älteste zuerst (so kamen sie im Unterricht dran)
    const { data: noteData } = await userDb.from('lesson_notes').select('id, title, lesson_date, summary').in('id', noteIds);
    const notes = ((noteData ?? []) as { id: string; title: string; lesson_date: string; summary: Record<string, unknown> | null }[]).sort((a, b) =>
      String(a.lesson_date).localeCompare(String(b.lesson_date)),
    );
    if (notes.length === 0) throw new Failure('bad_request');
    const material = topicsMaterial(notes.map((n) => ({ title: String(n.title ?? ''), lessonDate: String(n.lesson_date ?? ''), summary: n.summary })), CONFIG.topics.maxMaterialChars);

    const system = topicsPrompt({
      subjectName: String(subject?.name ?? ''),
      examTitle: String(exam.title ?? ''),
      material,
      existing,
      min: CONFIG.topics.minSuggestions,
      max: CONFIG.topics.maxSuggestions,
      maxTitleChars: CONFIG.topics.maxTitleChars,
      languageRule: languageRule(String(subject?.language ?? 'de')),
    });
    const userText = 'Schlage die Themenliste vor. Antworte nur mit dem JSON-Objekt.';

    // ---- Kostengrenze: schlimmster Fall mit echter Prompt-Länge und voller Ausgabe
    const month = new Date().toISOString().slice(0, 7);
    const monthSpent = () => gate!.usage();
    const pricing = { ...CONFIG.ai, maxTokens: CONFIG.topics.maxTokens, promptOverheadTokens: Math.ceil((system.length + userText.length) / CONFIG.ai.textCharsPerToken) + 50 };
    const choice: ModelChoice = { task: 'text', ...CONFIG.ai.models.text };
    const used = await monthSpent();

    const started = Date.now();
    const seen = { input: 0, output: 0 };
    const writeLog = async (status: string, detail = '') => {
      try {
        await admin.from('ai_log').insert({
          user_id: user.id,
          kind: 'topics',
          task: choice.task,
          model: choice.model,
          effort: choice.effort,
          input_tokens: seen.input,
          output_tokens: seen.output,
          cost_usd: costUsd(choice.model, seen.input, seen.output, CONFIG.ai.prices),
          duration_ms: Date.now() - started,
          status,
          note_id: examId,
          detail: detail.slice(0, 200),
        });
      } catch (e) {
        console.error('ai_log fehlgeschlagen', e instanceof Error ? e.message : e);
      }
    };

    try {
      if (used.requests >= gate!.requestCap) throw new Failure('cap_reached');
      if (!fitsBudget(used.spent, worstCaseUsd([], choice.model, pricing), gate!.budgetUsd)) throw new Failure('budget_reached');

      const post = () =>
        fetch(API_URL, {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: choice.model,
            max_tokens: CONFIG.topics.maxTokens,
            system,
            messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
            output_config: outputConfig(choice.effort, TOPICS_SCHEMA), // strukturierte Ausgabe, parseTopics bleibt als Sicherung
          }),
        });
      let res: Response;
      try {
        res = await post();
        if (res.status === 429) {
          const wait = Number(res.headers.get('retry-after'));
          await res.body?.cancel();
          await sleep(Math.min(Math.max(Number.isFinite(wait) && wait > 0 ? wait : 3, 1), 10) * 1000);
          res = await post();
        }
      } catch {
        throw new Failure('unavailable');
      }
      if (!res.ok) throw await failureFrom(res);

      const data = await res.json();
      seen.input = Number(data?.usage?.input_tokens ?? 0);
      seen.output = Number(data?.usage?.output_tokens ?? 0);
      const { error: usageError } = await admin.rpc('ai_usage_add', { p_user: user.id, p_month: month, p_model: choice.model, p_input: seen.input, p_output: seen.output });
      if (usageError) console.error('ai_usage_add fehlgeschlagen', usageError.message);

      if (data?.stop_reason === 'max_tokens') throw new Failure('truncated');
      if (data?.stop_reason === 'refusal') throw new Failure('refused');
      const raw = (Array.isArray(data?.content) ? data.content : [])
        .filter((b: { type?: string }) => b?.type === 'text')
        .map((b: { text?: string }) => b.text ?? '')
        .join('\n');
      // Die Quellen zählen nur bis zur Zahl der Notizen, die wirklich im Prompt standen
      const sent = Math.max(0, ...material.split('\n').flatMap((l) => (/^(\d+)\. /.test(l) ? [Number(l.match(/^(\d+)\. /)![1])] : [])));
      const topics = parseTopics(raw, sent, existing, CONFIG.topics.maxSuggestions, CONFIG.topics.maxTitleChars);
      if (!topics) throw new Failure('invalid_json');
      await writeLog('ok');
      return json({
        topics,
        notes: notes.map((n) => ({ id: n.id, title: String(n.title ?? '') })),
        model: choice.model,
        usage: { input_tokens: seen.input, output_tokens: seen.output },
        budget: { spentUsd: (await monthSpent()).spent, budgetUsd: gate!.budgetUsd },
      });
    } catch (e) {
      await writeLog(e instanceof Failure ? e.code : 'error', e instanceof Error ? e.message : '');
      throw e;
    }
  } catch (e) {
    if (e instanceof Failure) return json({ error: e.code, message: e.message }, FAILURES[e.code].status);
    console.error('suggest-topics', e instanceof Error ? e.message : e);
    return json({ error: 'unavailable', message: FAILURES.unavailable.message }, 503);
  } finally {
    await gate?.end();
  }
});
