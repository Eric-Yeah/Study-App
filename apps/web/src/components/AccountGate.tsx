import { Clock, LogOut, ShieldOff, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { setAdminView } from '../lib/adminView';
import { useAuth } from '../lib/auth';
import { deleteOwnAccount } from '../lib/accountApi';
import { useStore } from '../state/store';

const LOGO = `${import.meta.env.BASE_URL}favicon.svg`;

/** Zeigt die App nur freigegebenen Konten. Wartende sehen einen Hinweis, gesperrte eine Meldung. */
export function AccountGate({ children }: { children: ReactNode }) {
  const { state, refresh } = useStore();
  const { user, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = state.account.status;
  const admin = status === 'active' && state.account.isAdmin;
  setAdminView(admin);
  useEffect(() => setAdminView(admin), [admin]);
  if (status === 'active') return <>{children}</>;

  const check = async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  };
  const remove = async () => {
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

  return (
    <div className="stack" style={{ maxWidth: 420, margin: '10vh auto', padding: 16, gap: 20 }}>
      <div className="stack" style={{ gap: 16 }}>
        <h1 className="row" style={{ gap: 10, alignItems: 'center' }}>
          <img src={LOGO} alt="" width={32} height={32} />
          Study App
        </h1>
        <div className="card stack">
          {status === 'blocked' ? (
            <>
              <h2 className="row" style={{ gap: 8 }}>
                <ShieldOff size={20} aria-hidden="true" /> Konto gesperrt
              </h2>
              <p className="muted">Dieses Konto ist im Moment gesperrt. Wenn du glaubst, dass das ein Fehler ist, frag die Person, die dir die App gegeben hat.</p>
            </>
          ) : (
            <>
              <h2 className="row" style={{ gap: 8 }}>
                <Clock size={20} aria-hidden="true" /> Fast geschafft
              </h2>
              <p className="muted">Dein Konto ist angelegt und wartet auf Freischaltung. Sobald es freigegeben ist, geht es hier automatisch weiter.</p>
              {user?.email && <p className="hint">Angemeldet als {user.email}</p>}
              <button type="button" className="btn btn-primary" disabled={checking} onClick={() => void check()}>
                {checking ? 'Einen Moment …' : 'Erneut prüfen'}
              </button>
            </>
          )}
          <button type="button" className="btn" onClick={() => void signOut()}>
            <LogOut size={16} aria-hidden="true" /> Abmelden
          </button>
        </div>
        <details className="card">
          <summary className="muted">Konto löschen</summary>
          <div className="stack" style={{ marginTop: 12 }}>
            <p className="hint">Löscht dein Konto mit allen Daten. Das lässt sich nicht rückgängig machen.</p>
            <label className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> Ja, mein Konto endgültig löschen
            </label>
            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="btn" disabled={!confirm || busy} onClick={() => void remove()}>
              <Trash2 size={16} aria-hidden="true" /> {busy ? 'Wird gelöscht …' : 'Konto löschen'}
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
