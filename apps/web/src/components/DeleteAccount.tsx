import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { deleteOwnAccount } from '../lib/accountApi';
import { useAuth } from '../lib/auth';

/** Eigenes Konto löschen (Einstellungen → Konto). Mit Bestätigung, löscht alle Daten und Dateien. */
export function DeleteAccount() {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteOwnAccount();
      await signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Das Konto konnte nicht gelöscht werden.');
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
        Konto löschen
      </button>
    );
  }
  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="hint">Löscht dein Konto mit allen Fächern, Klausuren, Notizen, Karten, PDFs und Einstellungen. Das lässt sich nicht rückgängig machen.</p>
      <label className="row" style={{ gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> Ja, mein Konto endgültig löschen
      </label>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-danger" disabled={!confirm || busy} onClick={() => void run()}>
          <Trash2 size={16} aria-hidden="true" /> {busy ? 'Wird gelöscht …' : 'Konto löschen'}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => setOpen(false)}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}
