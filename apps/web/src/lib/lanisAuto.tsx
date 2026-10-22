import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { CONFIG, diagnoseDsb, dsbNextStep, dsbSample, type DsbDiagnosis } from '@study/core';
import { applyDsbPlans, applyLanis, DSB_ERRORS, LANIS_ERRORS, lanisErrorCode, type DsbResponse, type LanisResponse } from './lanisApply';
import { decryptText, encryptText } from './secureStore';
import { supabase } from './supabase';

/**
 * Automatische Aktualisierung aus Lanis. Nur mit ausdrücklicher Zustimmung des Nutzers: Die Zugangsdaten bleiben
 * verschlüsselt auf diesem Gerät (siehe secureStore.ts) und gehen nur bei einem Abruf über die Edge Function an Lanis.
 * Bei abgelehnter Anmeldung schaltet sich die Automatik ab, damit das Schulkonto nicht durch Fehlversuche gesperrt wird.
 *
 * Vertretungsplan aus DSBmobile (viele Schulen veröffentlichen ihn dort statt in Lanis): eigene Zugangsdaten, gleiche
 * Regeln. Ist DSBmobile eingerichtet, kommen die Vertretungen von dort und Lanis wird dafür nicht mehr gefragt.
 */

const CREDS_KEY = 'study-app-lanis-creds';
const DSB_KEY = 'study-app-dsb-creds';
const DIAG_KEY = 'study-app-dsb-diag';
const META_KEY = 'study-app-lanis-meta';
const HOUR = 3_600_000;
const MAX_AGE = { substitutions: 3 * HOUR, timetable: 24 * HOUR, calendar: 12 * HOUR, absences: 12 * HOUR };
const MIN_TRY_GAP = 20 * 60_000;

export interface LanisCreds {
  schoolId: string;
  username: string;
  password: string;
}

/** Was der letzte Abruf aus DSBmobile gebracht hat (zur Fehlersuche, enthält keine Zugangsdaten). */
export interface DsbInfo {
  at: number;
  diag: DsbDiagnosis;
  sample: string;
  menu: { title: string; host: string; file: string; loaded: boolean }[];
  /** Anfang jeder geladenen Seite (ohne Tags), damit man sieht, was darin steht */
  heads: string[];
  /** Kennung des Menüs und Veröffentlichungsdatum laut DSBmobile ("22.10.2026 18:35") */
  version?: string | null;
  published?: string | null;
  /** Wurde der Plan übernommen (sonst blieb der alte Stand), und waren alle Seiten da? */
  stored?: boolean;
  partial?: boolean;
}

export function readDsbInfo(): DsbInfo | null {
  try {
    return JSON.parse(localStorage.getItem(DIAG_KEY) ?? 'null') as DsbInfo | null;
  } catch {
    return null;
  }
}

export interface DsbCreds {
  user: string;
  password: string;
}

interface Meta {
  at: number; // letzter erfolgreicher Abruf
  calAt: number; // letzter Abruf des Kalenders
  absAt: number; // letzter Abruf der Fehlstunden (auch wenn Lanis keine Tabelle hatte)
  tryAt: number; // letzter Versuch, auch bei Fehler
  dsbAt: number; // letzter erfolgreicher voller Abruf aus DSBmobile
  dsbTryAt: number;
  dsbCheckAt: number; // letzte erfolgreiche Verbindung zu DSBmobile (auch die leichte Prüfung)
  dsbChangedAt: number; // wann die App zuletzt etwas Neues bei DSBmobile erkannt hat
  dsbVersion: string | null; // Kennung des Menüs beim letzten verarbeiteten Abruf
  dsbPublished: string | null; // Veröffentlichungsdatum laut DSBmobile
  dsbOk: boolean; // der letzte volle Abruf wurde übernommen
}

const META0: Meta = { at: 0, calAt: 0, absAt: 0, tryAt: 0, dsbAt: 0, dsbTryAt: 0, dsbCheckAt: 0, dsbChangedAt: 0, dsbVersion: null, dsbPublished: null, dsbOk: true };

export interface DsbMeta {
  checkAt: number;
  changedAt: number;
  published: string | null;
}

/** Wann zuletzt mit DSBmobile gesprochen wurde und wann dort zuletzt etwas Neues erschien (für die Anzeige). */
export function readDsbMeta(): DsbMeta {
  const m = readMeta();
  return { checkAt: m.dsbCheckAt, changedAt: m.dsbChangedAt, published: m.dsbPublished };
}

const readMeta = (): Meta => {
  try {
    return { ...META0, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
  } catch {
    return { ...META0 };
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

const hasDsb = () => {
  try {
    return Boolean(localStorage.getItem(DSB_KEY));
  } catch {
    return false;
  }
};

interface LanisAutoApi {
  /** Lanis (Stundenplan, Klausuren, Fehlstunden) wird automatisch gelesen */
  enabled: boolean;
  /** Vertretungsplan aus DSBmobile wird automatisch gelesen */
  dsbEnabled: boolean;
  /** Zeitpunkt des letzten Abrufs aus DSBmobile (ms), ändert sich mit jedem Abruf und jeder Prüfung */
  dsbAt: number;
  /** "Stand" des Plans laut Plankopf der Schule ("2026-10-22T14:25"), null wenn unbekannt */
  dsbStand: string | null;
  dsbError: string | null;
  enableDsb: (creds: DsbCreds) => Promise<void>;
  disableDsb: (reason?: string) => void;
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
  const [dsbEnabled, setDsbEnabled] = useState(hasDsb);
  const [dsbError, setDsbError] = useState<string | null>(null);
  const [dsbAt, setDsbAt] = useState(() => readDsbInfo()?.at ?? 0);
  const [dsbStand, setDsbStand] = useState<string | null>(() => readDsbInfo()?.diag.stand ?? null);
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
    writeMeta({ ...readMeta(), at: Date.now(), calAt: Date.now(), absAt: Date.now(), tryAt: Date.now() });
    setLastAt(Date.now());
    setError(null);
    setEnabled(true);
  }, []);

  const disableDsb = useCallback((reason?: string) => {
    try {
      localStorage.removeItem(DSB_KEY);
    } catch {
      // ignorieren
    }
    setDsbEnabled(false);
    setDsbError(reason ?? null);
  }, []);

  const enableDsb = useCallback(async (creds: DsbCreds) => {
    try {
      localStorage.setItem(DSB_KEY, await encryptText(JSON.stringify(creds)));
    } catch {
      setDsbError('Die Zugangsdaten konnten auf diesem Gerät nicht sicher gespeichert werden.');
      return;
    }
    writeMeta({ ...readMeta(), dsbAt: 0, dsbTryAt: 0, dsbVersion: null, dsbOk: true });
    setDsbError(null);
    setDsbEnabled(true);
  }, []);

  const refreshLanis = useCallback(
    async (force: boolean) => {
      const s = stateRef.current;
      const meta = readMeta();
      const now = Date.now();
      const age = (iso: string | null) => (iso ? now - Date.parse(iso) : Infinity);
      const parts: string[] = [];
      // Kommen die Vertretungen aus DSBmobile, wird Lanis dafür nicht gefragt.
      if (!hasDsb() && (force || age(s.substitutionsAt) > MAX_AGE.substitutions)) parts.push('substitutions');
      if (force || age(s.timetableAt) > MAX_AGE.timetable) parts.push('timetable');
      if (force || now - meta.calAt > MAX_AGE.calendar) parts.push('calendar');
      if (force || now - meta.absAt > MAX_AGE.absences) parts.push('absences');
      if (parts.length === 0 || (!force && now - meta.tryAt < MIN_TRY_GAP)) return;

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
        const m = readMeta();
        writeMeta({ ...m, at: done, calAt: parts.includes('calendar') ? done : m.calAt, absAt: parts.includes('absences') ? done : m.absAt, tryAt: done });
        setLastAt(done);
        setError(null);
      } catch {
        setError('Aktualisierung aus Lanis gerade nicht möglich.');
      }
    },
    [dispatch, disable],
  );

  const refreshDsb = useCallback(
    async (force: boolean) => {
      const meta = readMeta();
      const now = Date.now();
      const s0 = stateRef.current;
      const step = dsbNextStep({ version: meta.dsbVersion, ok: meta.dsbOk, tryAt: meta.dsbTryAt }, s0.substitutionsAt ? Date.parse(s0.substitutionsAt) : null, now, force);
      if (step === 'skip') return;
      // Der Plan gilt für die ganze Schule, ohne Stundenplan ließe sich nicht auf deine Stunden filtern.
      if (!s0.timetable) {
        setDsbError('Hol zuerst deinen Stundenplan aus Lanis. Damit sucht die App aus dem Plan der ganzen Schule deine Vertretungen heraus.');
        return;
      }
      writeMeta({ ...meta, dsbTryAt: now });
      try {
        const raw = await decryptText(localStorage.getItem(DSB_KEY));
        const creds = raw ? (JSON.parse(raw) as DsbCreds) : null;
        if (!creds) return disableDsb('Die gespeicherten Zugangsdaten sind nicht mehr lesbar. Verbinde DSBmobile neu.');
        const call = async (onlyMenu: boolean): Promise<DsbResponse | null> => {
          const { data, error: err } = await supabase.functions.invoke<DsbResponse>('dsb-plan', {
            body: { dsbUser: creds.user, dsbPassword: creds.password, ...(onlyMenu ? { onlyMenu: true } : {}) },
          });
          if (err || !data) {
            const code = await lanisErrorCode(err);
            if (code === 'login_failed') disableDsb(`${DSB_ERRORS.login_failed} Die Automatik ist ausgeschaltet.`);
            else setDsbError(code ? DSB_ERRORS[code] ?? null : 'Aktualisierung aus DSBmobile gerade nicht möglich.');
            return null;
          }
          return data;
        };

        // Leichte Prüfung: nur das Menü. Nur wenn sich die Kennung ändert, kommt der volle Abruf.
        let changed = false;
        if (step === 'check') {
          const light = await call(true);
          if (!light) return;
          const m = readMeta();
          if (light.version && light.version === m.dsbVersion) {
            writeMeta({ ...m, dsbCheckAt: Date.now(), dsbPublished: light.published ?? m.dsbPublished });
            setDsbAt(Date.now());
            setDsbError(null);
            return;
          }
          changed = true;
        }

        const data = await call(false);
        if (!data) return;
        const at = Date.now();
        const latest = stateRef.current;
        const applied = applyDsbPlans(data, latest.timetable, latest.substitutions);
        const m = readMeta();
        const isNew = changed || (data.version ?? null) !== m.dsbVersion;
        const pages = (data.plans ?? []).map((p) => p.html);
        try {
          const heads = pages.map((h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500));
          localStorage.setItem(
            DIAG_KEY,
            JSON.stringify({
              at,
              diag: diagnoseDsb(pages, latest.timetable),
              sample: dsbSample(pages),
              menu: data.menu ?? [],
              heads,
              version: data.version ?? null,
              published: data.published ?? null,
              stored: applied.next !== null,
              partial: data.partial === true,
            } satisfies DsbInfo),
          );
        } catch {
          // ignorieren
        }
        if (applied.next === null) {
          // Kaputter oder leerer Abruf: der gespeicherte Stand bleibt, der Abruf zählt als nicht übernommen (bald wieder versuchen)
          writeMeta({ ...m, dsbVersion: data.version ?? m.dsbVersion, dsbOk: false, dsbCheckAt: at, dsbTryAt: at, dsbPublished: data.published ?? m.dsbPublished });
          setDsbAt(at);
          setDsbError(applied.message);
          return;
        }
        dispatch({ type: 'setSubstitutions', substitutions: applied.next, at: new Date(at).toISOString() });
        writeMeta({
          ...m,
          dsbAt: at,
          dsbTryAt: at,
          dsbCheckAt: at,
          dsbChangedAt: isNew ? at : m.dsbChangedAt,
          dsbVersion: data.version ?? null,
          dsbPublished: data.published ?? m.dsbPublished,
          dsbOk: data.partial !== true && applied.read.incomplete.length === 0,
        });
        setDsbAt(at);
        setDsbStand(applied.read.stand);
        setDsbError(applied.message);
      } catch {
        setDsbError('Aktualisierung aus DSBmobile gerade nicht möglich.');
      }
    },
    [dispatch, disableDsb],
  );

  const refresh = useCallback(
    async (force = false) => {
      if (running.current || !navigator.onLine || (!hasCreds() && !hasDsb())) return;
      running.current = true;
      setBusy(true);
      try {
        if (hasCreds()) await refreshLanis(force);
        if (hasDsb()) await refreshDsb(force); // nach Lanis: der Stundenplan ist dann frisch
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [refreshLanis, refreshDsb],
  );

  // Beim Start und wenn die App wieder in den Vordergrund kommt.
  useEffect(() => {
    if (!enabled && !dsbEnabled) return;
    const first = window.setTimeout(() => void refresh(), 2500);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    // Bei geöffneter, sichtbarer App alle paar Minuten bei DSBmobile nachsehen, ob es etwas Neues gibt (leichte Prüfung, siehe dsbNextStep)
    const every = window.setInterval(onVisible, CONFIG.dsb.checkEveryMin * 60_000);
    return () => {
      window.clearInterval(every);
      window.clearTimeout(first);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [enabled, dsbEnabled, refresh]);

  const value = useMemo(
    () => ({ enabled, busy, error, lastAt, enable, disable, refresh, dsbEnabled, dsbError, enableDsb, disableDsb, dsbAt, dsbStand }),
    [enabled, busy, error, lastAt, enable, disable, refresh, dsbEnabled, dsbError, dsbAt, dsbStand, enableDsb, disableDsb],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLanisAuto(): LanisAutoApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLanisAuto muss innerhalb von LanisAutoProvider verwendet werden');
  return ctx;
}
