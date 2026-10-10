import { useStore } from '../state/store';
import { useState } from 'react';

const ago = (ms: number) => {
  if (!ms) return 'noch nie';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 10) return 'gerade eben';
  if (s < 60) return `vor ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `vor ${h} h` : `vor ${Math.round(h / 24)} Tagen`;
};

/** Einstellungen: Abgleich zwischen Mac, iPad und Handy, plus Hilfe zur Installation. */
export function DevicesCard() {
  const { sync, refresh, syncError } = useStore();
  const [busy, setBusy] = useState(false);
  return (
    <div className="card stack">
      <div className="between">
        <h2>Geräte</h2>
        <span className={`tag${sync.live ? '' : ' warn'}`}>{sync.live ? 'live verbunden' : 'gleicht beim Öffnen ab'}</span>
      </div>
      <p className="muted">
        Alle deine Geräte (Computer, Tablet, Handy) nutzen dasselbe Konto. Änderungen erscheinen auf den anderen Geräten sofort, der Timer läuft überall mit. Letzter
        Abgleich: {ago(sync.at)}.
      </p>
      {syncError && (
        <p className="notice" role="alert">
          {syncError}
        </p>
      )}
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await refresh();
          setBusy(false);
        }}
      >
        {busy ? 'Gleiche ab …' : 'Jetzt abgleichen'}
      </button>
      <div className="stack" style={{ gap: 8 }}>
        <strong>Auf dem iPad oder iPhone installieren</strong>
        <ol className="steps-list">
          <li>Die Adresse der App in Safari öffnen und anmelden.</li>
          <li>Auf das Teilen-Symbol tippen und „Zum Home-Bildschirm“ wählen.</li>
          <li>Die App startet danach im Vollbild mit eigenem Symbol, wie eine normale App.</li>
        </ol>
        <p className="hint">
          Am Mac reicht der Browser. In Safari geht „Zum Dock hinzufügen“ (Datei-Menü), in Chrome „Installieren“ in der Adresszeile.
        </p>
      </div>
    </div>
  );
}
