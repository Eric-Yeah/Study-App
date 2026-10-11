import { useState } from 'react';
import { cleanupSureImages } from '../lib/worksheetApi';
import { useStore } from '../state/store';

/**
 * Einstellungen → Speicher: löscht die Bilder von Arbeitsblättern, die sicher gelesen wurden. Neue Blätter räumen sich selbst auf
 * (CONFIG.ai.deleteSureImages), das hier holt die älteren nach. Zusammenfassung und PDF bleiben.
 */
export function StorageCleanup() {
  const { state } = useStore();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const ids = state.notes.filter((n) => n.summary && n.legibility === 'sicher').map((n) => n.id);
      const removed = await cleanupSureImages(ids);
      setMessage(removed > 0 ? `${removed} Bilder gelöscht.` : 'Es gab nichts aufzuräumen.');
    } catch {
      setMessage('Das Aufräumen hat nicht geklappt. Versuche es später noch einmal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <h2>Speicher</h2>
      <p className="muted">
        Die Bilder der Arbeitsblätter werden nur gebraucht, solange etwas schwer lesbar war („Genauer lesen“). Bei sicher gelesenen Blättern
        löscht die App sie von selbst. Hier räumst du die älteren auf. Zusammenfassungen und PDFs bleiben.
      </p>
      <button type="button" className="btn" disabled={busy} onClick={() => void run()}>
        {busy ? 'Räume auf …' : 'Bilder sicher gelesener Blätter löschen'}
      </button>
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
