import { isNewerVersion } from '@study/core';
import { useEffect, useState } from 'react';
import { APP_VERSION, RELEASE_NOTES, type ReleaseNote } from '../releaseNotes';
import { useStore } from '../state/store';
import { useAccess } from '../lib/access';

const SEEN_KEY = 'study-app-seen-version';
export const SHOW_NOTES_EVENT = 'study-app:show-release-notes';

const COSTS = /Cent|Dollar|\$|Haiku|Sonnet|Opus|Groq|Budget|Admin-Protokoll|Modell/;

/** Für Freunde: Kosten und Modelle aus den Texten nehmen (Klammern und ganze Sätze, die davon handeln). */
export function withoutCosts(text: string): string {
  const noParens = text.replace(/\s*\([^)]*\)/g, (m) => (COSTS.test(m) ? '' : m));
  return noParens
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !COSTS.test(sentence))
    .join(' ')
    .trim();
}

/** Nur die Einträge, die dieses Konto betreffen. */
export function notesFor(notes: ReleaseNote[], isAdmin: boolean, can: (f: Exclude<NonNullable<ReleaseNote['items'][number]['only']>, 'admin'>) => boolean): ReleaseNote[] {
  if (isAdmin) return notes;
  return notes
    .map((n) => ({
      ...n,
      items: n.items
        .filter((i) => !i.only || (i.only !== 'admin' && can(i.only)))
        .map((i) => ({ ...i, text: withoutCosts(i.text) }))
        .filter((i) => i.text),
    }))
    .filter((n) => n.items.length > 0);
}

/** Zeigt die Neuigkeiten einmal nach einem Update. Aus den Einstellungen lässt sich die ganze Liste öffnen. */
export function ReleaseNotes() {
  const { state } = useStore();
  const access = useAccess();
  const visible = (list: ReleaseNote[]) => notesFor(list, access.isAdmin, access.can);
  const [shown, setShown] = useState<typeof RELEASE_NOTES | null>(null);

  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
    } catch {
      // ignorieren
    }
    if (seen === APP_VERSION) return;
    if (seen === null && !state.onboarded) {
      // Neue Installation: nichts anzeigen, nur merken.
      try {
        localStorage.setItem(SEEN_KEY, APP_VERSION);
      } catch {
        // ignorieren
      }
      return;
    }
    const news = RELEASE_NOTES.filter((n) => seen === null || isNewerVersion(n.version, seen)).slice(0, 3);
    if (visible(news).length > 0) setShown(news);
  }, [state.onboarded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const open = () => setShown(RELEASE_NOTES);
    window.addEventListener(SHOW_NOTES_EVENT, open);
    return () => window.removeEventListener(SHOW_NOTES_EVENT, open);
  }, []);

  if (!shown) return null;
  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, APP_VERSION);
    } catch {
      // ignorieren
    }
    setShown(null);
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={close}>
      <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="notes-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="notes-title">Neuigkeiten</h2>
        <div className="modal-body stack" style={{ gap: 18 }}>
          {visible(shown).map((n) => (
            <section key={n.version} className="stack" style={{ gap: 10 }}>
              <div className="between">
                <strong>{n.date}</strong>
                <span className="tag">Version {n.version}</span>
              </div>
              {n.items.map((i) => (
                <div key={i.title} className="note-item">
                  <span className="note-icon" aria-hidden="true">
                    {i.icon}
                  </span>
                  <div>
                    <strong>{i.title}</strong>
                    <p className="muted">{i.text}</p>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-block" onClick={close} autoFocus>
          Verstanden
        </button>
      </div>
    </div>
  );
}
