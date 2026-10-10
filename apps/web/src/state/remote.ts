import { AI_FEATURES, CONFIG, readAccess, type AccountAccess, readAbiturPlan, emptyPlan, sanitizeStyle, type StyleRecord, isLanguage, isQuarter, isLevel, readLessons, readPracticeContent, readPracticeMeta, readStoredGrading, readTeacherTasks, type ExamReview, type PracticeRecord, type SubjectRubric, toDifficulty, type Flashcard, type Effort, type Exam, Legibility, PlanSettings, Role, Stage, Subject, SubjectStatus, SubjectType, SubstitutionEntry, Timetable, WorksheetSummary } from '@study/core';
import { supabase } from '../lib/supabase';
import type { Action, AppState, Checkin, DayOverride, FitnessDay, FocusSession, LessonNote, Task, Topic } from './store';

/**
 * Anbindung an Supabase: Laden, Speichern, einmaliger Import der lokalen Daten.
 * Zeilen in der Datenbank sind snake_case, der App-Zustand camelCase.
 */

export type RemoteData = Pick<
  AppState,
  'onboarded' | 'profile' | 'subjects' | 'exams' | 'plan' | 'timer' | 'sessions' | 'tasks' | 'checkins' | 'fitness' | 'dayOverrides' | 'topics' | 'timetable' | 'timetableAt' | 'substitutions' | 'substitutionsAt' | 'notes' | 'cards' | 'examReviews' | 'rubrics' | 'practiceExams' | 'abiturPlan' | 'taskStyles' | 'account'
>;

function ok<T extends { error: { message: string } | null }>(res: T): T {
  if (res.error) throw new Error(res.error.message);
  return res;
}

const subjectRow = (userId: string, s: Subject) => ({
  id: s.id,
  user_id: userId,
  name: s.name,
  color: s.color,
  is_advanced: s.isAdvanced,
  is_exam_subject: s.isExamSubject,
  status: s.status,
  type: s.type,
  points: s.points,
  difficulty: s.difficulty,
  language: s.language,
});

const examRow = (userId: string, e: Exam) => ({
  id: e.id,
  user_id: userId,
  subject_id: e.subjectId,
  title: e.title,
  date: e.date,
  priority_manual: e.priorityManual,
  total_hours_manual: e.totalHoursManual,
  start_days_manual: e.startDaysManual,
  external_id: e.externalId ?? null,
});

const taskRow = (userId: string, t: Task) => ({
  id: t.id,
  user_id: userId,
  subject_id: t.subjectId,
  title: t.title,
  minutes: t.minutes,
  date: t.date,
  done: t.done,
});

const sessionRow = (userId: string, s: FocusSession) => ({
  id: s.id,
  user_id: userId,
  subject_id: s.subjectId,
  started_at: new Date(s.startedAt).toISOString(),
  ended_at: new Date(s.endedAt).toISOString(),
  minutes: s.minutes,
});

const profileRow = (userId: string, s: AppState) => ({
  user_id: userId,
  name: s.profile?.name ?? '',
  role: s.profile?.role ?? 'student_school',
  federal_state: s.profile?.federalState ?? '',
  stage: s.profile?.stage ?? 'Q1',
  onboarded: s.onboarded,
});

const checkinRow = (userId: string, c: Checkin) => ({
  user_id: userId,
  date: c.date,
  energy: c.energy,
  sleep_hours: c.sleepHours,
  training_sessions: c.trainingSessions,
  training_minutes: c.trainingMinutes,
  training_rpe: c.trainingRpe,
});

const overrideRow = (userId: string, o: DayOverride) => ({ user_id: userId, date: o.date, capacity_min: o.capacityMin });

const topicRow = (userId: string, t: Topic) => ({
  id: t.id,
  user_id: userId,
  exam_id: t.examId,
  title: t.title,
  done: t.done,
});

const noteRow = (userId: string, n: LessonNote) => ({
  id: n.id,
  user_id: userId,
  subject_id: n.subjectId,
  lesson_date: n.lessonDate,
  title: n.title,
  summary: n.summary,
  legibility: n.legibility,
  effort: n.effort,
  file_hashes: n.fileHashes,
  teacher: n.teacher,
  quarter: n.quarter,
  pdf_path: n.pdfPath,
});

const cardRow = (userId: string, c: Flashcard) => ({
  id: c.id,
  user_id: userId,
  subject_id: c.subjectId,
  note_id: c.noteId,
  front: c.front,
  back: c.back,
  difficulty: c.difficulty,
  box: c.box,
  due: c.due,
  reps: c.reps,
  lapses: c.lapses,
  last_reviewed: c.lastReviewed,
});

const reviewRow = (userId: string, r: ExamReview) => ({
  id: r.id,
  user_id: userId,
  subject_id: r.subjectId,
  exam_id: r.examId,
  title: r.title,
  exam_date: r.examDate,
  teacher: r.teacher,
  quarter: r.quarter,
  max_points: r.maxPoints,
  horizon_text: r.horizonText,
  result: r.main ? { main: r.main, ...(r.compare ? { compare: r.compare } : {}) } : null,
  teacher_points: r.teacherPoints,
  teacher_tasks: r.teacherTasks,
  learned_at: r.learnedAt,
  practice_id: r.practiceId,
});

const practiceRow = (userId: string, p: PracticeRecord) => ({
  id: p.id,
  user_id: userId,
  subject_id: p.subjectId,
  title: p.title,
  difficulty: p.level,
  teacher: p.teacher,
  note_ids: p.noteIds,
  topic: p.topic,
  duration_min: p.durationMin,
  content: p.content,
  meta: p.meta ?? {},
  rating: p.rating,
});

const rubricRow = (userId: string, r: SubjectRubric) => ({
  user_id: userId,
  subject_id: r.subjectId,
  teacher_text: r.teacherText,
  lessons: r.lessons,
  updated_at: r.updatedAt,
});

const SINCE_DAYS = 60;
const sinceDate = () => new Date(Date.now() - SINCE_DAYS * 86_400_000).toISOString().slice(0, 10);

/** Tageszusammenfassungen aus Overload der letzten 60 Tage. */
export async function fetchFitness(): Promise<FitnessDay[]> {
  // select('*'), damit es auch ohne die Migration für die Belastung läuft (dann sind die neuen Felder leer)
  const res = ok(await supabase.from('fitness_daily').select('*').gte('date', sinceDate()));
  const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const b = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
  return (res.data ?? []).map((r) => ({
    date: r.date,
    sessions: r.sessions,
    minutes: r.minutes,
    kinds: r.kinds ?? [],
    sleepHours: r.sleep_hours,
    load: n(r.load),
    rpe: n(r.rpe),
    rpeSet: b(r.rpe_set),
    acute: n(r.acute_load),
    chronic: n(r.chronic_load),
    loadReady: b(r.load_ready),
  }));
}

const planRow = (userId: string, p: PlanSettings) => ({
  user_id: userId,
  free_days_per_week: p.freeDaysPerWeek,
  daily_limit_min: p.dailyLimitMin,
});

const timerSettingsRow = (userId: string, t: AppState['timer']) => ({
  user_id: userId,
  focus_min: t.focusMin,
  short_break_min: t.shortBreakMin,
  long_break_min: t.longBreakMin,
  sessions_until_long_break: t.sessionsUntilLongBreak,
});

async function upsert(table: string, rows: object | object[], onConflict?: string) {
  if (Array.isArray(rows) && rows.length === 0) return;
  ok(await supabase.from(table).upsert(rows, onConflict ? { onConflict } : undefined));
}

/** Schreibt einen kompletten Zustand (Onboarding und Import). Reihenfolge wegen der Fremdschlüssel. */
async function writeAll(userId: string, s: AppState) {
  await upsert('profiles', profileRow(userId, s));
  await upsert('subjects', s.subjects.map((x) => subjectRow(userId, x)));
  await upsert('exams', s.exams.map((x) => examRow(userId, x)));
  await upsert('plan_settings', planRow(userId, s.plan));
  await upsert('timer_settings', timerSettingsRow(userId, s.timer));
  await upsert('tasks', s.tasks.map((x) => taskRow(userId, x)));
  await upsert('focus_sessions', s.sessions.map((x) => sessionRow(userId, x)));
}

const SYNC_TABLES = [
  'profiles', 'subjects', 'exams', 'plan_settings', 'timer_settings', 'focus_sessions', 'tasks',
  'daily_checkins', 'day_overrides', 'exam_topics', 'lanis_snapshots', 'fitness_daily', 'lesson_notes', 'flashcards',
  'exam_reviews', 'subject_rubrics', 'practice_exams', 'abitur_plans', 'task_styles', 'accounts',
] as const;

/**
 * Meldet Änderungen an allen Tabellen (Supabase Realtime), damit andere Geräte live nachziehen.
 * Der Timer hat seinen eigenen Kanal (timer/TimerProvider.tsx). Ohne Replikation für die Tabellen kommen keine
 * Ereignisse, dann gleicht sich die App nur beim Zurückkehren ab. onStatus meldet, ob die Verbindung steht.
 */
export function subscribeChanges(onChange: () => void, onStatus: (live: boolean) => void): () => void {
  let channel = supabase.channel('sync-all');
  for (const table of SYNC_TABLES) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
  channel.subscribe((status) => onStatus(status === 'SUBSCRIBED'));
  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Kontostatus aus accounts. Fehlt die Tabelle noch (Migration 20261027 nicht eingespielt), gilt das alte Verhalten (alles frei),
 * entschieden wird ohnehin auf dem Server. Fehlt nur die Zeile, wartet das Konto auf Freigabe.
 */
function accountFrom(r: { data: unknown; error: { code?: string; message?: string } | null }): AccountAccess {
  if (r.error) return { status: 'active', isAdmin: true, features: [...AI_FEATURES] };
  return readAccess(r.data);
}

export async function loadRemote(
  userId: string,
  defaults: RemoteData,
  local: AppState | null,
): Promise<{ data: RemoteData; imported: boolean }> {
  const [p, s, e, pl, ts, f, k, ci, fi, ov, tp, ls, ln, fc, er, sr, pe, ap, ts2, acc] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('subjects').select('*'),
    supabase.from('exams').select('*'),
    supabase.from('plan_settings').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('timer_settings').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('focus_sessions').select('*').order('ended_at'),
    supabase.from('tasks').select('*').order('date'),
    // Neuere Tabellen: Fehlt die Migration noch, startet die App trotzdem (ohne Check-ins und Overload-Daten).
    supabase.from('daily_checkins').select('*').gte('date', sinceDate()).order('date'),
    fetchFitness().then(
      (data) => ({ data }),
      () => ({ data: [] as FitnessDay[] }),
    ),
    supabase.from('day_overrides').select('*').gte('date', sinceDate()).order('date'),
    supabase.from('exam_topics').select('*').order('created_at'),
    supabase.from('lanis_snapshots').select('kind, data, fetched_at'),
    supabase.from('lesson_notes').select('*').order('lesson_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('flashcards').select('*').order('created_at'),
    supabase.from('exam_reviews').select('*').order('exam_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('subject_rubrics').select('*'),
    supabase.from('practice_exams').select('*').order('created_at', { ascending: false }),
    supabase.from('abitur_plans').select('data').eq('user_id', userId).maybeSingle(),
    supabase.from('task_styles').select('*').order('created_at', { ascending: false }),
    supabase.from('accounts').select('status, is_admin, ai_features').eq('user_id', userId).maybeSingle(),
  ]);
  for (const r of [p, s, e, pl, ts, f, k]) ok(r);

  const account = accountFrom(acc);
  // Neues Konto, aber lokale Daten aus der Zeit vor dem Server vorhanden: einmal übernehmen (nur freigegebene Konten dürfen schreiben).
  if (!p.data && local?.onboarded && account.status === 'active') {
    await writeAll(userId, local);
    return { data: { ...pickRemote(local), account }, imported: true };
  }

  const data: RemoteData = {
    onboarded: p.data?.onboarded ?? false,
    profile: p.data
      ? {
          name: p.data.name,
          role: p.data.role as Role,
          federalState: p.data.federal_state,
          stage: p.data.stage as Stage,
        }
      : null,
    subjects: (s.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      isAdvanced: r.is_advanced,
      isExamSubject: r.is_exam_subject,
      status: r.status as SubjectStatus,
      type: r.type as SubjectType,
      points: r.points,
      difficulty: r.difficulty,
      language: isLanguage(r.language) ? r.language : 'de',
    })),
    exams: (e.data ?? []).map((r) => ({
      id: r.id,
      subjectId: r.subject_id,
      title: r.title,
      date: r.date,
      priorityManual: r.priority_manual,
      totalHoursManual: r.total_hours_manual,
      startDaysManual: r.start_days_manual,
      externalId: r.external_id,
    })),
    plan: pl.data
      ? { freeDaysPerWeek: pl.data.free_days_per_week as 0 | 1 | 2, dailyLimitMin: pl.data.daily_limit_min }
      : defaults.plan,
    timer: ts.data
      ? {
          focusMin: ts.data.focus_min,
          shortBreakMin: ts.data.short_break_min,
          longBreakMin: ts.data.long_break_min,
          sessionsUntilLongBreak: ts.data.sessions_until_long_break,
        }
      : defaults.timer,
    sessions: (f.data ?? []).map((r) => ({
      id: r.id,
      subjectId: r.subject_id,
      startedAt: Date.parse(r.started_at),
      endedAt: Date.parse(r.ended_at),
      minutes: r.minutes,
    })),
    tasks: (k.data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      subjectId: r.subject_id,
      minutes: r.minutes,
      date: r.date,
      done: r.done,
    })),
    checkins: (ci.error ? [] : ci.data ?? []).map((r) => ({
      date: r.date,
      energy: r.energy,
      sleepHours: r.sleep_hours,
      trainingSessions: r.training_sessions,
      trainingMinutes: r.training_minutes,
      trainingRpe: typeof r.training_rpe === 'number' ? r.training_rpe : null,
    })),
    fitness: fi.data,
    dayOverrides: (ov.error ? [] : ov.data ?? []).map((r) => ({ date: r.date, capacityMin: r.capacity_min })),
    topics: (tp.error ? [] : tp.data ?? []).map((r) => ({ id: r.id, examId: r.exam_id, title: r.title, done: r.done })),
    timetable: null,
    timetableAt: null,
    substitutions: [],
    substitutionsAt: null,
    notes: [],
    cards: [],
    examReviews: [],
    rubrics: [],
    practiceExams: [],
    abiturPlan: ap.error ? emptyPlan() : readAbiturPlan(ap.data?.data),
    account,
    taskStyles: (ts2.error ? [] : ts2.data ?? []).map(
      (r): StyleRecord => ({
        id: r.id,
        subjectId: r.subject_id,
        teacher: r.teacher ?? '',
        title: r.title ?? '',
        style: sanitizeStyle(r.style, CONFIG.style),
        edited: r.edited === true,
        createdAt: r.created_at ?? '',
      }),
    ),
  };
  const snap = (kind: string) => (ls.error ? undefined : (ls.data ?? []).find((r) => r.kind === kind));
  const tt = snap('timetable');
  const sb = snap('substitutions');
  data.timetable = tt ? (tt.data as Timetable) : null;
  data.timetableAt = tt?.fetched_at ?? null;
  data.substitutions = sb ? (sb.data as SubstitutionEntry[]) : [];
  data.substitutionsAt = sb?.fetched_at ?? null;
  data.notes = (ln.error ? [] : ln.data ?? []).map((r) => ({
    id: r.id,
    subjectId: r.subject_id,
    lessonDate: r.lesson_date,
    title: r.title,
    summary: (r.summary as WorksheetSummary | null) ?? null,
    legibility: (r.legibility as Legibility | null) ?? null,
    effort: (r.effort as Effort | null) ?? null,
    teacher: typeof r.teacher === 'string' ? r.teacher : '',
    quarter: isQuarter(r.quarter) ? r.quarter : null,
    pdfPath: typeof r.pdf_path === 'string' ? r.pdf_path : null,
    fileHashes: Array.isArray(r.file_hashes) ? (r.file_hashes as string[]) : [],
    createdAt: r.created_at ?? '',
  }));
  // Fehlt die Migration für die Karten noch, startet die App trotzdem (ohne Karten).
  data.cards = (fc.error ? [] : fc.data ?? []).map((r) => ({
    id: r.id,
    subjectId: r.subject_id,
    noteId: r.note_id,
    front: r.front,
    back: r.back,
    difficulty: toDifficulty(r.difficulty),
    box: r.box,
    due: r.due,
    reps: r.reps,
    lapses: r.lapses,
    lastReviewed: r.last_reviewed ?? null,
    createdAt: r.created_at ?? '',
  }));
  // Fehlt die Migration für die Klausurenkorrektur noch, startet die App trotzdem (ohne Korrekturen).
  data.examReviews = (er.error ? [] : er.data ?? []).map((r) => {
    const result = (r.result ?? null) as { main?: unknown; compare?: unknown } | null;
    return {
      id: r.id,
      subjectId: r.subject_id,
      examId: r.exam_id,
      title: r.title ?? '',
      examDate: r.exam_date,
      teacher: r.teacher ?? '',
      quarter: isQuarter(r.quarter) ? r.quarter : null,
      maxPoints: r.max_points === null || r.max_points === undefined ? null : Number(r.max_points),
      horizonText: r.horizon_text ?? '',
      main: readStoredGrading(result?.main),
      compare: readStoredGrading(result?.compare),
      teacherPoints: typeof r.teacher_points === 'number' ? r.teacher_points : null,
      teacherTasks: readTeacherTasks(r.teacher_tasks),
      learnedAt: r.learned_at ?? null,
      practiceId: typeof r.practice_id === 'string' ? r.practice_id : null,
      createdAt: r.created_at ?? '',
    };
  });
  // Fehlt die Migration für die Übungsklausuren noch, startet die App trotzdem (ohne Übungsklausuren).
  data.practiceExams = (pe.error ? [] : pe.data ?? []).flatMap((r): PracticeRecord[] => {
    const content = readPracticeContent(r.content);
    if (!content || !isLevel(r.difficulty)) return [];
    return [
      {
        id: r.id,
        subjectId: r.subject_id,
        title: r.title ?? '',
        level: r.difficulty,
        teacher: r.teacher ?? '',
        noteIds: Array.isArray(r.note_ids) ? (r.note_ids as unknown[]).filter((x): x is string => typeof x === 'string') : [],
        topic: r.topic ?? '',
        durationMin: typeof r.duration_min === 'number' ? r.duration_min : content.dauer_min,
        content,
        meta: readPracticeMeta(r.meta),
        rating: typeof r.rating === 'number' ? r.rating : null,
        createdAt: r.created_at ?? '',
      },
    ];
  });
  data.rubrics = (sr.error ? [] : sr.data ?? []).map((r) => ({
    subjectId: r.subject_id,
    teacherText: r.teacher_text ?? '',
    lessons: readLessons(r.lessons),
    updatedAt: r.updated_at ?? '',
  }));
  return { data, imported: false };
}

export function pickRemote(s: AppState): RemoteData {
  return {
    onboarded: s.onboarded,
    profile: s.profile,
    subjects: s.subjects,
    exams: s.exams,
    plan: s.plan,
    timer: s.timer,
    sessions: s.sessions,
    tasks: s.tasks,
    checkins: s.checkins,
    fitness: s.fitness,
    dayOverrides: s.dayOverrides,
    topics: s.topics,
    timetable: s.timetable,
    timetableAt: s.timetableAt,
    substitutions: s.substitutions,
    substitutionsAt: s.substitutionsAt,
    notes: s.notes,
    cards: s.cards,
    examReviews: s.examReviews,
    rubrics: s.rubrics,
    practiceExams: s.practiceExams,
    abiturPlan: s.abiturPlan,
    taskStyles: s.taskStyles,
    account: s.account,
  };
}

/** Überträgt eine Aktion in die Datenbank. `next` ist der Zustand nach der Aktion. */
export async function persist(action: Action, next: AppState, userId: string): Promise<void> {
  switch (action.type) {
    case 'completeOnboarding':
      return writeAll(userId, next);
    case 'updateProfile':
      return upsert('profiles', profileRow(userId, next));
    case 'upsertSubject':
      return upsert('subjects', subjectRow(userId, action.subject));
    case 'deleteSubject':
      ok(await supabase.from('subjects').delete().eq('id', action.id));
      return;
    case 'upsertExam':
      return upsert('exams', examRow(userId, action.exam));
    case 'deleteExam':
      ok(await supabase.from('exams').delete().eq('id', action.id));
      return;
    case 'setPlan':
      return upsert('plan_settings', planRow(userId, next.plan));
    case 'setTimer':
      return upsert('timer_settings', timerSettingsRow(userId, next.timer));
    case 'addSession':
      return upsert('focus_sessions', sessionRow(userId, action.session));
    case 'setCheckin':
      return upsert('daily_checkins', checkinRow(userId, action.checkin), 'user_id,date');
    case 'setDayOverride':
      if (action.capacityMin === null) {
        ok(await supabase.from('day_overrides').delete().eq('user_id', userId).eq('date', action.date));
        return;
      }
      return upsert('day_overrides', overrideRow(userId, { date: action.date, capacityMin: action.capacityMin }), 'user_id,date');
    case 'setTimetable':
      return upsert('lanis_snapshots', { user_id: userId, kind: 'timetable', data: action.timetable, fetched_at: action.at }, 'user_id,kind');
    case 'setSubstitutions':
      return upsert('lanis_snapshots', { user_id: userId, kind: 'substitutions', data: action.substitutions, fetched_at: action.at }, 'user_id,kind');
    case 'upsertNote':
      return upsert('lesson_notes', noteRow(userId, action.note));
    case 'deleteNote':
      ok(await supabase.from('lesson_notes').delete().eq('id', action.id)); // die Dateizeilen gehen per cascade mit
      return;
    case 'upsertCard':
      return upsert('flashcards', cardRow(userId, action.card));
    case 'upsertCards':
      return upsert('flashcards', action.cards.map((c) => cardRow(userId, c)));
    case 'deleteCard':
      ok(await supabase.from('flashcards').delete().eq('id', action.id));
      return;
    case 'deleteCards':
      // in Päckchen, damit die Anfrage nicht zu lang wird
      for (let i = 0; i < action.ids.length; i += 100) ok(await supabase.from('flashcards').delete().in('id', action.ids.slice(i, i + 100)));
      return;
    case 'upsertReview':
      return upsert('exam_reviews', reviewRow(userId, action.review));
    case 'deleteReview':
      ok(await supabase.from('exam_reviews').delete().eq('id', action.id)); // die Dateizeilen gehen per cascade mit
      return;
    case 'upsertPractice':
      return upsert('practice_exams', practiceRow(userId, action.practice));
    case 'deletePractice':
      ok(await supabase.from('practice_exams').delete().eq('id', action.id)); // Korrekturen behalten ihr Ergebnis, practice_id wird leer
      return;
    case 'upsertStyle':
      return upsert('task_styles', {
        id: action.style.id,
        user_id: userId,
        subject_id: action.style.subjectId,
        teacher: action.style.teacher,
        title: action.style.title,
        style: action.style.style,
        edited: action.style.edited,
      });
    case 'deleteStyle':
      ok(await supabase.from('task_styles').delete().eq('id', action.id));
      return;
    case 'setAbiturPlan':
      return upsert('abitur_plans', { user_id: userId, data: action.plan, updated_at: new Date().toISOString() }, 'user_id');
    case 'upsertRubric':
      return upsert('subject_rubrics', rubricRow(userId, action.rubric), 'user_id,subject_id');
    case 'addTopic':
      return upsert('exam_topics', topicRow(userId, action.topic));
    case 'toggleTopic': {
      const t = next.topics.find((x) => x.id === action.id);
      if (t) ok(await supabase.from('exam_topics').update({ done: t.done }).eq('id', t.id));
      return;
    }
    case 'deleteTopic':
      ok(await supabase.from('exam_topics').delete().eq('id', action.id));
      return;
    case 'addTask':
      return upsert('tasks', taskRow(userId, action.task));
    case 'toggleTask': {
      const t = next.tasks.find((x) => x.id === action.id);
      if (t) ok(await supabase.from('tasks').update({ done: t.done }).eq('id', t.id));
      return;
    }
    case 'deleteTask':
      ok(await supabase.from('tasks').delete().eq('id', action.id));
      return;
    case 'reset': {
      // Löscht alle Daten dieses Kontos (das Konto selbst bleibt). Hochgeladene Blätter zuerst aus dem Speicher.
      // Fehlt die Migration für die Notizen noch, soll das Löschen der übrigen Daten trotzdem klappen.
      const files = await supabase.from('worksheet_files').select('storage_path');
      const paths = (files.data ?? []).map((r) => r.storage_path as string);
      if (!files.error && paths.length > 0) await supabase.storage.from('worksheets').remove(paths);
      const docs = await supabase.from('lesson_notes').select('pdf_path');
      const docPaths = (docs.data ?? []).map((r) => r.pdf_path as string | null).filter((p): p is string => !!p);
      if (!docs.error && docPaths.length > 0) await supabase.storage.from('documents').remove(docPaths);
      const examFiles = await supabase.from('exam_files').select('storage_path');
      const examPaths = (examFiles.data ?? []).map((r) => r.storage_path as string);
      if (!examFiles.error && examPaths.length > 0) await supabase.storage.from('exams').remove(examPaths);
      await supabase.from('exam_reviews').delete().eq('user_id', userId);
      await supabase.from('practice_exams').delete().eq('user_id', userId);
      await supabase.from('subject_rubrics').delete().eq('user_id', userId);
      await supabase.from('abitur_plans').delete().eq('user_id', userId);
      await supabase.from('task_styles').delete().eq('user_id', userId);
      await supabase.from('flashcards').delete().eq('user_id', userId);
      await supabase.from('lesson_notes').delete().eq('user_id', userId);
      for (const table of ['focus_sessions', 'tasks', 'exams', 'subjects', 'timer_state', 'daily_checkins', 'day_overrides', 'lanis_snapshots']) {
        ok(await supabase.from(table).delete().eq('user_id', userId));
      }
      for (const table of ['plan_settings', 'timer_settings', 'profiles']) {
        ok(await supabase.from(table).delete().eq('user_id', userId));
      }
      return;
    }
    default:
      return;
  }
}
