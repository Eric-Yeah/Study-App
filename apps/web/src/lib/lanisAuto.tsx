import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { applyLanis, LANIS_ERRORS, lanisErrorCode, type LanisResponse } from './lanisApply';
import { decryptText, encryptText } from './secureStore';
import { supabase } from './supabase';

/**
 * Automatische Aktualisierung aus Lanis. Nur mit ausdrücklicher Zustimmung des Nutzers: Die Zugangsdaten bleiben
 * verschlüsselt auf diesem Gerät (siehe secureStore.ts) und gehen nur bei einem Abruf über die Edge Function an Lanis.
 * Bei abgelehnter Anmeldung schaltet sich die Automatik ab, damit das Schulkonto nicht durch Fehlversuche gesperrt wird.
 */

const CREDS_KEY = 'study-app-lanis-creds';
const META_KEY = 'study-app-lanis-meta';
const HOUR = 3_600_000;
const MAX_AGE = { substitutions: 3 * HOUR, timetable: 24 * HOUR, calendar: 12 * HOUR };
const MIN_TRY_GAP = 20 * 60_000;

export interface LanisCreds {
  schoolId: string;
  username: string;
  password: string;
}

interface Meta {
  at: number; // letzter erfolgreicher Abruf
  calAt: number; // letzter Abruf des Kalenders
  tryAt: number; // letzter Versuch, auch bei Fehler
}

const readMeta = (): Meta => {
  try {
    return { at: 0, calAt: 0, tryAt: 0, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
  } catch {
    return { at: 0, calAt: 0, tryAt: 0 };
  }
};
const writeMeta = (m: Meta) => {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    // ignorieren
  }
};
const hasCreds = () => {
  try {
    return Boolean(localStorage.getItem(CREDS_KEY));
  } catch {
    return false;
  }
};

interface LanisAutoApi {
  enabled: boolean;
  busy: boolean;
  error: string | null;
  /** Zeitpunkt des letzten erfolgreichen Abrufs (ms) oder 0 */
  lastAt: number;
  enable: (creds: LanisCreds) => Promise<void>;
  disable: (reason?: string) => void;
  refresh: (force?: boolean) => Promise<void>;
}

const Ctx = createContext<LanisAutoApi | null>(null);

export function LanisAutoProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = useStore();
  const stateRef = useRef(state);
  stateRef.current = state;
  const [enabled, setEnabled] = useState(hasCreds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState(() => readMeta().at);
  const running = useRef(false);

  const disable = useCallback((reason?: string) => {
    try {
      localStorage.removeItem(CREDS_KEY);
    } catch {
      // ignorieren
    }
    setEnabled(false);
    setError(reason ?? null);
  }, []);

  const enable = useCallback(async (creds: LanisCreds) => {
    try {
      localStorage.setItem(CREDS_KEY, await encryptText(JSON.stringify(creds)));
    } catch {
      setError('Die Zugangsdaten konnten auf diesem Gerät nicht sicher gespeichert werden.');
      return;
    }
    writeMeta({ at: Date.now(), calAt: Date.now(), tryAt: Date.now() });
    setLastAt(Date.now());
    setError(null);
    setEnabled(true);
  }, []);

  const refresh = useCallback(
    async (force = false) => {
      if (running.current || !hasCreds() || !navigator.onLine) return;
      const s = stateRef.current;
      const meta = readMeta();
      const now = Date.now();
      const age = (iso: string | null) => (iso ? now - Date.parse(iso) : Infinity);
      const parts: string[] = [];
      if (force || age(s.substitutionsAt) > MAX_AGE.substitutions) parts.push('substitutions');
      if (force || age(s.timetableAt) > MAX_AGE.timetable) parts.push('timetable');
      if (force || now - meta.calAt > MAX_AGE.calendar) parts.push('calendar');
      if (parts.length === 0 || (!force && now - meta.tryAt < MIN_TRY_GAP)) return;

      running.current = true;
      setBusy(true);
      writeMeta({ ...meta, tryAt: now });
      try {
        const raw = await decryptText(localStorage.getItem(CREDS_KEY));
        const creds = raw ? (JSON.parse(raw) as LanisCreds) : null;
        if (!creds) return disable('Die gespeicherten Zugangsdaten sind nicht mehr lesbar. Verbinde Lanis neu.');
        const { data, error: err } = await supabase.functions.invoke<LanisResponse>('lanis-calendar', { body: { ...creds, parts } });
        if (err || !data) {
          const code = await lanisErrorCode(err);
          if (code === 'login_failed') return disable(`${LANIS_ERRORS.login_failed} Die Automatik ist ausgeschaltet, damit dein Konto nicht gesperrt wird.`);
          setError(code ? LANIS_ERRORS[code] ?? null : 'Aktualisierung aus Lanis gerade nicht möglich.');
          return;
        }
        const latest = stateRef.current;
        applyLanis(data, { subjects: latest.subjects, exams: latest.exams, dispatch });
        const done = Date.now();
        writeMeta({ at: done, calAt: parts.includes('calendar') ? done : meta.calAt, tryAt: done });
        setLastAt(done);
        setError(null);
      } catch {
        setError('Aktualisierung aus Lanis gerade nicht möglich.');
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [dispatch, disable],
  );

  // Beim Start und wenn die App wieder in den Vordergrund kommt.
  useEffect(() => {
    if (!enabled) return;
    const first = window.setTimeout(() => void refresh(), 2500);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      window.clearTimeout(first);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [enabled, refresh]);

  const value = useMemo(() => ({ enabled, busy, error, lastAt, enable, disable, refresh }), [enabled, busy, error, lastAt, enable, disable, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLanisAuto(): LanisAutoApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLanisAuto muss innerhalb von LanisAutoProvider verwendet werden');
  return ctx;
}
