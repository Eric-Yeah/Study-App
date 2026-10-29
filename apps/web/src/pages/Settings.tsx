import { CONFIG, NO_TAPS, registerTap, type Stage, type TapState } from '@study/core';
import { useRef, useState } from 'react';
import { AdminLog } from '../components/AdminLog';
import { DevicesCard } from '../components/DevicesCard';
import { FitnessLink } from '../components/FitnessLink';
import { PushCard } from '../components/PushCard';
import { TimerSoundCard } from '../components/TimerSoundCard';
import { DsbCard } from '../components/DsbCard';
import { LanisAutoCard } from '../components/LanisAutoCard';
import { PasswordForm } from '../components/PasswordForm';
import { SHOW_NOTES_EVENT } from '../components/ReleaseNotes';
import { APP_VERSION } from '../releaseNotes';
import { useAuth } from '../lib/auth';
import { PlainSlider } from '../components/PlainSlider';
import { Segmented } from '../components/Segmented';
import { formatMinutes } from '../lib/format';
import { useStore, type Theme } from '../state/store';
import { useAccess } from '../lib/access';
import { DeleteAccount } from '../components/DeleteAccount';
import { ModeCard } from '../components/ModeCard';
import { useMode } from '../lib/mode';
import { StorageCleanup } from '../components/StorageCleanup';

export function Settings() {
  const { state, dispatch } = useStore();
  const { user, signOut } = useAuth();
  const access = useAccess();
  const { isUni } = useMode();
  const [pwOpen, setPwOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const taps = useRef<TapState>(NO_TAPS);
  // Verstecktes Admin-Protokoll: die Version mehrmals schnell hintereinander antippen, dann kommt die Passwortabfrage
  const tapVersion = () => {
    const r = registerTap(taps.current, Date.now(), CONFIG.admin.tapsNeeded, CONFIG.admin.tapGapMs);
    taps.current = r.state;
    if (r.unlocked && access.isAdmin) setAdminOpen(true);
  };
  const [pwDone, setPwDone] = useState(false);
  return (
    <div className="stack" style={{ gap: 20, maxWidth: 640 }}>
      <h1>Einstellungen</h1>

      <div className="card stack">
        <h2>Darstellung</h2>
        <Segmented<Theme>
          label="Farbschema"
          value={state.theme}
          onChange={(theme) => dispatch({ type: 'setTheme', theme })}
          options={[
            { value: 'light', label: 'Hell' },
            { value: 'dark', label: 'Dunkel' },
            { value: 'auto', label: 'Automatisch' },
          ]}
        />
      </div>

      <ModeCard />

      {state.profile && (
        <div className="card stack">
          <h2>Profil</h2>
          <label className="field">
            <span>Name</span>
            <input className="input" value={state.profile.name} onChange={(e) => dispatch({ type: 'updateProfile', profile: { name: e.target.value } })} />
          </label>
          {isUni ? (
            <p className="hint">Studiengang, Startsemester und Semesterzeiten stehen unter Studium → Studiengang.</p>
          ) : (
            <>
              <div className="field">
                <span>Stufe</span>
                <Segmented<Stage>
                  label="Stufe"
                  value={state.profile.stage}
                  onChange={(stage) => dispatch({ type: 'updateProfile', profile: { stage } })}
                  options={(['E', 'Q1', 'Q2', 'Q3', 'Q4'] as Stage[]).map((s) => ({ value: s, label: s }))}
                />
              </div>
              <p className="hint">Bundesland: {state.profile.federalState}</p>
            </>
          )}
        </div>
      )}

      <div className="card stack" style={{ gap: 16 }}>
        <h2>Planung</h2>
        <div className="field">
          <span>Lernfreie Tage pro Woche</span>
          <Segmented<0 | 1 | 2>
            label="Lernfreie Tage pro Woche"
            value={state.plan.freeDaysPerWeek}
            onChange={(freeDaysPerWeek) => dispatch({ type: 'setPlan', plan: { freeDaysPerWeek } })}
            options={[
              { value: 0, label: 'Keiner' },
              { value: 1, label: 'Einer' },
              { value: 2, label: 'Zwei' },
            ]}
          />
        </div>
        <PlainSlider
          label="Tageslimit für echte Lernzeit"
          value={state.plan.dailyLimitMin}
          min={60}
          max={isUni ? 480 : 240}
          step={15}
          format={formatMinutes}
          onChange={(dailyLimitMin) => dispatch({ type: 'setPlan', plan: { dailyLimitMin } })}
        />
      </div>

      <div className="card stack">
        <h2>Konto</h2>
        <p className="muted">Angemeldet als {user?.email}. Deine Daten liegen in deinem Konto und sind auf allen Geräten gleich.</p>
        {pwOpen ? (
          <PasswordForm
            onDone={() => {
              setPwOpen(false);
              setPwDone(true);
            }}
          />
        ) : (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => { setPwDone(false); setPwOpen(true); }}>
              Passwort ändern
            </button>
            <button type="button" className="btn" onClick={() => void signOut()}>
              Abmelden
            </button>
          </div>
        )}
        {pwDone && (
          <p className="notice ok" role="status">
            Dein Passwort ist geändert.
          </p>
        )}
        {!access.isAdmin && <DeleteAccount />}
      </div>

      <DevicesCard />

      {!isUni && <LanisAutoCard />}

      {!isUni && <DsbCard />}

      <TimerSoundCard />

      <PushCard />

      <FitnessLink />

      <div className="card stack">
        <h2>Version</h2>
        <p className="muted">
          <button type="button" className="version-tap" onClick={tapVersion}>
            Study App {APP_VERSION}
          </button>
          . Neue Versionen lädt die App von selbst.
        </p>
        <button type="button" className="btn" onClick={() => window.dispatchEvent(new Event(SHOW_NOTES_EVENT))}>
          Neuigkeiten ansehen
        </button>
      </div>

      <StorageCleanup />

      <div className="card stack">
        <h2>Daten</h2>
        <p className="muted">Löscht alle Fächer und Module, Prüfungen und Klausuren, Ergebnisse, Sessions und Aufgaben in deinem Konto, in Schule und Studium. Das Konto bleibt bestehen.</p>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (confirm('Alle Daten löschen und neu starten?')) dispatch({ type: 'reset' });
          }}
        >
          Alle Daten löschen
        </button>
      </div>
      {adminOpen && access.isAdmin && <AdminLog onClose={() => setAdminOpen(false)} />}
    </div>
  );
}
