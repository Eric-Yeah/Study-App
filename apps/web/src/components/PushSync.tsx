import { CONFIG, buildPushItems } from '@study/core';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserId } from '../lib/auth';
import { currentSub, prefsSnapshot, subscribePrefs, syncQueue } from '../lib/push';
import { pushInputFrom } from '../lib/pushInput';
import { useStore } from '../state/store';

const REFRESH_MS = 30 * 60 * 1000;

/**
 * Hält die Warteschlange der Erinnerungen aktuell: berechnet die Mitteilungen aus dem Plan und ersetzt die offenen auf dem Server,
 * kurz nach jeder Änderung, beim Zurückkehren in die App und alle 30 Minuten. Zeigt nichts an. Tippen auf eine Mitteilung öffnet die Seite.
 */
export function PushSync() {
  const { state } = useStore();
  const userId = useUserId();
  const navigate = useNavigate();
  const prefs = useSyncExternalStore(subscribePrefs, prefsSnapshot);
  const stateRef = useRef(state);
  stateRef.current = state;
  const last = useRef('');
  const busy = useRef(false);

  const run = useRef(async (force = false) => {
    if (busy.current || !('Notification' in window) || Notification.permission !== 'granted') return;
    const p = prefsSnapshot();
    if (!p.on) return;
    busy.current = true;
    try {
      if (!(await currentSub())) return;
      const now = new Date();
      const items = buildPushItems({ now, prefs: p, ...pushInputFrom(stateRef.current, now) });
      const key = JSON.stringify([p, items]);
      if (!force && key === last.current) return;
      await syncQueue(userId, items);
      last.current = key;
    } catch (e) {
      console.warn('Erinnerungen:', e instanceof Error ? e.message : e);
    } finally {
      busy.current = false;
    }
  });

  // Nach Änderungen am Plan, an Fächern, Klausuren, Lernzeit oder Einstellungen
  useEffect(() => {
    if (!prefs.on) return;
    const t = window.setTimeout(() => void run.current(), CONFIG.push.syncDelayMs);
    return () => window.clearTimeout(t);
  }, [prefs, state.exams, state.subjects, state.sessions, state.plan, state.dayOverrides, state.topics, state.tasks, state.cards]);

  // Beim Zurückkehren und regelmäßig, denn die Texte hängen vom Tag ab
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === 'visible') void run.current(true);
    };
    document.addEventListener('visibilitychange', onShow);
    const timer = window.setInterval(() => void run.current(true), REFRESH_MS);
    return () => {
      document.removeEventListener('visibilitychange', onShow);
      window.clearInterval(timer);
    };
  }, []);

  // Tippen auf eine Mitteilung, während die App offen ist
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const u = (e.data as { studyNotify?: unknown } | null)?.studyNotify;
      if (typeof u === 'string' && u.startsWith('/')) navigate(u);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  return null;
}
