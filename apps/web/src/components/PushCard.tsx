import { CONFIG, buildPushItems, clampTime, type PushPrefs } from '@study/core';
import { Bell, BellOff, Send } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useUserId } from '../lib/auth';
import { disablePush, enablePush, prefsSnapshot, pushSupport, PushError, savePrefs, sendTest, subscribePrefs } from '../lib/push';
import { pushInputFrom } from '../lib/pushInput';
import { useStore } from '../state/store';

const fmt = (iso: string) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** Erinnerungen auf dem Handy: Hauptschalter, die zwei Arten mit Uhrzeit, Testmitteilung. Standardmäßig aus, pro Gerät. */
export function PushCard() {
  const { state } = useStore();
  const userId = useUserId();
  const prefs = useSyncExternalStore(subscribePrefs, prefsSnapshot);
  const support = pushSupport();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'none'>('Notification' in window ? Notification.permission : 'none');

  useEffect(() => {
    setPermission('Notification' in window ? Notification.permission : 'none');
  }, [prefs.on]);

  const set = (patch: Partial<PushPrefs>) => savePrefs({ ...prefs, ...patch });

  const toggle = async () => {
    setError(null);
    setInfo(null);
    if (prefs.on) {
      setBusy(true);
      try {
        await disablePush();
        set({ on: false });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ausschalten fehlgeschlagen.');
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      await enablePush(userId); // die Erlaubnis wird gleich als Erstes angefragt, direkt im Tipp
      set({ on: true });
      setInfo('Erinnerungen sind an. Sende eine Testmitteilung, um es zu prüfen.');
    } catch (e) {
      setError(e instanceof PushError || e instanceof Error ? e.message : 'Einschalten fehlgeschlagen.');
    } finally {
      setBusy(false);
      setPermission('Notification' in window ? Notification.permission : 'none');
    }
  };

  const test = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await sendTest(userId);
      setInfo('Die Testmitteilung kommt in wenigen Sekunden.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Die Testmitteilung ging nicht.');
    } finally {
      setBusy(false);
    }
  };

  const next = prefs.on ? buildPushItems({ now: new Date(), prefs, ...pushInputFrom(state, new Date()) }).slice(0, 3) : [];

  return (
    <div className="card stack">
      <h2>Erinnerungen</h2>
      {!support.supported ? (
        <p className="muted">Dieser Browser kann keine Mitteilungen von Web-Apps zeigen. Auf dem iPhone brauchst du iOS 16.4 oder neuer und die App auf dem Home-Bildschirm.</p>
      ) : support.needsInstall ? (
        <p className="muted">Auf iPhone und iPad gehen Mitteilungen nur, wenn die Study App auf dem Home-Bildschirm liegt: in Safari auf Teilen tippen, „Zum Home-Bildschirm“ wählen und die App von dort öffnen. Dafür braucht es iOS 16.4 oder neuer.</p>
      ) : (
        <>
          <p className="muted">
            Zwei Arten, nie Werbung: dein Tagesplan am Morgen und eine Erinnerung am Abend, wenn eine Klausur naht oder du hinter dem Plan liegst. Standardmäßig aus, die Einstellung gilt für dieses Gerät. Nachts ({CONFIG.push.latest} bis {CONFIG.push.earliest} Uhr) kommt nichts.
          </p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className={prefs.on ? 'btn' : 'btn btn-primary'} disabled={busy} onClick={() => void toggle()}>
              {prefs.on ? <BellOff size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />} {prefs.on ? 'Erinnerungen ausschalten' : 'Erinnerungen einschalten'}
            </button>
            {prefs.on && (
              <button type="button" className="btn" disabled={busy} onClick={() => void test()}>
                <Send size={16} aria-hidden="true" /> Testmitteilung senden
              </button>
            )}
          </div>
          {permission === 'denied' && <p className="notice">Mitteilungen sind für die App blockiert. Erlaube sie in den Einstellungen deines Geräts.</p>}
          {prefs.on && (
            <div className="stack" style={{ gap: 12 }}>
              <div className="push-row">
                <label className="row" style={{ gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={prefs.plan} onChange={(e) => set({ plan: e.target.checked })} /> Tagesplan am Morgen (abends 19 Uhr dazu: Serie halten, ab {CONFIG.daily.streakNudgeMinDays} Tagen)
                </label>
                <input
                  className="input push-time"
                  type="time"
                  aria-label="Uhrzeit Tagesplan"
                  value={prefs.planTime}
                  min={CONFIG.push.earliest}
                  max={CONFIG.push.latest}
                  disabled={!prefs.plan}
                  onChange={(e) => set({ planTime: clampTime(e.target.value, CONFIG.push.planTime) })}
                />
              </div>
              <div className="push-row">
                <label className="row" style={{ gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={prefs.exam} onChange={(e) => set({ exam: e.target.checked })} /> Klausur naht und Rückstand
                </label>
                <input
                  className="input push-time"
                  type="time"
                  aria-label="Uhrzeit Klausur und Rückstand"
                  value={prefs.examTime}
                  min={CONFIG.push.earliest}
                  max={CONFIG.push.latest}
                  disabled={!prefs.exam}
                  onChange={(e) => set({ examTime: clampTime(e.target.value, CONFIG.push.examTime) })}
                />
              </div>
              {next.length > 0 ? (
                <div className="stack" style={{ gap: 4 }}>
                  <span className="form-label">Als Nächstes</span>
                  <ul className="rubric-list">
                    {next.map((i) => (
                      <li key={i.dueAt + i.kind + i.url}>
                        <strong>{fmt(i.dueAt)}</strong> · {i.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="hint">Im Moment ist nichts geplant.</p>
              )}
              <p className="hint">Die App berechnet die Mitteilungen aus deinem Plan, sobald du sie öffnest, und schickt sie dann zur Uhrzeit auch bei geschlossener App. Öffne sie nach einer Planänderung kurz, damit die Texte stimmen.</p>
            </div>
          )}
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
          {info && <p className="hint">{info}</p>}
        </>
      )}
    </div>
  );
}
