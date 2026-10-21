import { CONFIG, emptyPlan, pendingAccess, type AccountAccess, type StyleRecord, type AbiturPlan, type ExamReview, type PracticeRecord, type SubjectRubric, type Flashcard, type Quarter, type Exam, type PlanSettings, type Role, type Stage, type Subject, type SubstitutionEntry, type Timetable, type Effort, type Legibility, type WorksheetSummary } from '@study/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { SplashScreen } from '../components/SplashScreen';
import { loadRemote, persist, pickRemote, subscribeChanges, type RemoteData } from './remote';

/**
 * App-Zustand. Die Daten liegen in Supabase (pro Konto). Der Reducer bleibt die einzige Stelle,
 * die den Zustand ändert: dispatch wendet die Aktion lokal an und schreibt sie danach in die
 * Datenbank (siehe remote.ts). Nur das Farbschema bleibt pro Gerät im Browser.
 */

export type Theme = 'light' | 'dark' | 'auto';

export interface Profile {
  name: string;
  role: Role;
  federalState: string;
  stage: Stage;
}

export interface TimerSettings {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  sessionsUntilLongBreak: number;
}

export interface FocusSession {
  id: string;
  subjectId: string | null;
  startedAt: number;
  endedAt: number;
  minutes: number;
}

export interface Task {
  id: string;
  title: string;
  subjectId: string | null;
  minutes: number | null;
  date: string; // YYYY-MM-DD
  done: boolean;
}

/** Tägliche Selbsteinschätzung für den Konzentrationsscore. null = nicht angegeben. */
export interface Checkin {
  date: string; // YYYY-MM-DD
  energy: number | null; // 1-5
  sleepHours: number | null;
  trainingSessions: number | null;
  trainingMinutes: number | null;
  trainingRpe: number | null; // Anstrengung des Trainings 1 (sehr leicht) bis 10 (maximal), null: die App schätzt
}

/** Tageszusammenfassung aus der Fitness-App Overload (nur lesen, kommt über die Edge Function fitness-ingest). */
export interface FitnessDay {
  date: string;
  sessions: number;
  minutes: number;
  kinds: string[];
  sleepHours: number | null;
  /** Belastung des Tages in Punkten (Dauer mal Anstrengung), null bei älteren Overload-Versionen. */
  load: number | null;
  /** Anstrengung 1 bis 10, nach Minuten gewichtet. */
  rpe: number | null;
  /** true: von dir in Overload eingestellt, false: von Overload geschätzt. */
  rpeSet: boolean | null;
  /** 7-Tage- und 28-Tage-Mittel der Belastung in Punkten pro Tag (7:28). */
  acute: number | null;
  chronic: number | null;
  /** Genug Daten für das 7:28-Verhältnis (Overload braucht etwa 14 Tage). */
  loadReady: boolean | null;
}

/** Ein Tag mit weniger oder ohne Lernzeit (0 = fällt aus). */
export interface DayOverride {
  date: string; // YYYY-MM-DD
  capacityMin: number;
}

/** Ein Thema einer Klausur zum Abhaken. */
export interface Topic {
  id: string;
  examId: string;
  title: string;
  done: boolean;
}

/** Zusammenfassung eines Arbeitsblatts (Notiz zu einer Stunde), siehe Edge Function summarize-worksheet. */
export interface LessonNote {
  id: string;
  subjectId: string | null;
  lessonDate: string; // YYYY-MM-DD
  title: string;
  summary: WorksheetSummary | null;
  legibility: Legibility | null;
  effort: Effort | null;
  teacher: string;
  quarter: Quarter | null;
  pdfPath: string | null; // zusammengefügtes PDF im Speicher "documents"
  fileHashes: string[]; // SHA-256 der hochgeladenen Dateien, damit dieselbe Datei nicht zweimal bezahlt wird
  createdAt: string;
}

export interface AppState {
  version: 1;
  onboarded: boolean;
  profile: Profile | null;
  subjects: Subject[];
  exams: Exam[];
  plan: PlanSettings;
  timer: TimerSettings;
  theme: Theme;
  sessions: FocusSession[];
  tasks: Task[];
  checkins: Checkin[];
  fitness: FitnessDay[];
  dayOverrides: DayOverride[];
  topics: Topic[];
  /** Zuletzt aus Lanis gelesen (Import), mit Zeitpunkt */
  timetable: Timetable | null;
  timetableAt: string | null;
  substitutions: SubstitutionEntry[];
  substitutionsAt: string | null;
  notes: LessonNote[];
  cards: Flashcard[];
  examReviews: ExamReview[];
  rubrics: SubjectRubric[]; // Korrekturmuster pro Fach, nur wenn es vom Standard abweicht
  practiceExams: PracticeRecord[];
  abiturPlan: AbiturPlan; // Eingaben im Abiturrechner
  taskStyles: StyleRecord[]; // gelernter Stil der echten Aufgabenblätter, pro Fach und Lehrkraft
  account: AccountAccess; // Freigabe, Admin, freigeschaltete KI-Funktionen (nur lesen, ändert der Admin)
}

const LEGACY_STORAGE_KEY = 'study-app-state-v1'; // Daten aus der Zeit vor Supabase
const THEME_KEY = 'study-app-theme';

export const initialState: AppState = {
  version: 1,
  onboarded: false,
  profile: null,
  subjects: [],
  exams: [],
  plan: { freeDaysPerWeek: CONFIG.plan.defaultFreeDaysPerWeek, dailyLimitMin: CONFIG.plan.defaultDailyLimitMin },
  timer: {
    focusMin: CONFIG.timer.focusMin,
    shortBreakMin: CONFIG.timer.shortBreakMin,
    longBreakMin: CONFIG.timer.longBreakMin,
    sessionsUntilLongBreak: CONFIG.timer.sessionsUntilLongBreak,
  },
  theme: 'light',
  sessions: [],
  tasks: [],
  checkins: [],
  fitness: [],
  dayOverrides: [],
  topics: [],
  timetable: null,
  timetableAt: null,
  substitutions: [],
  substitutionsAt: null,
  notes: [],
  cards: [],
  examReviews: [],
  rubrics: [],
  practiceExams: [],
  abiturPlan: emptyPlan(),
  taskStyles: [],
  account: pendingAccess(),
};

export type Action =
  | { type: 'hydrate'; data: RemoteData }
  | { type: 'completeOnboarding'; profile: Profile; subjects: Subject[] }
  | { type: 'updateProfile'; profile: Partial<Profile> }
  | { type: 'upsertSubject'; subject: Subject }
  | { type: 'deleteSubject'; id: string }
  | { type: 'upsertExam'; exam: Exam }
  | { type: 'deleteExam'; id: string }
  | { type: 'setPlan'; plan: Partial<PlanSettings> }
  | { type: 'setTimer'; timer: Partial<TimerSettings> }
  | { type: 'setTheme'; theme: Theme }
  | { type: 'addSession'; session: FocusSession }
  | { type: 'setCheckin'; checkin: Checkin }
  | { type: 'setFitness'; fitness: FitnessDay[] }
  | { type: 'setDayOverride'; date: string; capacityMin: number | null }
  | { type: 'setTimetable'; timetable: Timetable; at: string }
  | { type: 'setSubstitutions'; substitutions: SubstitutionEntry[]; at: string }
  | { type: 'upsertNote'; note: LessonNote }
  | { type: 'deleteNote'; id: string }
  | { type: 'upsertCard'; card: Flashcard }
  | { type: 'upsertCards'; cards: Flashcard[] }
  | { type: 'deleteCard'; id: string }
  | { type: 'deleteCards'; ids: string[] }
  | { type: 'upsertReview'; review: ExamReview }
  | { type: 'deleteReview'; id: string }
  | { type: 'upsertRubric'; rubric: SubjectRubric }
  | { type: 'setAbiturPlan'; plan: AbiturPlan }
  | { type: 'upsertStyle'; style: StyleRecord }
  | { type: 'deleteStyle'; id: string }
  | { type: 'upsertPractice'; practice: PracticeRecord }
  | { type: 'deletePractice'; id: string }
  | { type: 'addTopic'; topic: Topic }
  | { type: 'toggleTopic'; id: string }
  | { type: 'deleteTopic'; id: string }
  | { type: 'addTask'; task: Task }
  | { type: 'toggleTask'; id: string }
  | { type: 'deleteTask'; id: string }
  | { type: 'reset' };

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return { ...state, ...action.data };
    case 'completeOnboarding':
      return { ...state, onboarded: true, profile: action.profile, subjects: action.subjects };
    case 'updateProfile':
      return state.profile ? { ...state, profile: { ...state.profile, ...action.profile } } : state;
    case 'upsertSubject':
      return { ...state, subjects: upsert(state.subjects, action.subject) };
    case 'deleteSubject':
      return {
        ...state,
        subjects: state.subjects.filter((s) => s.id !== action.id),
        exams: state.exams.filter((e) => e.subjectId !== action.id),
        rubrics: state.rubrics.filter((r) => r.subjectId !== action.id),
        practiceExams: state.practiceExams.map((p) => (p.subjectId === action.id ? { ...p, subjectId: null } : p)),
        examReviews: state.examReviews.map((r) => (r.subjectId === action.id ? { ...r, subjectId: null } : r)),
        topics: state.topics.filter((t) => state.exams.find((e) => e.id === t.examId)?.subjectId !== action.id),
        // Wie in der Datenbank: Verknüpfungen werden leer (on delete set null), der Aufgabenstil geht mit
        tasks: state.tasks.map((t) => (t.subjectId === action.id ? { ...t, subjectId: null } : t)),
        sessions: state.sessions.map((s) => (s.subjectId === action.id ? { ...s, subjectId: null } : s)),
        notes: state.notes.map((n) => (n.subjectId === action.id ? { ...n, subjectId: null } : n)),
        cards: state.cards.map((c) => (c.subjectId === action.id ? { ...c, subjectId: null } : c)),
        taskStyles: state.taskStyles.filter((t) => t.subjectId !== action.id),
      };
    case 'upsertExam':
      return { ...state, exams: upsert(state.exams, action.exam) };
    case 'deleteExam':
      return {
        ...state,
        exams: state.exams.filter((e) => e.id !== action.id),
        topics: state.topics.filter((t) => t.examId !== action.id),
      };
    case 'setPlan':
      return { ...state, plan: { ...state.plan, ...action.plan } };
    case 'setTimer':
      return { ...state, timer: { ...state.timer, ...action.timer } };
    case 'setTheme':
      return { ...state, theme: action.theme };
    case 'addSession':
      return { ...state, sessions: upsert(state.sessions, action.session) };
    case 'setCheckin':
      return {
        ...state,
        checkins: [...state.checkins.filter((c) => c.date !== action.checkin.date), action.checkin].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      };
    case 'setFitness':
      return { ...state, fitness: action.fitness };
    case 'setDayOverride':
      return {
        ...state,
        dayOverrides: [
          ...state.dayOverrides.filter((o) => o.date !== action.date),
          ...(action.capacityMin === null ? [] : [{ date: action.date, capacityMin: action.capacityMin }]),
        ].sort((a, b) => a.date.localeCompare(b.date)),
      };
    case 'setTimetable':
      return { ...state, timetable: action.timetable, timetableAt: action.at };
    case 'setSubstitutions':
      return { ...state, substitutions: action.substitutions, substitutionsAt: action.at };
    case 'upsertNote':
      return { ...state, notes: upsert(state.notes, action.note) };
    case 'deleteNote':
      return { ...state, notes: state.notes.filter((n) => n.id !== action.id) };
    case 'upsertCard':
      return { ...state, cards: upsert(state.cards, action.card) };
    case 'upsertCards':
      return { ...state, cards: action.cards.reduce((list, c) => upsert(list, c), state.cards) };
    case 'deleteCard':
      return { ...state, cards: state.cards.filter((c) => c.id !== action.id) };
    case 'deleteCards': {
      const gone = new Set(action.ids);
      return { ...state, cards: state.cards.filter((c) => !gone.has(c.id)) };
    }
    case 'upsertReview':
      return { ...state, examReviews: upsert(state.examReviews, action.review) };
    case 'deleteReview':
      return { ...state, examReviews: state.examReviews.filter((r) => r.id !== action.id) };
    case 'upsertPractice':
      return { ...state, practiceExams: upsert(state.practiceExams, action.practice) };
    case 'deletePractice':
      return {
        ...state,
        practiceExams: state.practiceExams.filter((p) => p.id !== action.id),
        examReviews: state.examReviews.map((r) => (r.practiceId === action.id ? { ...r, practiceId: null } : r)), // die Datenbank setzt es auf leer
      };
    case 'setAbiturPlan':
      return { ...state, abiturPlan: action.plan };
    case 'upsertStyle':
      return { ...state, taskStyles: upsert(state.taskStyles, action.style) };
    case 'deleteStyle':
      return { ...state, taskStyles: state.taskStyles.filter((x) => x.id !== action.id) };
    case 'upsertRubric':
      return {
        ...state,
        rubrics: [...state.rubrics.filter((r) => r.subjectId !== action.rubric.subjectId), action.rubric],
      };
    case 'addTopic':
      return { ...state, topics: [...state.topics, action.topic] };
    case 'toggleTopic':
      return { ...state, topics: state.topics.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t)) };
    case 'deleteTopic':
      return { ...state, topics: state.topics.filter((t) => t.id !== action.id) };
    case 'addTask':
      return { ...state, tasks: [...state.tasks, action.task] };
    case 'toggleTask':
      return { ...state, tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t)) };
    case 'deleteTask':
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) };
    case 'reset':
      return { ...initialState, theme: state.theme, account: state.account };
    default:
      return state;
  }
}

function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark' || t === 'auto') return t;
  } catch {
    // Speicher gesperrt: Standard verwenden.
  }
  return 'light';
}

function loadLegacy(): AppState | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    return { ...initialState, ...(JSON.parse(raw) as AppState) };
  } catch {
    return null;
  }
}

interface StoreApi {
  state: AppState;
  dispatch: (action: Action) => void;
  /** Letzter Fehler beim Speichern oder Laden, null wenn alles synchron ist. */
  syncError: string | null;
  /** Abgleich zwischen Geräten: live = Echtzeitverbindung steht, at = letzter Abgleich (ms) */
  sync: { live: boolean; at: number };
  /** Daten sofort vom Server holen (zum Beispiel nach einer Änderung auf einem anderen Gerät). */
  refresh: () => Promise<void>;
  /** Wartet, bis alle bisherigen Änderungen in der Datenbank gespeichert sind (zum Beispiel vor abhängigen Zeilen). */
  flush: () => Promise<void>;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, () => ({ ...initialState, theme: loadTheme() }));
  const stateRef = useRef(state);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // Abgleich zwischen Geräten: nie über eigene, noch nicht gespeicherte Änderungen hinweg überschreiben.
  const pending = useRef(0); // Schreibvorgänge in der Warteschlange
  const localVersion = useRef(0); // zählt eigene Änderungen
  const needsRefetch = useRef(false);
  const fetching = useRef(false);
  const refetchFn = useRef<() => Promise<void>>(async () => {});
  const [sync, setSync] = useState({ live: false, at: 0 });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [syncError, setSyncError] = useState<string | null>(null);

  const dispatch = useCallback(
    (action: Action) => {
      const next = reducer(stateRef.current, action);
      stateRef.current = next;
      rawDispatch(action);
      if (action.type === 'setTheme') {
        try {
          localStorage.setItem(THEME_KEY, action.theme);
        } catch {
          // ignorieren
        }
        return;
      }
      if (action.type === 'hydrate') return;
      // Schreibvorgänge nacheinander, damit die Reihenfolge der Änderungen stimmt.
      localVersion.current++;
      pending.current++;
      queue.current = queue.current
        .then(() => persist(action, next, userId))
        .then(() => setSyncError(null))
        .catch((e: unknown) => setSyncError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen'))
        .finally(() => {
          pending.current--;
          if (pending.current === 0 && needsRefetch.current) {
            needsRefetch.current = false;
            window.setTimeout(() => void refetchFn.current(), 300);
          }
        });
    },
    [userId],
  );

  const refetch = useCallback(async () => {
    if (fetching.current || pending.current > 0) {
      needsRefetch.current = true;
      return;
    }
    fetching.current = true;
    const version = localVersion.current;
    try {
      const { data } = await loadRemote(userId, initialState, null);
      if (pending.current > 0 || localVersion.current !== version) {
        needsRefetch.current = true; // inzwischen selbst etwas geändert: später noch einmal
        return;
      }
      if (JSON.stringify(pickRemote(stateRef.current)) !== JSON.stringify(data)) {
        stateRef.current = { ...stateRef.current, ...data };
        rawDispatch({ type: 'hydrate', data });
      }
      setSync((s) => ({ ...s, at: Date.now() }));
      setSyncError(null);
    } catch {
      // kein Netz: beim nächsten Anlass wieder
    } finally {
      fetching.current = false;
      if (needsRefetch.current && pending.current === 0) {
        needsRefetch.current = false;
        window.setTimeout(() => void refetchFn.current(), 300);
      }
    }
  }, [userId]);
  refetchFn.current = refetch;

  useEffect(() => {
    let cancelled = false;
    loadRemote(userId, initialState, loadLegacy())
      .then(({ data, imported }) => {
        if (cancelled) return;
        stateRef.current = { ...stateRef.current, ...data };
        rawDispatch({ type: 'hydrate', data });
        setStatus('ready');
        setSync((s) => ({ ...s, at: Date.now() }));
        if (imported) {
          try {
            localStorage.removeItem(LEGACY_STORAGE_KEY);
          } catch {
            // ignorieren
          }
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setSyncError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Geräte koppeln: Änderungen anderer Geräte live übernehmen, beim Zurückkehren in die App nachholen.
  useEffect(() => {
    if (status !== 'ready') return;
    let timer: number | undefined;
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refetchFn.current(), 500);
    };
    const unsubscribe = subscribeChanges(soon, (live) => setSync((s) => ({ ...s, live })));
    let last = 0;
    const catchUp = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 15_000) return;
      last = Date.now();
      void refetchFn.current();
    };
    document.addEventListener('visibilitychange', catchUp);
    window.addEventListener('focus', catchUp);
    window.addEventListener('online', catchUp);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      document.removeEventListener('visibilitychange', catchUp);
      window.removeEventListener('focus', catchUp);
      window.removeEventListener('online', catchUp);
    };
  }, [status]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  const refresh = useCallback(() => refetchFn.current(), []);
  const flush = useCallback(() => queue.current, []);
  const value = useMemo(() => ({ state, dispatch, syncError, sync, refresh, flush }), [state, dispatch, syncError, sync, refresh, flush]);

  if (status === 'loading') return <SplashScreen label="Lade deine Daten …" />;
  if (status === 'error') {
    return (
      <div className="card stack" style={{ maxWidth: 420, margin: '10vh auto', padding: 16 }}>
        <h2>Daten konnten nicht geladen werden</h2>
        <p className="muted">{syncError}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Erneut versuchen
        </button>
      </div>
    );
  }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore muss innerhalb von StoreProvider verwendet werden');
  return ctx;
}
