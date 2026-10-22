import { useState, type FormEvent } from 'react';
import { useLanisAuto } from '../lib/lanisAuto';

/** Einstellungen: Vertretungsplan aus DSBmobile. Die Zugangsdaten bleiben verschlüsselt nur auf diesem Gerät. */
export function DsbCard() {
  const auto = useLanisAuto();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const connect = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await auto.enableDsb({ user: user.trim(), password });
    setPassword('');
    await auto.refresh(true);
    setBusy(false);
  };

  return (
    <div className="card stack">
      <div className="between">
        <h2>Vertretungsplan (DSBmobile)</h2>
        <span className={`tag${auto.dsbEnabled ? '' : ' warn'}`}>{auto.dsbEnabled ? 'automatisch an' : 'aus'}</span>
      </div>
      {auto.dsbEnabled ? (
        <>
          <p className="muted">
            Die App holt den Vertretungsplan deiner Schule aus DSBmobile und zeigt dir nur, was deine Stufe und deine Stunden betrifft. Lanis wird dafür nicht mehr
            gefragt.
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn" disabled={auto.busy} onClick={() => void auto.refresh(true)}>
              {auto.busy ? 'Aktualisiere …' : 'Jetzt aktualisieren'}
            </button>
            <button type="button" className="btn btn-ghost btn-danger" onClick={() => auto.disableDsb()}>
              Ausschalten und Passwort löschen
            </button>
          </div>
        </>
      ) : (
        <form className="stack" onSubmit={connect}>
          <p className="muted">
            Steht der Vertretungsplan deiner Schule in der App „DSBmobile“ und nicht in Lanis? Dann gib hier dieselben Zugangsdaten ein wie dort (die Schule hat sie
            dir gegeben, oft für alle Schüler gleich).
          </p>
          <label className="field">
            <span>DSBmobile-Benutzer (meist eine Nummer)</span>
            <input className="input" required autoComplete="off" value={user} onChange={(e) => setUser(e.target.value)} />
          </label>
          <label className="field">
            <span>DSBmobile-Passwort</span>
            <input className="input" type="password" required autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <p className="hint">Das Passwort liegt verschlüsselt nur auf diesem Gerät, nie auf dem Server. Es geht nur bei einem Abruf an DSBmobile.</p>
          <button type="submit" className="btn btn-primary" disabled={busy || auto.busy}>
            {busy ? 'Verbinde …' : 'Verbinden'}
          </button>
        </form>
      )}
      {auto.dsbError && (
        <p className="notice" role="alert">
          {auto.dsbError}
        </p>
      )}
    </div>
  );
}
