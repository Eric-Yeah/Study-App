// Supabase Edge Function (Deno): fasst Arbeitsblätter (Text und Bilder) mit Claude zusammen.
//
// - Verify JWT AN. Der Nutzer wird aus dem Token bestimmt, Notiz und Bildpfade müssen ihm gehören.
// - Der API-Schlüssel liegt nur als Secret ANTHROPIC_API_KEY hier, nie im Frontend.
// - Anfrage: { lessonNoteId, pages: [{type:'text', text} | {type:'image', path}], forceEffort?: 'medium' | 'high' }
// - Antwort: { summary, effort, model, retried, usage: { input_tokens, output_tokens }, budget } oder { error, message } auf Deutsch.
// - Kostengrenze: Vor jeder Anfrage wird der schlimmste Fall (geschätzte Eingabe plus volle Ausgabe) zu den bisherigen
//   Monatskosten gerechnet. Passt das nicht mehr in CONFIG.ai.monthlyBudgetUsd, wird nichts an Claude geschickt.
// - Zahlen (Tokens, Limits, Preise) stehen in CONFIG.ai (../_shared/config.ts, Kopie aus packages/core: npm run sync:shared).
// - Modelle je Aufgabe aus CONFIG.ai.models: nur Text und Bild nehmen Haiku, bei Lesbarkeit "unsicher" und bei "Genauer lesen"
//   Sonnet. Effort über output_config.effort, die Antwort als JSON-Schema über output_config.format (strukturierte Ausgabe).
//   Kein thinking-Parameter (das Denken zählt zu max_tokens), und kein temperature,
//   top_p oder top_k. Der Verbrauch wird je Modell in ai_usage gezählt, die Kostengrenze rechnet mit dem Preis des Modells.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { CONFIG } from '../_shared/config.ts';
import { languageRule } from '../_shared/languages.ts';
import {
  chooseModel,
  costUsd,
  escalationChoice,
  fitsBudget,
  imageTokenBound,
  jpegSize,
  outputConfig,
  parseSummary,
  SUMMARY_SCHEMA,
  shouldEscalate,
  spentUsd,
  summaryPrompt,
  worstCaseUsd,
  type ModelChoice,
  type WorksheetPage,
  type WorksheetSummary,
} from '../_shared/worksheets.ts';
import { GateError, openGate, type Gate } from '../_shared/gate.ts';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_PER_PAGE = 20_000;
const MAX_TEXT_TOTAL = 80_000;

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
  bad_request: { status: 400, message: 'Die Anfrage war unvollständig. Bitte versuche es noch einmal.' },
  unauthorized: { status: 401, message: 'Bitte melde dich neu an.' },
  not_allowed: { status: 403, message: 'Diese KI-Funktion ist für dein Konto nicht freigeschaltet.' },
  busy: { status: 409, message: 'Es läuft gerade schon eine KI-Anfrage. Warte, bis sie fertig ist, und versuche es dann noch einmal.' },
  not_found: { status: 404, message: 'Die Notiz oder ein Bild wurde nicht gefunden.' },
  cap_reached: {
    status: 429,
    message: 'Das Monatslimit an KI-Anfragen ist erreicht. Im nächsten Monat geht es wieder.',
  },
  budget_reached: {
    status: 429,
    message: 'Das Monatsbudget für die KI ist aufgebraucht. Im nächsten Monat geht es weiter.',
  },
  billing: {
    status: 402,
    message: 'Das Guthaben für die KI ist aufgebraucht oder das Ausgabenlimit ist erreicht. Bitte in der Anthropic Console aufladen.',
  },
  rate_limit: { status: 429, message: 'Die KI ist gerade ausgelastet. Warte kurz und versuche es noch einmal.' },
  unavailable: { status: 503, message: 'Die KI ist gerade nicht erreichbar. Versuche es später noch einmal.' },
  invalid_json: { status: 502, message: 'Die Antwort der KI konnte nicht gelesen werden. Versuche es noch einmal.' },
  truncated: {
    status: 502,
    message: 'Die Antwort der KI wurde abgeschnitten, weil das Blatt zu viel Inhalt hat. Lade weniger Seiten auf einmal hoch.',
  },
  refused: { status: 422, message: 'Die KI hat dieses Blatt nicht zusammengefasst.' },
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

function parsePages(raw: unknown, userId: string): WorksheetPage[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > CONFIG.ai.maxPagesPerUpload) throw new Failure('bad_request');
  const pathPattern = new RegExp(`^${userId}/[0-9a-fA-F-]{36}\\.jpg$`);
  const pages: WorksheetPage[] = [];
  let chars = 0;
  let images = 0;
  for (const p of raw as Record<string, unknown>[]) {
    if (p && p.type === 'text' && typeof p.text === 'string') {
      const text = p.text.slice(0, MAX_TEXT_PER_PAGE);
      chars += text.length;
      pages.push({ type: 'text', text });
    } else if (p && p.type === 'image' && typeof p.path === 'string' && pathPattern.test(p.path)) {
      images++;
      pages.push({ type: 'image', path: p.path });
    } else {
      throw new Failure('bad_request');
    }
  }
  if (chars > MAX_TEXT_TOTAL || images > CONFIG.ai.maxImagesPerRequest) throw new Failure('bad_request');
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
  // Guthaben leer: laut Doku 402 billing_error. Ältere Antworten und eingestellte Ausgabenlimits kommen als 400.
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

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Failure('not_configured');

    // Nutzer aus dem Token. Alle Lesezugriffe laufen mit seinem Token, damit Row Level Security greift.
    const authorization = req.headers.get('Authorization') ?? '';
    const userDb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: auth } = await userDb.auth.getUser();
    const user = auth?.user;
    if (!user) throw new Failure('unauthorized');
    // Der Zähler wird nur mit dem Service-Schlüssel geschrieben, Nutzer können ihn nicht ändern.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });
    gate = await openGate(admin, user.id, 'summarize', { lock: true }).catch((e) => {
      throw e instanceof GateError ? new Failure(e.code) : e;
    });

    let body: { lessonNoteId?: unknown; pages?: unknown; forceEffort?: unknown };
    try {
      body = await req.json();
    } catch {
      throw new Failure('bad_request');
    }
    const lessonNoteId = typeof body.lessonNoteId === 'string' ? body.lessonNoteId : '';
    if (!lessonNoteId || lessonNoteId.length > 100) throw new Failure('bad_request');
    const pages = parsePages(body.pages, user.id);

    const { data: note } = await userDb.from('lesson_notes').select('id, subject_id').eq('id', lessonNoteId).maybeSingle();
    if (!note) throw new Failure('not_found');
    // Unterrichtssprache des Fachs: Englisch bei Englisch und bilingualen Fächern, usw. (ohne Fach: Deutsch)
    let language = 'de';
    if (note.subject_id) {
      const { data: subject } = await userDb.from('subjects').select('language').eq('id', note.subject_id).maybeSingle();
      if (subject?.language) language = String(subject.language);
    }
    const systemPrompt = summaryPrompt(CONFIG.ai.summaryLimits, languageRule(language));

    // Jedes Bild muss zu dieser Notiz gehören (worksheet_files), nicht nur zum Nutzer.
    const paths = [...new Set(pages.filter((p) => p.type === 'image').map((p) => (p as { path: string }).path))];
    if (paths.length > 0) {
      const { data: linked } = await userDb
        .from('worksheet_files')
        .select('storage_path')
        .eq('lesson_note_id', lessonNoteId)
        .in('storage_path', paths);
      if ((linked?.length ?? 0) !== paths.length) throw new Failure('not_found');
    }

    const month = new Date().toISOString().slice(0, 7);
    const monthSpent = () => gate!.usage();
    // Vor jeder Anfrage: teuerster möglicher Preis mit dem Modell dieser Anfrage (geschätzte Eingabe plus volle Ausgabe)
    const checkBudget = async (model: string) => {
      const used = await monthSpent();
      if (used.requests >= gate!.requestCap) throw new Failure('cap_reached');
      if (!fitsBudget(used.spent, worstCaseUsd(pages, model, CONFIG.ai), gate!.budgetUsd)) throw new Failure('budget_reached');
    };

    // Inhalt für Claude: pro Seite eine Beschriftung, Bilder als base64-JPEG.
    const content: Record<string, unknown>[] = [];
    let n = 0;
    for (const page of pages) {
      n++;
      if (page.type === 'text') {
        content.push({ type: 'text', text: `Seite ${n} (Text):\n${page.text}` });
      } else {
        const { data: file, error } = await userDb.storage.from('worksheets').download(page.path);
        if (error || !file) throw new Failure('not_found');
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Failure('bad_request');
        // Obergrenze der Bild-Tokens aus den echten Maßen, für die Kostengrenze (ohne lesbare Maße: Höchstwert)
        page.tokens = imageTokenBound(jpegSize(bytes), CONFIG.ai);
        content.push({ type: 'text', text: `Seite ${n} (Bild):` });
        content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: toBase64(bytes) } });
      }
    }
    content.push({ type: 'text', text: 'Fasse dieses Arbeitsblatt zusammen. Antworte nur mit dem JSON-Objekt.' });

    let usageIn = 0;
    let usageOut = 0;

    const askInner = async (choice: ModelChoice, seen: { input: number; output: number }): Promise<WorksheetSummary> => {
      const post = () =>
        fetch(API_URL, {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: choice.model,
            max_tokens: CONFIG.ai.maxTokens,
            system: systemPrompt,
            messages: [{ role: 'user', content }],
            // Strukturierte Ausgabe: Claude antwortet sicher in der Form des Schemas, parseSummary bleibt als Sicherung
            output_config: outputConfig(choice.effort, SUMMARY_SCHEMA),
          }),
        });

      await checkBudget(choice.model);
      let res: Response;
      try {
        res = await post();
        if (res.status === 429) {
          // Einmal mit Wartezeit wiederholen (retry-after, höchstens 10 Sekunden).
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
      const input = Number(data?.usage?.input_tokens ?? 0);
      const output = Number(data?.usage?.output_tokens ?? 0);
      usageIn += input;
      usageOut += output;
      seen.input = input;
      seen.output = output;
      // Nach jeder Anfrage mitzählen, auch wenn die Antwort danach nicht lesbar ist.
      const { error: usageError } = await admin.rpc('ai_usage_add', { p_user: user.id, p_month: month, p_model: choice.model, p_input: input, p_output: output });
      if (usageError) console.error('ai_usage_add fehlgeschlagen', usageError.message);

      if (data?.stop_reason === 'max_tokens') throw new Failure('truncated');
      if (data?.stop_reason === 'refusal') throw new Failure('refused');
      const text = (Array.isArray(data?.content) ? data.content : [])
        .filter((b: { type?: string }) => b?.type === 'text')
        .map((b: { text?: string }) => b.text ?? '')
        .join('\n');
      const summary = parseSummary(text);
      if (!summary) throw new Failure('invalid_json');
      return summary;
    };

    // Protokoll für das Admin-Protokoll: nur Zahlen und Fehlercodes, nie Inhalte. Ein Fehler beim Schreiben stört nichts.
    const ask = async (choice: ModelChoice): Promise<WorksheetSummary> => {
      const started = Date.now();
      const seen = { input: 0, output: 0 };
      const writeLog = async (status: string, detail = '') => {
        try {
          await admin.from('ai_log').insert({
            user_id: user.id,
            kind: 'summarize',
            task: choice.task,
            model: choice.model,
            effort: choice.effort,
            input_tokens: seen.input,
            output_tokens: seen.output,
            cost_usd: costUsd(choice.model, seen.input, seen.output, CONFIG.ai.prices),
            duration_ms: Date.now() - started,
            status,
            note_id: lessonNoteId,
            detail: detail.slice(0, 200),
          });
        } catch (e) {
          console.error('ai_log fehlgeschlagen', e instanceof Error ? e.message : e);
        }
      };
      try {
        const summary = await askInner(choice, seen);
        await writeLog(summary.lesbarkeit === 'unsicher' ? 'unsicher' : 'ok');
        return summary;
      } catch (e) {
        await writeLog(e instanceof Failure ? e.code : 'error', e instanceof Error ? e.message : '');
        throw e;
      }
    };

    let choice = chooseModel(pages, body.forceEffort, CONFIG.ai.models);
    let summary = await ask(choice);
    let retried = false;

    // Unsicher gelesen: einmal automatisch mit dem Modell der Eskalation (stärker), außer es war schon die Eskalation.
    // Nur mit CONFIG.ai.autoEscalate (Standard aus, spart Kosten): sonst macht der Knopf "Genauer lesen" das auf Wunsch.
    if (CONFIG.ai.autoEscalate && shouldEscalate(summary.lesbarkeit, choice)) {
      try {
        const stronger = escalationChoice(CONFIG.ai.models);
        summary = await ask(stronger);
        choice = stronger;
        retried = true;
      } catch (e) {
        // Der zweite Versuch scheitert (zum Beispiel Limit): das erste Ergebnis bleibt, ist ja lesbar markiert.
        console.error('Wiederholung mit dem stärkeren Modell fehlgeschlagen', e instanceof Error ? e.message : e);
      }
    }

    const after = await monthSpent();
    return json({
      summary,
      effort: choice.effort,
      model: choice.model,
      retried,
      usage: { input_tokens: usageIn, output_tokens: usageOut },
      budget: { spentUsd: after.spent, budgetUsd: gate!.budgetUsd },
    });
  } catch (e) {
    if (e instanceof Failure) return json({ error: e.code, message: e.message }, FAILURES[e.code].status);
    console.error('summarize-worksheet', e instanceof Error ? e.message : e);
    return json({ error: 'unavailable', message: FAILURES.unavailable.message }, 503);
  } finally {
    await gate?.end();
  }
});
