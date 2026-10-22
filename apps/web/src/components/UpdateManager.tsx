import { isNewerVersion } from '@study/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { APP_VERSION } from '../releaseNotes';

const TRY_KEY = 'study-app-update-try'; // Schleifenschutz: dieselbe Version nicht öfter als alle 10 Minuten automatisch laden
const MIN_CHECK_MS = 2 * 60_000;
const SKIP_ROUTES = /^\/(klausur\/|korrektur|import|start)/; // dort liegen Entwürfe, Uploads oder Passwörter, nicht mitten drin neu laden

function recentlyTried(version: string): boolean {
  try {
    const t = JSON.parse(localStorage.getItem(TRY_KEY) ?? 'null') as { v: string; at: number } | null;
    return Boolean(t && t.v === version && Date.now() - t.at < 10 * 60_000);
  } catch {
    return false;
  }
}

function reloadInto(version: string) {
  try {
    localStorage.setItem(TRY_KEY, JSON.stringify({ v: version, at: Date.now() }));
  } catch {
    // ignorieren
  }
  window.location.reload();
}

/** Prüft regelmäßig auf eine neue Version (version.json), lädt sie automatisch, wenn gerade nichts bearbeitet wird. */
export function UpdateManager() {
  const { pathname } = useLocation();
  const [available, setAvailable] = useState<string | null>(null);
  const lastCheck = useRef(0);

  const check = useCallback(async (force = false) => {
    if (!force && Date.now() - lastCheck.current < MIN_CHECK_MS) return;
    lastCheck.current = Date.now();
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const { version } = (await res.json()) as { version?: string };
      if (version && isNewerVersion(version, APP_VERSION)) setAvailable(version);
    } catch {
      // kein Netz: später wieder
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void check(true), 3000);
    const every = window.setInterval(() => void check(true), 15 * 60_000);
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [check]);

  // Automatisch laden, sobald gerade nichts bearbeitet wird.
  useEffect(() => {
    if (!available || recentlyTried(available)) return;
    const id = window.setInterval(() => {
      const el = document.activeElement;
      const typing = el instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
      // data-no-reload: Seiten mit Entwurf im Speicher (Blatt hochladen, Lernrunde der Karten) lädt die App nicht von selbst neu
      const guarded = document.querySelector('[data-no-reload]') !== null;
      if (!typing && !guarded && !SKIP_ROUTES.test(pathname)) reloadInto(available);
    }, 1500);
    return () => window.clearInterval(id);
  }, [available, pathname]);

  if (!available) return null;
  return (
    <div className="update-banner" role="status">
      <span>
        <strong>Neue Version {available}</strong>
        <small>Wird automatisch geladen, sobald du fertig bist.</small>
      </span>
      <button type="button" className="btn btn-primary" onClick={() => reloadInto(available)}>
        Jetzt aktualisieren
      </button>
    </div>
  );
}
