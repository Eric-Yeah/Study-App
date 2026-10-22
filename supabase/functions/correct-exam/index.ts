// Supabase Edge Function (Deno): korrigiert Klausuren mit Claude und lernt aus der Korrektur der Lehrkraft.
//
// - Verify JWT AN. Der Nutzer wird aus dem Token bestimmt, Korrektur und Bildpfade müssen ihm gehören.
// - Der API-Schlüssel liegt nur als Secret ANTHROPIC_API_KEY hier, nie im Frontend.
// - mode 'grade': { reviewId, pages: [{type:'text', text, role} | {type:'image', path, role}], compare?: boolean }
//   Rollen: aufgabe, loesung, erwartung. Antwort: { main: { model, effort, result }, compare, compareError, usage, budget }.
//   Das Korrekturmuster entsteht aus Fach (Name, Typ, Sprache), Vorgaben der Lehrkraft und Erfahrungen (subject_rubrics),
//   der Erwartungshorizont als Text kommt aus exam_reviews.horizon_text. Die Note rechnet die App (gradeExam).
//   compare: dieselbe Klausur zusätzlich mit CONFIG.exam.compareModel, um Modelle zu vergleichen. Scheitert das, bleibt main.
// - mode 'learn': { reviewId, pages: [... role 'korrigiert'] } vergleicht die gespeicherte KI-Korrektur mit der Korrektur der
//   Lehrkraft. Antwort: { learn: { teacherPoints, tasks, lessons } }. Gespeichert wird erst, wenn der Nutzer bestätigt.
// - Kostengrenze wie bei summarize-worksheet: vor jeder Anfrage der schlimmste Fall mit dem Preis des Modells (CONFIG.ai).
//   Modell CONFIG.ai.models.exam, Effort über output_config.effort, Antwort als JSON-Schema über output_config.format,
//   kein thinking, temperature, top_p oder top_k.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { CONFIG } from '../_shared/config.ts';
import {
  EXAM_PAGE_ROLES,
  EXAM_RESULT_SCHEMA,
  LEARN_SCHEMA,
  defaultRubric,
  examLanguageNote,
  examPrompt,
  gradeExam,
  learnPrompt,
  lessonsFor,
  parseExamResult,
  parseLearn,
  resultDigest,
  type ExamPage,
  type ExamPageRole,
  type ExamResult,
  type Lesson,
} from '../_shared/examGrading.ts';
import { costUsd, fitsBudget, imageTokenBound, jpegSize, outputConfig, worstCaseUsd, type ModelChoice } from '../_shared/worksheets.ts';
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
  | 'not_graded'
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
  bad_request: { status: 400, message: `Die Anfrage war unvollständig. Höchstens ${CONFIG.exam.maxPages} Seiten pro Korrektur.` },
  unauthorized: { status: 401, message: 'Bitte melde dich neu an.' },
  not_allowed: { status: 403, message: 'Diese KI-Funktion ist für dein Konto nicht freigeschaltet.' },
  busy: { status: 409, message: 'Es läuft gerade schon eine KI-Anfrage. Warte, bis sie fertig ist, und versuche es dann noch einmal.' },
  not_found: { status: 404, message: 'Die Korrektur oder eine Seite wurde nicht gefunden.' },
  not_graded: { status: 409, message: 'Diese Klausur wurde noch nicht von der KI korrigiert.' },
  cap_reached: {
    status: 429,
    message: 'Das Monatslimit an KI-Anfragen ist erreicht. Im nächsten Monat geht es wieder.',
  },
  budget_reached: {
    status: 429,
    message: 'Das Monatsbudget für die KI reicht für diese Klausur nicht mehr. Im nächsten Monat geht es weiter, oder lade weniger Seiten hoch.',
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
    message: 'Die Antwort der KI wurde abgeschnitten, weil die Klausur zu lang ist. Lade weniger Seiten auf einmal hoch.',
  },
  refused: { status: 422, message: 'Die KI hat diese Klausur nicht korrigiert.' },
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

const ROLE_LABEL: Record<ExamPageRole, string> = {
  aufgabe: 'AUFGABE',
  loesung: 'LÖSUNG',
  erwartung: 'ERWARTUNG',
  korrigiert: 'KORRIGIERT',
};

function parsePages(raw: unknown, userId: string, allowed: readonly ExamPageRole[]): ExamPage[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > CONFIG.exam.maxPages) throw new Failure('bad_request');
  const pathPattern = new RegExp(`^${userId}/[0-9a-fA-F-]{36}\\.jpg$`);
  const pages: ExamPage[] = [];
  let chars = 0;
  for (const p of raw as Record<string, unknown>[]) {
    const role = p?.role as ExamPageRole;
    if (!EXAM_PAGE_ROLES.includes(role) || !allowed.includes(role)) throw new Failure('bad_request');
    if (p.type === 'text' && typeof p.text === 'string') {
      const text = p.text.slice(0, MAX_TEXT_PER_PAGE);
      chars += text.length;
      pages.push({ type: 'text', text, role });
    } else if (p.type === 'image' && typeof p.path === 'string' && pathPattern.test(p.path)) {
      pages.push({ type: 'image', path: p.path, role });
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
    // Zähler und Protokoll schreibt nur der Service-Schlüssel.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });
    gate = await openGate(admin, user.id, 'correct', { lock: true }).catch((e) => {
      throw e instanceof GateError ? new Failure(e.code) : e;
    });

    let body: { mode?: unknown; reviewId?: unknown; pages?: unknown; compare?: unknown };
    try {
      body = await req.json();
    } catch {
      throw new Failure('bad_request');
    }
    const mode = body.mode === 'learn' ? 'learn' : body.mode === 'grade' ? 'grade' : null;
    const reviewId = typeof body.reviewId === 'string' ? body.reviewId : '';
    if (!mode || !reviewId || reviewId.length > 100) throw new Failure('bad_request');
    const pages = parsePages(body.pages, user.id, mode === 'learn' ? ['korrigiert'] : ['aufgabe', 'loesung', 'erwartung']);

    const { data: review } = await userDb
      .from('exam_reviews')
      .select('id, subject_id, teacher, max_points, horizon_text, result')
      .eq('id', reviewId)
      .maybeSingle();
    if (!review) throw new Failure('not_found');

    // Fach: Name und Typ bestimmen das Korrekturmuster, die Sprache den Hinweis zur Rückmeldung
    let subject = { name: '', type: 'knowledge', language: 'de' };
    let teacherText = '';
    let lessons: Lesson[] = [];
    if (review.subject_id) {
      const { data: s } = await userDb.from('subjects').select('name, type, language').eq('id', review.subject_id).maybeSingle();
      if (s) subject = { name: String(s.name ?? ''), type: String(s.type ?? 'knowledge'), language: String(s.language ?? 'de') };
      const { data: rubricRow } = await userDb.from('subject_rubrics').select('teacher_text, lessons').eq('subject_id', review.subject_id).maybeSingle();
      if (rubricRow) {
        teacherText = String(rubricRow.teacher_text ?? '').slice(0, CONFIG.exam.maxTeacherTextChars);
        lessons = Array.isArray(rubricRow.lessons) ? (rubricRow.lessons as Lesson[]).filter((l) => l && typeof l.text === 'string') : [];
      }
    }
    const rubric = defaultRubric(subject.name, subject.type);
    const languageNote = examLanguageNote(subject.language);
    const teacher = String(review.teacher ?? '');

    // Jedes Bild muss zu dieser Korrektur gehören (exam_files), nicht nur zum Nutzer.
    const paths = [...new Set(pages.filter((p) => p.type === 'image').map((p) => (p as { path: string }).path))];
    if (paths.length > 0) {
      const { data: linked } = await userDb.from('exam_files').select('storage_path').eq('review_id', reviewId).in('storage_path', paths);
      if ((linked?.length ?? 0) !== paths.length) throw new Failure('not_found');
    }

    // Prompt und Seiten je nach Modus
    let system: string;
    let maxTokens: number;
    const allPages: ExamPage[] = [...pages];
    const intro: string[] = [];
    if (mode === 'grade') {
      const horizon = String(review.horizon_text ?? '').trim().slice(0, CONFIG.exam.maxHorizonChars);
      if (horizon) allPages.push({ type: 'text', text: horizon, role: 'erwartung' });
      const maxPoints = review.max_points === null || review.max_points === undefined ? null : Number(review.max_points);
      system = examPrompt({
        subjectName: subject.name,
        rubric,
        teacherText,
        lessons: lessonsFor(lessons, teacher, CONFIG.exam.maxLessons),
        hasHorizon: allPages.some((p) => p.role === 'erwartung'),
        maxPoints: maxPoints && Number.isFinite(maxPoints) ? maxPoints : null,
        languageNote,
      });
      maxTokens = CONFIG.exam.maxTokens;
    } else {
      const stored = (review.result as { main?: { result?: ExamResult } } | null)?.main?.result;
      if (!stored || !Array.isArray(stored.aufgaben)) throw new Failure('not_graded');
      const points = gradeExam(stored, rubric.scheme, CONFIG.exam).points;
      intro.push(`Korrektur der KI:\n${resultDigest(stored, points)}`);
      system = learnPrompt({
        subjectName: subject.name,
        existing: lessonsFor(lessons, teacher, CONFIG.exam.maxLessons),
        maxNew: CONFIG.exam.maxNewLessons,
        maxChars: CONFIG.exam.maxLessonChars,
        languageNote,
      });
      maxTokens = CONFIG.exam.learnMaxTokens;
    }

    const month = new Date().toISOString().slice(0, 7);
    const monthSpent = () => gate!.usage();
    // Schlimmster Fall: System-Prompt nach Zeichen, jede Seite (Bild mit Höchstwert), volle Ausgabe
    const pricing = {
      ...CONFIG.ai,
      maxTokens,
      promptOverheadTokens: Math.ceil((system.length + intro.join('').length) / CONFIG.ai.textCharsPerToken) + 30 * allPages.length,
    };
    const checkBudget = async (model: string) => {
      const used = await monthSpent();
      if (used.requests >= gate!.requestCap) throw new Failure('cap_reached');
      if (!fitsBudget(used.spent, worstCaseUsd(allPages, model, pricing), gate!.budgetUsd)) throw new Failure('budget_reached');
    };

    // Inhalt für Claude: Seiten nach Rolle geordnet und beschriftet, Bilder als base64-JPEG
    const order: ExamPageRole[] = ['aufgabe', 'erwartung', 'loesung', 'korrigiert'];
    const content: Record<string, unknown>[] = intro.map((text) => ({ type: 'text', text }));
    for (const role of order) {
      let n = 0;
      for (const page of allPages.filter((p) => p.role === role)) {
        n++;
        if (page.type === 'text') {
          content.push({ type: 'text', text: `${ROLE_LABEL[role]} Seite ${n} (Text):\n${page.text}` });
        } else {
          const { data: file, error } = await userDb.storage.from('exams').download(page.path);
          if (error || !file) throw new Failure('not_found');
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Failure('bad_request');
          // Obergrenze der Bild-Tokens aus den echten Maßen, für die Kostengrenze (ohne lesbare Maße: Höchstwert)
          page.tokens = imageTokenBound(jpegSize(bytes), CONFIG.ai);
          content.push({ type: 'text', text: `${ROLE_LABEL[role]} Seite ${n} (Bild):` });
          content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: toBase64(bytes) } });
        }
      }
    }
    content.push({
      type: 'text',
      text: mode === 'grade' ? 'Korrigiere diese Klausur. Antworte nur mit dem JSON-Objekt.' : 'Vergleiche und antworte nur mit dem JSON-Objekt.',
    });

    let usageIn = 0;
    let usageOut = 0;

    const askInner = async (choice: ModelChoice, seen: { input: number; output: number }): Promise<string> => {
      const post = () =>
        fetch(API_URL, {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: choice.model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: 'user', content }],
            // Strukturierte Ausgabe nach dem Schema des Modus, die Parser bleiben als Sicherung
            output_config: outputConfig(choice.effort, mode === 'grade' ? EXAM_RESULT_SCHEMA : LEARN_SCHEMA),
          }),
        });

      await checkBudget(choice.model);
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
      const input = Number(data?.usage?.input_tokens ?? 0);
      const output = Number(data?.usage?.output_tokens ?? 0);
      usageIn += input;
      usageOut += output;
      seen.input = input;
      seen.output = output;
      const { error: usageError } = await admin.rpc('ai_usage_add', { p_user: user.id, p_month: month, p_model: choice.model, p_input: input, p_output: output });
      if (usageError) console.error('ai_usage_add fehlgeschlagen', usageError.message);

      if (data?.stop_reason === 'max_tokens') throw new Failure('truncated');
      if (data?.stop_reason === 'refusal') throw new Failure('refused');
      return (Array.isArray(data?.content) ? data.content : [])
        .filter((b: { type?: string }) => b?.type === 'text')
        .map((b: { text?: string }) => b.text ?? '')
        .join('\n');
    };

    // Protokoll für das Admin-Protokoll: nur Zahlen und Fehlercodes, nie Inhalte.
    const ask = async <T>(choice: ModelChoice, parse: (raw: string) => T | null, status: (value: T) => string): Promise<T> => {
      const started = Date.now();
      const seen = { input: 0, output: 0 };
      const writeLog = async (s: string, detail = '') => {
        try {
          await admin.from('ai_log').insert({
            user_id: user.id,
            kind: mode === 'grade' ? 'exam' : 'exam_learn',
            task: choice.task,
            model: choice.model,
            effort: choice.effort,
            input_tokens: seen.input,
            output_tokens: seen.output,
            cost_usd: costUsd(choice.model, seen.input, seen.output, CONFIG.ai.prices),
            duration_ms: Date.now() - started,
            status: s,
            note_id: reviewId,
            detail: detail.slice(0, 200),
          });
        } catch (e) {
          console.error('ai_log fehlgeschlagen', e instanceof Error ? e.message : e);
        }
      };
      try {
        const value = parse(await askInner(choice, seen));
        if (value === null) throw new Failure('invalid_json');
        await writeLog(status(value));
        return value;
      } catch (e) {
        await writeLog(e instanceof Failure ? e.code : 'error', e instanceof Error ? e.message : '');
        throw e;
      }
    };

    const main: ModelChoice = { task: 'exam', ...CONFIG.ai.models.exam };
    const budget = async () => ({ spentUsd: (await monthSpent()).spent, budgetUsd: gate!.budgetUsd });

    if (mode === 'learn') {
      const learn = await ask(main, (raw) => parseLearn(raw, CONFIG.exam.maxNewLessons, CONFIG.exam.maxLessonChars), () => 'ok');
      return json({ learn, model: main.model, usage: { input_tokens: usageIn, output_tokens: usageOut }, budget: await budget() });
    }

    const graded = (r: ExamResult) => (r.lesbarkeit === 'unsicher' ? 'unsicher' : 'ok');
    const result = await ask(main, parseExamResult, graded);
    const at = new Date().toISOString();
    let compare: { model: string; effort: string; at: string; result: ExamResult } | null = null;
    let compareError = '';
    if (body.compare === true) {
      const second: ModelChoice = { task: 'exam', ...CONFIG.exam.compareModel };
      try {
        compare = { model: second.model, effort: second.effort, at, result: await ask(second, parseExamResult, graded) };
      } catch (e) {
        // Der Vergleich ist freiwillig: scheitert er (zum Beispiel Budget), bleibt die Korrektur gültig.
        compareError = e instanceof Error ? e.message : 'Vergleich fehlgeschlagen';
      }
    }
    return json({
      main: { model: main.model, effort: main.effort, at, result },
      compare,
      compareError,
      usage: { input_tokens: usageIn, output_tokens: usageOut },
      budget: await budget(),
    });
  } catch (e) {
    if (e instanceof Failure) return json({ error: e.code, message: e.message }, FAILURES[e.code].status);
    console.error('correct-exam', e instanceof Error ? e.message : e);
    return json({ error: 'unavailable', message: FAILURES.unavailable.message }, 503);
  } finally {
    await gate?.end();
  }
});
