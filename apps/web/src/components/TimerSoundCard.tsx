import { Volume2 } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { playChime, saveSoundPrefs, soundPrefs, subscribeSoundPrefs, unlockAudio } from '../lib/timerSound';

/** Einstellungen → Timer-Ton: Standardmäßig aus, gilt für dieses Gerät. */
export function TimerSoundCard() {
  const prefs = useSyncExternalStore(subscribeSoundPrefs, soundPrefs);
  return (
    <div className="card stack">
      <h2>Timer-Ton</h2>
      <p className="muted">Ein kurzer Ton, wenn eine Fokus- oder Pausenphase abläuft. Standardmäßig aus, die Einstellung gilt für dieses Gerät. Beim ersten Fokus-Start eines Tages fragt dich die App danach.</p>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={prefs.on}
            onChange={(e) => {
              if (e.target.checked) unlockAudio();
              saveSoundPrefs({ on: e.target.checked });
            }}
          />{' '}
          Ton beim Ablaufen
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => {
            unlockAudio();
            playChime();
          }}
        >
          <Volume2 size={16} aria-hidden="true" /> Ton testen
        </button>
      </div>
    </div>
  );
}
