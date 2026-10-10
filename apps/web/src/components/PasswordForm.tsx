import { useState, type FormEvent } from 'react';
import { germanAuthError as germanError, MIN_PASSWORD, passwordProblem } from '@study/core';
import { supabase } from '../lib/supabase';

/** Neues Passwort setzen (nach dem Zurücksetzen oder in den Einstellungen). Der Nutzer ist dafür angemeldet. */
export function PasswordForm({ onDone, submitLabel = 'Passwort speichern' }: { onDone: () => void; submitLabel?: string }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(password, repeat);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(germanError(err.message));
    else onDone();
  };

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Neues Passwort</span>
        <input className="input" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <span className="hint">Mindestens {MIN_PASSWORD} Zeichen.</span>
      </label>
      <label className="field">
        <span>Noch einmal</span>
        <input className="input" type="password" required autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </label>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Einen Moment …' : submitLabel}
      </button>
    </form>
  );
}
