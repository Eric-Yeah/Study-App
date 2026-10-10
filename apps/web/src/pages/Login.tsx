import { useState, type FormEvent } from 'react';
import { germanAuthError as germanError, passwordProblem } from '@study/core';
import { supabase, supabaseConfigured } from '../lib/supabase';

type Mode = 'signin' | 'signup' | 'reset';

export function Login() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Link in der Mail geht zurück in die App (PKCE: die App tauscht den Code in der Adresse gegen eine Sitzung).
  const sendReset = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + import.meta.env.BASE_URL });
    // Gleiche Antwort mit und ohne Konto, damit niemand E-Mail-Adressen durchprobieren kann.
    if (err && !err.message.toLowerCase().includes('not found')) setError(germanError(err.message));
    else setResetSent(true);
    setBusy(false);
  };

  // Steht in der Mail ein Code, geht es ohne Link (zum Beispiel wenn die Mail auf einem anderen Gerät ankommt).
  const useCode = async (e: FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(newPassword, newPassword);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const verified = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
    if (verified.error) setError(germanError(verified.error.message));
    else {
      const { error: err } = await supabase.auth.updateUser({ password: newPassword });
      if (err) setError(germanError(err.message));
    }
    setBusy(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (mode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) setError(germanError(err.message));
    } else {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
      });
      if (err) setError(germanError(err.message));
      // Ohne Session verlangt das Projekt eine Bestätigung per E-Mail.
      else if (!data.session) setConfirmSent(true);
    }
    setBusy(false);
  };

  return (
    <div className="stack" style={{ maxWidth: 420, margin: '10vh auto', padding: 16, gap: 20 }}>
      <h1>Study App</h1>
      {!supabaseConfigured ? (
        <div className="card stack">
          <h2>Server nicht eingerichtet</h2>
          <p className="muted">
            Es fehlen VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY. Siehe apps/web/.env.example.
          </p>
        </div>
      ) : confirmSent ? (
        <div className="card stack">
          <h2>Bestätige deine E-Mail-Adresse</h2>
          <p className="muted">
            Wir haben einen Link an {email} geschickt. Nach dem Klick bist du angemeldet. Danach kannst du dich
            hier mit deinem Passwort anmelden.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setConfirmSent(false);
              setMode('signin');
            }}
          >
            Zur Anmeldung
          </button>
        </div>
      ) : mode === 'reset' ? (
        <div className="card stack">
          <h2>Passwort vergessen</h2>
          {!resetSent ? (
            <form className="stack" onSubmit={sendReset}>
              <p className="muted">Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort setzt.</p>
              <label className="field">
                <span>E-Mail</span>
                <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@beispiel.de" />
              </label>
              {error && (
                <p className="notice" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Einen Moment …' : 'Link schicken'}
              </button>
            </form>
          ) : (
            <div className="stack">
              <p className="notice ok" role="status">
                Wenn es zu {email.trim()} ein Konto gibt, ist eine E-Mail unterwegs. Öffne den Link darin am besten im selben Browser, in dem du das hier machst.
              </p>
              <details>
                <summary className="muted">Steht in der Mail ein Code?</summary>
                <form className="stack" onSubmit={useCode} style={{ marginTop: 12 }}>
                  <label className="field">
                    <span>Code aus der E-Mail</span>
                    <input className="input" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Neues Passwort</span>
                    <input className="input" type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  </label>
                  {error && (
                    <p className="notice" role="alert">
                      {error}
                    </p>
                  )}
                  <button type="submit" className="btn" disabled={busy}>
                    {busy ? 'Einen Moment …' : 'Passwort setzen'}
                  </button>
                </form>
              </details>
            </div>
          )}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode('signin');
              setResetSent(false);
              setError(null);
            }}
          >
            Zurück zur Anmeldung
          </button>
        </div>
      ) : (
        <form className="card stack" onSubmit={submit}>
          <h2>{mode === 'signin' ? 'Anmelden' : 'Konto erstellen'}</h2>
          <label className="field">
            <span>E-Mail</span>
            <input
              className="input"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@beispiel.de"
            />
          </label>
          <label className="field">
            <span>Passwort</span>
            <input
              className="input"
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'signup' && <span className="hint">Mindestens 8 Zeichen.</span>}
          </label>
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Einen Moment …' : mode === 'signin' ? 'Anmelden' : 'Konto erstellen'}
          </button>
          {mode === 'signin' && (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setMode('reset');
                setError(null);
              }}
            >
              Passwort vergessen?
            </button>
          )}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
            }}
          >
            {mode === 'signin' ? 'Noch kein Konto? Konto erstellen' : 'Schon ein Konto? Anmelden'}
          </button>
        </form>
      )}
    </div>
  );
}
