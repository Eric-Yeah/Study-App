import { useCallback, useEffect, useState } from 'react';
import { useUserId } from '../lib/auth';
import { supabase } from '../lib/supabase';

interface Link {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
}

// Ohne ähnlich aussehende Zeichen (0/O, 1/I), damit sich der Code leichter abtippen lässt.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return 'STU-' + [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const fmt = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : 'noch nie';

/** Verbindung zur Fitness-App Overload: erzeugt einen Code, den Overload zum Senden braucht. */
export function FitnessLink() {
  const userId = useUserId();
  const [links, setLinks] = useState<Link[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('fitness_links')
      .select('id, label, created_at, last_used_at')
      .order('created_at');
    if (err) setError('Verbindungen konnten nicht geladen werden. Wurde die Migration für Fitness in Supabase ausgeführt?');
    else setLinks(data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setError(null);
    setCopied(false);
    const t = newToken();
    const { error: err } = await supabase
      .from('fitness_links')
      .insert({ user_id: userId, token_hash: await sha256Hex(t), label: 'Overload' });
    if (err) {
      setError('Code konnte nicht erzeugt werden.');
      return;
    }
    setToken(t);
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm('Verbindung trennen? Overload kann dann nichts mehr senden.')) return;
    const { error: err } = await supabase.from('fitness_links').delete().eq('id', id);
    if (err) setError('Verbindung konnte nicht getrennt werden.');
    setToken(null);
    await load();
  };

  return (
    <div className="card stack">
      <h2>Fitness-App verbinden</h2>
      <p className="muted">
        Overload schickt dir nur eine kleine Zusammenfassung pro Tag: Anzahl Einheiten, Minuten, Gym oder Laufen, Schlaf, die
        Belastung (Dauer mal Anstrengung) und die 7- und 28-Tage-Werte dazu. Die App nutzt sie für den Konzentrationsscore.
        Trainingsdetails bleiben in Overload.
      </p>

      {links.map((l) => (
        <div key={l.id} className="between">
          <div>
            <strong>{l.label}</strong>
            <p className="hint">
              Verbunden seit {fmt(l.created_at)}, zuletzt Daten erhalten: {fmt(l.last_used_at)}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-danger" onClick={() => void remove(l.id)}>
            Trennen
          </button>
        </div>
      ))}

      {token && (
        <div className="tile stack">
          <p className="muted">Dein Verbindungscode. Er wird nur jetzt angezeigt. Füge ihn in Overload ein.</p>
          <code style={{ wordBreak: 'break-all', fontSize: 16 }}>{token}</code>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void navigator.clipboard?.writeText(token).then(() => setCopied(true));
            }}
          >
            {copied ? 'Kopiert' : 'Code kopieren'}
          </button>
        </div>
      )}

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn" onClick={() => void create()}>
        {links.length ? 'Neuen Code erzeugen' : 'Code erzeugen'}
      </button>
      <p className="hint">Ein neuer Code macht die alten nicht ungültig. Trenne alte Verbindungen selbst.</p>
    </div>
  );
}
