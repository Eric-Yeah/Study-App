import { Bell } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useUserId } from '../../lib/auth';
import { enablePush, prefsSnapshot, pushSupport, savePrefs, subscribePrefs } from '../../lib/push';
import { useStore } from '../../state/store';

const KEY = 'study-push-nudge-v1';
const SNOOZE_DAYS = 14;

function snoozed(): boolean {
  try {
    const t = Number(localStorage.getItem(KEY));
    return Number.isFinite(t) && t > Date.now();
  } catch {
    return false;
  }
}

/**
 * Sanfter Hinweis auf Erinnerungen, die standardmäßig aus sind. Erscheint erst, wenn die App schon etwas zu erinnern hat
 * (Klausuren oder Karten), und lässt sich für zwei Wochen wegklicken. Ein Tipp schaltet den Tagesplan am Morgen ein.
 */
export function PushNudge() {
  const { state } = useStore();
  const userId = useUserId();
  const prefs = useSyncExternalStore(subscribePrefs, prefsSnapshot);
  const [hidden, setHidden] = useState(snoozed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const support = pushSupport();
  const denied = 'Notification' in window && Notification.permission === 'denied';
  if (hidden || prefs.on || !support.supported || denied) return null;
  if (state.exams.length === 0 && state.cards.length === 0) return null;

  const hide = () => {
    try {
      localStorage.setItem(KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000));
    } catch {
      /* ignorieren */
    }
    setHidden(true);
  };

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      await enablePush(userId); // die Erlaubnis muss direkt im Tipp angefragt werden
      savePrefs({ ...prefs, on: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Einschalten fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack nudge">
      <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
        <Bell size={20} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
        <div className="stack" style={{ gap: 4 }}>
          <strong>Dein Tagesplan morgens aufs Handy?</strong>
          <span className="muted">
            Eine Mitteilung um 7 Uhr mit dem, was heute dran ist, und am Abend ein Hinweis, wenn eine Klausur naht. Nie Werbung, nachts ist Ruhe.
          </span>
        </div>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {support.needsInstall ? (
          <Link className="btn btn-primary" to="/einstellungen">
            So geht es auf dem iPhone
          </Link>
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void turnOn()}>
            Einschalten
          </button>
        )}
        <button type="button" className="link-btn" onClick={hide}>
          Nicht jetzt
        </button>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
