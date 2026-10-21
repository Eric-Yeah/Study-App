import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useUserId } from '../lib/auth';
import { uid } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useStore, type TimerSettings } from '../state/store';
import type { TimerPhase, TimerState } from './types';

/**
 * Fokus-Timer mit Abgleich zwischen Geräten.
 * Der Zustand speichert Zeitpunkte statt eines laufenden Zählers, damit jedes Gerät
 * die Restzeit selbst ausrechnen kann. Abgleich über die Tabelle timer_state in Supabase
 * (eine Zeile pro Nutzer, Realtime). Ohne Verbindung läuft der Timer lokal weiter.
 */

const STORAGE_KEY = 'study-app-timer-v1';
const DEVICE_KEY = 'study-app-device-id';

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uid();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'local';
  }
}

function phaseMs(phase: TimerPhase, s: TimerSettings): number {
  const min = phase === 'focus' ? s.focusMin : phase === 'shortBreak' ? s.shortBreakMin : s.longBreakMin;
  return min * 60_000;
}

function elapsedOf(t: TimerState, now: number): number {
  return t.elapsedMs + (t.status === 'running' && t.startedAt ? now - t.startedAt : 0);
}

interface TimerApi {
  state: TimerState;
  remainingMs: number;
  progress: number;
  synced: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  setSubject: (id: string | null) => void;
}

const TimerContext = createContext<TimerApi | null>(null);

export function TimerProvider({ children }: { children: ReactNode }) {
  const { state: app, dispatch } = useStore();
  const userId = useUserId();
  const me = useRef(deviceId()).current;
  const [now, setNow] = useState(() => Date.now());
  const [synced, setSynced] = useState(false);

  const [timer, setTimer] = useState<TimerState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as TimerState;
    } catch {
      /* ignorieren */
    }
    return {
      status: 'idle',
      phase: 'focus',
      subjectId: null,
      durationMs: phaseMs('focus', app.timer),
      startedAt: null,
      elapsedMs: 0,
      completedFocus: 0,
      updatedAt: 0,
      deviceId: me,
    };
  });
  const timerRef = useRef(timer);
  timerRef.current = timer;

  // Lokale Änderung: speichern und an den Server schicken.
  const commit = useCallback(
    (next: Omit<TimerState, 'updatedAt' | 'deviceId'>) => {
      const full: TimerState = { ...next, updatedAt: Date.now(), deviceId: me };
      setTimer(full);
      supabase
        .from('timer_state')
        .upsert({ user_id: userId, state: full, updated_at: full.updatedAt })
        .then(({ error }) => {
          if (error) setSynced(false);
        });
    },
    [me, userId],
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(timer));
    } catch {
      /* ignorieren */
    }
  }, [timer]);

  // Zustand anderer Geräte empfangen.
  useEffect(() => {
    const take = (incoming: TimerState | null | undefined) => {
      if (incoming && incoming.updatedAt > timerRef.current.updatedAt) setTimer(incoming);
    };
    supabase
      .from('timer_state')
      .select('state')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => take(data?.state as TimerState | undefined));
    const channel = supabase
      .channel(`timer:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'timer_state', filter: `user_id=eq.${userId}` },
        (payload) => take((payload.new as { state?: TimerState }).state),
      )
      .subscribe((status) => setSynced(status === 'SUBSCRIBED'));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // Anzeige aktualisieren.
  useEffect(() => {
    if (timer.status !== 'running') return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [timer.status]);

  // Dauer übernehmen, wenn sich die Einstellungen ändern und der Timer steht.
  useEffect(() => {
    const t = timerRef.current;
    if (t.status === 'idle') {
      const durationMs = phaseMs(t.phase, app.timer);
      if (durationMs !== t.durationMs) setTimer({ ...t, durationMs });
    }
  }, [app.timer]);

  const recordFocus = useCallback(
    (t: TimerState, at: number) => {
      // Mit Kennung der Phase darf jedes Gerät speichern, die Session hat überall dieselbe ID (die Datenbank überschreibt sie nur).
      // Das fängt ab, dass ein Gerät im Hintergrund das Ende nicht mehr rechtzeitig merkt. Ältere Stände ohne Kennung speichert nur das letzte Gerät, das etwas geändert hat.
      if (t.phase !== 'focus' || (!t.runId && t.deviceId !== me)) return;
      const minutes = Math.floor(Math.min(elapsedOf(t, at), t.durationMs) / 60_000);
      if (minutes < 1) return;
      dispatch({
        type: 'addSession',
        session: { id: t.runId ? `run-${t.runId}` : uid(), subjectId: t.subjectId, startedAt: at - minutes * 60_000, endedAt: at, minutes },
      });
    },
    [dispatch, me],
  );

  const nextPhase = useCallback(
    (t: TimerState): Pick<TimerState, 'phase' | 'durationMs' | 'completedFocus'> => {
      if (t.phase === 'focus') {
        const completed = t.completedFocus + 1;
        const phase: TimerPhase = completed % app.timer.sessionsUntilLongBreak === 0 ? 'longBreak' : 'shortBreak';
        return { phase, durationMs: phaseMs(phase, app.timer), completedFocus: completed };
      }
      return { phase: 'focus', durationMs: phaseMs('focus', app.timer), completedFocus: t.completedFocus };
    },
    [app.timer],
  );

  // Phase abgeschlossen.
  useEffect(() => {
    if (timer.status !== 'running') return;
    if (elapsedOf(timer, now) < timer.durationMs) return;
    recordFocus(timer, now);
    commit({ ...timer, ...nextPhase(timer), status: 'idle', startedAt: null, elapsedMs: 0, runId: null });
  }, [now, timer, recordFocus, nextPhase, commit]);

  const api = useMemo<TimerApi>(() => {
    const elapsed = elapsedOf(timer, now);
    return {
      state: timer,
      remainingMs: Math.max(0, timer.durationMs - elapsed),
      progress: timer.durationMs ? Math.min(1, elapsed / timer.durationMs) : 0,
      synced,
      start: () => {
        const t = timerRef.current;
        if (t.status === 'running') return;
        setNow(Date.now());
        commit({ ...t, status: 'running', startedAt: Date.now(), runId: t.runId ?? uid() });
      },
      pause: () => {
        const t = timerRef.current;
        if (t.status !== 'running') return;
        commit({ ...t, status: 'paused', elapsedMs: elapsedOf(t, Date.now()), startedAt: null });
      },
      reset: () => {
        const t = timerRef.current;
        recordFocus(t, Date.now());
        commit({ ...t, status: 'idle', startedAt: null, elapsedMs: 0, durationMs: phaseMs(t.phase, app.timer), runId: null });
      },
      skip: () => {
        const t = timerRef.current;
        recordFocus(t, Date.now());
        commit({ ...t, ...nextPhase(t), status: 'idle', startedAt: null, elapsedMs: 0, runId: null });
      },
      setSubject: (id) => commit({ ...timerRef.current, subjectId: id }),
    };
  }, [timer, now, synced, commit, recordFocus, nextPhase, app.timer]);

  return <TimerContext.Provider value={api}>{children}</TimerContext.Provider>;
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer muss innerhalb von TimerProvider verwendet werden');
  return ctx;
}
