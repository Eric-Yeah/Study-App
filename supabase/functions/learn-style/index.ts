// Supabase Edge Function (Deno): liest den Stil von Aufgabenblättern einer Lehrkraft (Claude Haiku).
//
// - Verify JWT AN. Der Nutzer wird aus dem Token bestimmt, Fach und Bildpfade müssen ihm gehören (Row Level Security).
// - Der API-Schlüssel liegt nur als Secret ANTHROPIC_API_KEY hier, nie im Frontend.
// - Anfrage: { subjectId, teacher?, pages: [{ type: 'text', text } | { type: 'image', path }] } (Bilder im Speicher "exams", Ordner des Nutzers).
//   Antwort: { style, model, usage, budget } oder { error, message } auf Deutsch.
// - Modell: nur Text CONFIG.ai.models.text, mit Bild CONFIG.ai.models.image (beide Haiku, Effort medium über output_config.effort,
//   Antwort als JSON-Schema über output_config.format),
//   kein thinking, temperature, top_p, top_k. Kostengrenze wie bei den anderen Functions (schlimmster Fall vor der Anfrage).
// - Gespeichert wird hier nichts: Die App zeigt den Stil, der Nutzer ändert ihn und speichert (task_styles). Die hochgeladenen
//   Bilder löscht die Function am Ende selbst, auch bei einem Fehler.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { CONFIG } from '../_shared/config.ts';
import { languageRule } from '../_shared/languages.ts';
import { parseStyle, STYLE_SCHEMA, stylePrompt } from '../_shared/taskStyle.ts';
import { chooseModel, costUsd, fitsBudget, imageTokenBound, jpegSize, outputConfig, spentUsd, worstCaseUsd, type WorksheetPage } from '../_shared/worksheets.ts';
import { GateError, openGate, type Gate } from '../_shared/gate.ts';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_PER_PAGE = 20_000;
const MAX_TEXT_TOTAL = 60_000;

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
  bad_request: { status: 400, message: `Die Anfrage war unvollständig. Wähle ein Fach und höchstens ${CONFIG.style.maxPages} Seiten.` },
  unauthorized: { status: 401, message: 'Bitte melde dich neu an.' },
  not_allowed: { status: 403, message: 'Diese KI-Funktion ist für dein Konto nicht freigeschaltet.' },
  busy: { status: 409, message: 'Es läuft gerade schon eine KI-Anfrage. Warte, bis sie fertig ist, und versuche es dann noch einmal.' },
  not_found: { status: 404, message: 'Das Fach oder eine Seite wurde nicht gefunden.' },
  cap_reached: {
    status: 429,
    message: 'Das Monatslimit an KI-Anfragen ist erreicht. Im nächsten Monat geht es wieder.',
  },
  budget_reached: { status: 429, message: 'Das Monatsbudget für die KI reicht dafür nicht mehr. Im nächsten Monat geht es weiter.' },
  billing: {
    status: 402,
    message: 'Das Guthaben für die KI ist aufgebraucht oder das Ausgabenlimit ist erreicht. Bitte in der Anthropic Console aufladen.',
  },
  rate_limit: { status: 429, message: 'Die KI ist gerade ausgelastet. Warte kurz und versuche es noch einmal.' },
  unavailable: { status: 503, message: 'Die KI ist gerade nicht erreichbar. Versuche es später noch einmal.' },
  invalid_json: { status: 502, message: 'Die Antwort der KI konnte nicht gelesen werden. Versuche es noch einmal.' },
  truncated: { status: 502, message: 'Die Antwort der KI wurde abgeschnitten. Lade weniger Seiten hoch und versuche es noch einmal.' },
  refused: { status: 422, message: 'Die KI hat diese Blätter nicht gelesen.' },
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

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Prüft die Seiten: Text oder Bild im Ordner des Nutzers, nicht zu viele, nicht zu lang. */
function parsePages(raw: unknown, userId: string): WorksheetPage[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > CONFIG.style.maxPages) throw new Failure('bad_request');
  const pathPattern = new RegExp(`^${userId}/[0-9a-fA-F-]{36}\\.jpg$`);
  const pages: WorksheetPage[] = [];
  let chars = 0;
  for (const p of raw as Record<string, unknown>[]) {
    if (p?.type === 'text' && typeof p.text === 'string') {
      const text = p.text.slice(0, MAX_TEXT_PER_PAGE);
      chars += text.length;
      pages.push({ type: 'text', text });
    } else if (p?.type === 'image' && typeof p.path === 'string' && pathPattern.test(p.path)) {
      pages.push({ type: 'image', path: p.path });
    } else {
      throw new Failure('bad_request');
    }
  }
  if (chars > MAX_TEXT_TOTAL) throw new Failure('bad_request');
  return pages;
}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'bad_request', message: FAILURES.bad_request.message }, 405);

  let gate: Gate | null = null;

  let cleanup: (() => Promise<void>) | null = null;
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
    gate = await openGate(admin, user.id, 'style', { lock: true }).catch((e) => {
      throw e instanceof GateError ? new Failure(e.code) : e;
    });

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new Failure('bad_request');
    }
    const subjectId = typeof body.subjectId === 'string' ? body.subjectId.slice(0, 100) : '';
    if (!subjectId) throw new Failure('bad_request');
    const teacher = typeof body.teacher === 'string' ? body.teacher.trim().slice(0, 60) : '';
    const pages = parsePages(body.pages, user.id);

    // Die Bilder werden am Ende gelöscht, auch wenn etwas schiefgeht.
    const paths = [...new Set(pages.filter((p) => p.type === 'image').map((p) => (p as { path: string }).path))];
    cleanup = async () => {
      if (paths.length > 0) await userDb.storage.from('exams').remove(paths);
    };

    const { data: subject } = await userDb.from('subjects').select('name, language').eq('id', subjectId).maybeSingle();
    if (!subject) throw new Failure('not_found');

    const system = stylePrompt({
      subjectName: String(subject.name ?? ''),
      teacher,
      languageNote: languageRule(String(subject.language ?? 'de')),
      maxItems: CONFIG.style.maxItems,
    });

    // Inhalt für Claude: Text als Text, Bilder als base64-JPEG
    const content: Record<string, unknown>[] = [];
    let n = 0;
    for (const page of pages) {
      n++;
      if (page.type === 'text') {
        content.push({ type: 'text', text: `Seite ${n} (Text):\n${page.text}` });
      } else {
        const { data: file, error } = await userDb.storage.from('exams').download(page.path);
        if (error || !file) throw new Failure('not_found');
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Failure('bad_request');
        // Obergrenze der Bild-Tokens aus den echten Maßen, für die Kostengrenze (ohne lesbare Maße: Höchstwert)
        page.tokens = imageTokenBound(jpegSize(bytes), CONFIG.ai);
        content.push({ type: 'text', text: `Seite ${n} (Bild):` });
        content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: toBase64(bytes) } });
      }
    }
    content.push({ type: 'text', text: 'Beschreibe den Stil dieser Blätter. Antworte nur mit dem JSON-Objekt.' });

    // ---- Kostengrenze: schlimmster Fall mit echter Prompt-Länge, jeder Seite und voller Ausgabe
    const choice = chooseModel(pages, null, CONFIG.ai.models);
    const month = new Date().toISOString().slice(0, 7);
    const monthSpent = () => gate!.usage();
    const pricing = { ...CONFIG.ai, maxTokens: CONFIG.style.maxTokens, promptOverheadTokens: Math.ceil(system.length / CONFIG.ai.textCharsPerToken) + 30 * pages.length };

    const started = Date.now();
    const seen = { input: 0, output: 0 };
    const writeLog = async (status: string, detail = '') => {
      try {
        await admin.from('ai_log').insert({
          user_id: user.id,
          kind: 'style',
          task: choice.task,
          model: choice.model,
          effort: choice.effort,
          input_tokens: seen.input,
          output_tokens: seen.output,
          cost_usd: costUsd(choice.model, seen.input, seen.output, CONFIG.ai.prices),
          duration_ms: Date.now() - started,
          status,
          note_id: subjectId,
          detail: detail.slice(0, 200),
        });
      } catch (e) {
        console.error('ai_log fehlgeschlagen', e instanceof Error ? e.message : e);
      }
    };

    try {
      const used = await monthSpent();
      if (used.requests >= gate!.requestCap) throw new Failure('cap_reached');
      if (!fitsBudget(used.spent, worstCaseUsd(pages, choice.model, pricing), gate!.budgetUsd)) throw new Failure('budget_reached');

      const post = () =>
        fetch(API_URL, {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: choice.model,
            max_tokens: CONFIG.style.maxTokens,
            system,
            messages: [{ role: 'user', content }],
            output_config: outputConfig(choice.effort, STYLE_SCHEMA), // strukturierte Ausgabe, parseStyle bleibt als Sicherung
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
      const style = parseStyle(raw, CONFIG.style);
      if (!style) throw new Failure('invalid_json');
      await writeLog('ok');
      return json({
        style,
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
    console.error('learn-style', e instanceof Error ? e.message : e);
    return json({ error: 'unavailable', message: FAILURES.unavailable.message }, 503);
  } finally {
    await gate?.end();
    try {
      await cleanup?.();
    } catch (e) {
      console.error('Aufräumen fehlgeschlagen', e instanceof Error ? e.message : e);
    }
  }
});
