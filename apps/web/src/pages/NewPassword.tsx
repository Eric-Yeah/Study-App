import { PasswordForm } from '../components/PasswordForm';

/** Erscheint nach dem Klick auf den Link in der E-Mail zum Zurücksetzen. */
export function NewPassword({ onDone }: { onDone: () => void }) {
  return (
    <div className="stack" style={{ maxWidth: 420, margin: '10vh auto', padding: 16, gap: 20 }}>
      <h1>Study App</h1>
      <div className="card stack">
        <h2>Neues Passwort setzen</h2>
        <p className="muted">Du bist angemeldet. Wähle jetzt ein neues Passwort für dein Konto.</p>
        <PasswordForm onDone={onDone} submitLabel="Passwort speichern und weiter" />
      </div>
    </div>
  );
}
