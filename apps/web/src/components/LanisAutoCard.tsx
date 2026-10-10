import { Link } from 'react-router-dom';
import { useLanisAuto } from '../lib/lanisAuto';

const ago = (ms: number) => {
  if (!ms) return 'noch nie';
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 2) return 'gerade eben';
  if (min < 60) return `vor ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `vor ${h} h` : `vor ${Math.round(h / 24)} Tagen`;
};

/** Einstellungen: automatische Aktualisierung aus Lanis ein- und ausschalten. */
export function LanisAutoCard() {
  const auto = useLanisAuto();
  return (
    <div className="card stack">
      <div className="between">
        <h2>Lanis</h2>
        <span className={`tag${auto.enabled ? '' : ' warn'}`}>{auto.enabled ? 'automatisch an' : 'aus'}</span>
      </div>
      {auto.enabled ? (
        <>
          <p className="muted">
            Stundenplan, Vertretungen und Klausuren werden beim Öffnen der App aktualisiert, wenn der Stand veraltet ist. Zuletzt: {ago(auto.lastAt)}.
          </p>
          <p className="hint">Dein Passwort liegt verschlüsselt nur auf diesem Gerät, nie auf dem Server. Es geht nur bei einem Abruf an Lanis.</p>
          {auto.error && (
            <p className="notice" role="alert">
              {auto.error}
            </p>
          )}
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn" disabled={auto.busy} onClick={() => void auto.refresh(true)}>
              {auto.busy ? 'Aktualisiere …' : 'Jetzt aktualisieren'}
            </button>
            <button type="button" className="btn btn-ghost btn-danger" onClick={() => auto.disable()}>
              Ausschalten und Passwort löschen
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            Wenn du beim Import „Auf diesem Gerät merken“ wählst, holt die App Stundenplan, Vertretungen und Klausuren von selbst.
          </p>
          {auto.error && (
            <p className="notice" role="alert">
              {auto.error}
            </p>
          )}
          <Link className="btn" to="/import">
            Aus Lanis importieren
          </Link>
        </>
      )}
    </div>
  );
}
