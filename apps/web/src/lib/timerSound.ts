import { toIsoDate } from '@study/core';

/**
 * Ton am Ende einer Timer-Phase. Standardmäßig aus, die Einstellung gilt pro Gerät (localStorage).
 * Der Ton wird im Browser erzeugt (Web Audio), es gibt keine Datei. Einmal am Tag fragt die App beim Start
 * eines Fokus-Timers, ob er ertönen soll (`askedOn`).
 */

export interface TimerSoundPrefs {
  on: boolean;
  /** Tag (JJJJ-MM-TT), an dem die App zuletzt gefragt hat. */
  askedOn: string | null;
}

const KEY = 'study-app-timer-sound-v1';
const EVENT = 'study-app:timer-sound';
const DEFAULTS: TimerSoundPrefs = { on: false, askedOn: null };

function read(): TimerSoundPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<TimerSoundPrefs> | null;
    return { on: raw?.on === true, askedOn: typeof raw?.askedOn === 'string' ? raw.askedOn : null };
  } catch {
    return DEFAULTS;
  }
}

let cached: { raw: string; prefs: TimerSoundPrefs } | null = null;
/** Für useSyncExternalStore: gleicher Wert, solange sich nichts geändert hat. */
export function soundPrefs(): TimerSoundPrefs {
  let raw = '';
  try {
    raw = localStorage.getItem(KEY) ?? '';
  } catch {
    raw = '';
  }
  if (!cached || cached.raw !== raw) cached = { raw, prefs: read() };
  return cached.prefs;
}

export function saveSoundPrefs(patch: Partial<TimerSoundPrefs>): void {
  const next = { ...soundPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ohne Speicher bleibt der Ton aus
  }
  cached = null;
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeSoundPrefs(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

/** Muss die App heute noch fragen? */
export function needsSoundQuestion(prefs: TimerSoundPrefs = soundPrefs(), now = new Date()): boolean {
  return prefs.askedOn !== toIsoDate(now);
}

/** Antwort auf die Tagesfrage speichern. */
export function answerSoundQuestion(on: boolean, now = new Date()): void {
  saveSoundPrefs({ on, askedOn: toIsoDate(now) });
}

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Browser lassen Ton erst nach einer Berührung zu: beim Starten des Timers aufrufen, damit er am Ende klingt. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}

/** Kurzer, sanfter Zweiklang (E6, dann A6). */
export function playChime(): void {
  const c = context();
  if (!c) return;
  const run = () => {
    const start = c.currentTime + 0.02;
    [
      { freq: 1318.5, at: 0 },
      { freq: 1760, at: 0.18 },
    ].forEach(({ freq, at }) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = start + at;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + 1.2);
    });
  };
  try {
    if (c.state === 'suspended') void c.resume().then(run).catch(() => undefined);
    else run();
  } catch {
    // Ton ist nur ein Zusatz, der Timer läuft auch ohne
  }
}

/** Ton am Ende einer Phase, wenn er an ist. */
export function chimeIfOn(): void {
  if (soundPrefs().on) playChime();
}
