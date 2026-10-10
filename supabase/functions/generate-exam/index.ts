// Supabase Edge Function (Deno): erstellt Übungsklausuren mit Claude, in zwei Schritten (eine Function läuft höchstens etwa 150 Sekunden).
//
// - Verify JWT AN. Der Nutzer wird aus dem Token bestimmt, alle Lesezugriffe laufen mit seinem Token (Row Level Security).
// - Der API-Schlüssel liegt nur als Secret ANTHROPIC_API_KEY hier, nie im Frontend.
// - mode 'exam': { practiceId, subjectId, level, noteIds, topic, teacher, durationMin? } erstellt die Klausur (Material und Aufgaben).
//   Aufbau und Stil: Fach (Name, Typ, Sprache, Kurs), Zusammenfassungen der gewählten Notizen als Unterrichtsmaterial, Vorgaben der
//   Lehrkraft und Erfahrungen (subject_rubrics), gelernter Stil der Aufgabenblätter (task_styles), Profil der echten Klausuren des Fachs (exam_reviews ohne practice_id), Rückmeldung und
//   Ergebnisse früherer Übungsklausuren der Stufe. Antwort: { exam, meta, model, usage, budget }.
// - mode 'solutions': { practiceId, subjectId, exam } schreibt Erwartungshorizont und Musterlösung zu der fertigen Klausur.
//   Antwort: { solutions, model, usage, budget }. Die App fügt beides zusammen und speichert (applySolutions).
// - Kostengrenze wie bei den anderen Functions: vor jeder Anfrage der schlimmste Fall mit dem Preis des Modells (CONFIG.ai).
//   Modell CONFIG.ai.models.exam, Effort über output_config.effort, kein thinking, temperature, top_p oder top_k.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { CONFIG } from '../_shared/config.ts';
import { defaultRubric } from '../_shared/examGrading.ts';
import { languageRule } from '../_shared/languages.ts';
import {
  afbTarget,
  defaultsFor,
  difficultyShift,
  examProfile,
  isLevel,
  parsePractice,
  parseSolutions,
  practicePlainText,
  practicePrompt,
  solutionsPrompt,
  type Level,
  type PracticeMeta,
  type PracticeOutcome,
  type ProfileInput,
} from '../_shared/practiceExam.ts';
import { sanitizeStyle, styleForPrompt, type StyleSample } from '../_shared/taskStyle.ts';
import { costUsd, fitsBudget, spentUsd, worstCaseUsd, type ModelChoice } from '../_shared/worksheets.ts';
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
  bad_request: { status: 400, message: 'Die Anfrage war unvollständig. Bitte versuche es noch einmal.' },
  unauthorized: { status: 401, message: 'Bitte melde dich neu an.' },
  not_allowed: { status: 403, message: 'Diese KI-Funktion ist für dein Konto nicht freigeschaltet.' },
  busy: { status: 409, message: 'Es läuft gerade schon eine KI-Anfrage. Warte, bis sie fertig ist, und versuche es dann noch einmal.' },
  not_found: { status: 404, message: 'Das Fach wurde nicht gefunden.' },
  cap_reached: {
    status: 429,
    message: 'Das Monatslimit an KI-Anfragen ist erreicht. Im nächsten Monat geht es wieder.',
  },
  budget_reached: {
    status: 429,
    message: 'Das Monatsbudget für die KI reicht für diese Übungsklausur nicht mehr. Im nächsten Monat geht es weiter.',
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
    message: 'Die Antwort der KI wurde abgeschnitten, weil die Klausur zu lang wurde. Wähle weniger Material oder ein engeres Thema.',
  },
  refused: { status: 422, message: 'Die KI hat diese Übungsklausur nicht erstellt.' },
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

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();

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

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strings = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : []);

interface ReviewRow {
  id: string;
  teacher: string | null;
  practice_id: string | null;
  result: { main?: { result?: { aufgaben?: ProfileInput['aufgaben'] } } } | null;
}

/** Die Aufgaben einer gespeicherten Korrektur, nur wenn sie sinnvoll aussehen. */
function tasksOf(row: ReviewRow): ProfileInput['aufgaben'] | null {
  const list = row.result?.main?.result?.aufgaben;
  if (!Array.isArray(list)) return null;
  const ok = list.filter((a) => a && typeof a.max === 'number' && typeof a.punkte === 'number' && typeof a.operator === 'string');
  return ok.length > 0 ? ok : null;
}

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
    gate = await openGate(admin, user.id, 'practice', { lock: true }).catch((e) => {
      throw e instanceof GateError ? new Failure(e.code) : e;
    });

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new Failure('bad_request');
    }
    const mode = body.mode === 'solutions' ? 'solutions' : body.mode === 'exam' ? 'exam' : null;
    const practiceId = text(body.practiceId, 100);
    const subjectId = text(body.subjectId, 100);
    if (!mode || !practiceId || !subjectId) throw new Failure('bad_request');

    const { data: subject } = await userDb.from('subjects').select('name, type, language, is_advanced').eq('id', subjectId).maybeSingle();
    if (!subject) throw new Failure('not_found');
    const subjectName = String(subject.name ?? '');
    const rubric = defaultRubric(subjectName, String(subject.type ?? 'knowledge'));
    const languageNote = languageRule(String(subject.language ?? 'de'));
    const criteria = rubric.criteria.map((c) => `${c.name}: ${c.detail}`);

    const { data: rubricRow } = await userDb.from('subject_rubrics').select('teacher_text, lessons').eq('subject_id', subjectId).maybeSingle();
    const teacherText = String(rubricRow?.teacher_text ?? '').slice(0, CONFIG.exam.maxTeacherTextChars);
    const teacherName = text(body.teacher, 60);

    // ---- Anfrage vorbereiten: System-Prompt, Eingabe und Grenzen je Modus
    let system: string;
    let maxTokens: number;
    let userText: string;
    let meta: PracticeMeta | null = null;

    if (mode === 'exam') {
      const level: Level | null = isLevel(body.level) ? body.level : null;
      if (!level) throw new Failure('bad_request');
      const noteIds = strings(body.noteIds, CONFIG.practice.maxNotes);
      const topic = text(body.topic, CONFIG.practice.maxTopicChars);
      const defaults = defaultsFor(subject.is_advanced === true, CONFIG.practice);
      const asked = Number(body.durationMin);
      const durationMin = Number.isFinite(asked) && asked >= 20 && asked <= 300 ? Math.round(asked) : defaults.durationMin;

      // Unterrichtsmaterial: die Zusammenfassungen der gewählten Notizen, älteste zuerst
      let materialText = '';
      if (noteIds.length > 0) {
        const { data: notes } = await userDb.from('lesson_notes').select('id, title, lesson_date, summary').in('id', noteIds);
        const rows = ((notes ?? []) as { id: string; title: string; lesson_date: string; summary: Record<string, unknown> | null }[]).sort((a, b) =>
          String(a.lesson_date).localeCompare(String(b.lesson_date)),
        );
        const parts: string[] = [];
        for (const n of rows) {
          const s = n.summary ?? {};
          const lines = [`- ${text(n.title, 120)} (${text(n.lesson_date, 10)})`];
          const thema = text(s.thema, 140);
          if (thema) lines.push(`  Thema: ${thema}`);
          for (const [label, key] of [['Kernaussagen', 'kernaussagen'], ['Begriffe', 'begriffe'], ['Formeln', 'formeln'], ['Offene Fragen', 'offene_fragen']] as const) {
            const items = strings(s[key], 12).map((x) => x.slice(0, 220));
            if (items.length > 0) lines.push(`  ${label}: ${items.join('; ')}`);
          }
          parts.push(lines.join('\n'));
        }
        materialText = parts.join('\n').slice(0, CONFIG.practice.maxMaterialChars);
      }

      // Profil der echten Klausuren und Rückmeldung zu früheren Übungsklausuren dieses Fachs
      const { data: reviewData } = await userDb.from('exam_reviews').select('id, teacher, practice_id, result').eq('subject_id', subjectId);
      const reviews = (reviewData ?? []) as ReviewRow[];
      let real = reviews.filter((r) => !r.practice_id && tasksOf(r));
      const sameTeacher = teacherName ? real.filter((r) => fold(r.teacher ?? '') === fold(teacherName)) : [];
      if (sameTeacher.length >= 2) real = sameTeacher; // bei dieser Lehrkraft zählen nur ihre Klausuren
      const profile = real.length >= CONFIG.practice.minRealForProfile ? examProfile(real.map((r) => ({ aufgaben: tasksOf(r)! }))) : null;

      const { data: practiceData } = await userDb.from('practice_exams').select('id, difficulty, rating, created_at').eq('subject_id', subjectId);
      const percentOf = new Map<string, number>();
      for (const r of reviews) {
        const tasks = r.practice_id ? tasksOf(r) : null;
        if (!tasks) continue;
        const max = tasks.reduce((s, a) => s + a.max, 0);
        if (max > 0) percentOf.set(r.practice_id!, (tasks.reduce((s, a) => s + a.punkte, 0) / max) * 100);
      }
      const outcomes: PracticeOutcome[] = ((practiceData ?? []) as { id: string; difficulty: string; rating: number | null; created_at: string }[])
        .filter((p) => isLevel(p.difficulty))
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .map((p) => ({ difficulty: p.difficulty as Level, rating: typeof p.rating === 'number' ? p.rating : null, percent: percentOf.get(p.id) ?? null }));

      const shift = difficultyShift(outcomes, level, profile?.avgPercent ?? null, CONFIG.practice);
      const afb = afbTarget(profile?.afb ?? CONFIG.practice.afbDefault, CONFIG.practice.levelStep[level] + shift, CONFIG.practice.afbShiftPerStep);
      const totalBe = profile ? Math.min(150, Math.max(20, Math.round(profile.avgPoints))) : defaults.totalBe;
      // Stil der echten Aufgabenblätter (task_styles): die Blätter der Lehrkraft, sonst die übrigen des Fachs
      const { data: styleData } = await userDb.from('task_styles').select('teacher, style, created_at').eq('subject_id', subjectId);
      const samples: StyleSample[] = ((styleData ?? []) as { teacher: string | null; style: unknown; created_at: string | null }[]).map((r) => ({
        teacher: String(r.teacher ?? ''),
        style: sanitizeStyle(r.style, CONFIG.style),
        createdAt: String(r.created_at ?? ''),
      }));
      const styled = styleForPrompt(samples, teacherName, CONFIG.style);
      meta = { difficulty: level, profileN: profile?.n ?? 0, shift, afb, totalBe, styleN: styled.used };

      system = practicePrompt({
        subjectName,
        family: rubric.family,
        criteria,
        teacherText,
        lessons: [], // Erfahrungen betreffen die Bewertung und gehen in die Korrektur, nicht in die Aufgabenstellung
        materialText,
        topic,
        difficulty: level,
        afb,
        totalBe,
        durationMin,
        profile,
        languageNote,
        isAdvanced: subject.is_advanced === true,
        styleLines: styled.lines,
      });
      maxTokens = CONFIG.practice.maxTokens;
      userText = 'Erstelle die Übungsklausur. Antworte nur mit dem JSON-Objekt.';
    } else {
      const exam = parsePractice(JSON.stringify(body.exam ?? null), CONFIG.practice.limits);
      if (!exam) throw new Failure('bad_request');
      system = solutionsPrompt({ subjectName, family: rubric.family, criteria, teacherText, examText: practicePlainText(exam, 60_000).join('\n\n'), languageNote });
      maxTokens = CONFIG.practice.solutionsMaxTokens;
      userText = 'Schreibe Erwartungshorizont und Musterlösung. Antworte nur mit dem JSON-Objekt.';
    }

    // ---- Kostengrenze: schlimmster Fall mit echter Prompt-Länge und voller Ausgabe
    const month = new Date().toISOString().slice(0, 7);
    const monthSpent = () => gate!.usage();
    const pricing = { ...CONFIG.ai, maxTokens, promptOverheadTokens: Math.ceil((system.length + userText.length) / CONFIG.ai.textCharsPerToken) + 50 };
    const choice: ModelChoice = { task: 'exam', ...CONFIG.ai.models.exam };
    const used = await monthSpent();

    const started = Date.now();
    const seen = { input: 0, output: 0 };
    const writeLog = async (status: string, detail = '') => {
      try {
        await admin.from('ai_log').insert({
          user_id: user.id,
          kind: 'practice',
          task: mode,
          model: choice.model,
          effort: choice.effort,
          input_tokens: seen.input,
          output_tokens: seen.output,
          cost_usd: costUsd(choice.model, seen.input, seen.output, CONFIG.ai.prices),
          duration_ms: Date.now() - started,
          status,
          note_id: practiceId,
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
            max_tokens: maxTokens,
            system,
            messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
            output_config: { effort: choice.effort },
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

      const after = async () => ({ spentUsd: (await monthSpent()).spent, budgetUsd: gate!.budgetUsd });
      const usage = { input_tokens: seen.input, output_tokens: seen.output };
      if (mode === 'exam') {
        const exam = parsePractice(raw, CONFIG.practice.limits);
        if (!exam) throw new Failure('invalid_json');
        await writeLog('ok');
        return json({ exam, meta, model: choice.model, usage, budget: await after() });
      }
      const solutions = parseSolutions(raw, CONFIG.practice.limits);
      if (!solutions) throw new Failure('invalid_json');
      await writeLog('ok');
      return json({ solutions, model: choice.model, usage, budget: await after() });
    } catch (e) {
      await writeLog(e instanceof Failure ? e.code : 'error', e instanceof Error ? e.message : '');
      throw e;
    }
  } catch (e) {
    if (e instanceof Failure) return json({ error: e.code, message: e.message }, FAILURES[e.code].status);
    console.error('generate-exam', e instanceof Error ? e.message : e);
    return json({ error: 'unavailable', message: FAILURES.unavailable.message }, 503);
  } finally {
    await gate?.end();
  }
});
