import { toIsoDate } from '@study/core';
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { PlainSlider } from '../components/PlainSlider';
import { ProgressRing } from '../components/ProgressRing';
import { formatClock, formatMinutes } from '../lib/format';
import { likelySubjectId, nextUpFor } from '../state/daily';
import { learnedMinutesOn } from '../state/selectors';
import { useStore } from '../state/store';
import { useTimer } from '../timer/TimerProvider';
import { PHASE_LABELS } from '../timer/types';

const PRESETS = [15, 25, 45, 60];

export function Focus() {
  const { state, dispatch } = useStore();
  const timer = useTimer();
  const t = timer.state;
  const subjects = state.subjects.filter((s) => s.status !== 'dropped' || s.isAdvanced || s.isExamSubject);
  const running = t.status === 'running';
  const learned = learnedMinutesOn(state.sessions, toIsoDate(new Date()));
  const round = (t.completedFocus % state.timer.sessionsUntilLongBreak) + (t.phase === 'focus' ? 1 : 0);

  // Fach vorwählen, wenn noch keins gewählt ist: das Fach aus dem Tagesplan, sonst die laufende Stunde oder das zuletzt gelernte Fach
  const preselected = useRef(false);
  useEffect(() => {
    if (preselected.current) return;
    preselected.current = true;
    if (t.status !== 'idle' || t.phase !== 'focus' || t.subjectId) return;
    const now = new Date();
    const { next } = nextUpFor(state, now);
    const fromPlan = next.kind === 'study' || next.kind === 'free' || (next.kind === 'task' && next.subjectId) ? next.subjectId : null;
    const pick = fromPlan ?? likelySubjectId(state, now);
    if (pick && subjects.some((s) => s.id === pick)) timer.setSubject(pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const minutes = Math.round(t.durationMs / 60_000);
  const canPick = t.status === 'idle' && t.phase === 'focus';
  const lengths = [...new Set([...PRESETS, state.timer.focusMin])].sort((a, b) => a - b);

  // Leertaste startet und pausiert den Timer (außer beim Tippen).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.code !== 'Space' || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName)) return;
      e.preventDefault();
      if (running) timer.pause();
      else timer.start();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, timer]);

  return (
    <div className="grid cols-2 match">
      <div className="card stack" style={{ alignItems: 'center', gap: 20 }}>
        <div className="between" style={{ width: '100%' }}>
          <h1 style={{ fontSize: 24 }}>Fokus</h1>
          <span className="muted">
            Session {Math.max(1, round)} von {state.timer.sessionsUntilLongBreak}
          </span>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center', gap: 8 }} role="group" aria-label="Fach">
          {subjects.map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={t.subjectId === s.id} onClick={() => timer.setSubject(s.id)}>
              <span className="dot" style={{ background: s.color }} />
              {s.name}
            </button>
          ))}
        </div>
        {canPick && (
          <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center', gap: 8 }} role="group" aria-label="Länge dieser Runde">
            {lengths.map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={minutes === m} onClick={() => timer.setLength(m)}>
                {m} min
              </button>
            ))}
          </div>
        )}
        <ProgressRing progress={timer.progress} size={260}>
          <span className="big-num" style={{ fontSize: 56 }} aria-live="off">
            {formatClock(timer.remainingMs)}
          </span>
          <span className="muted">{PHASE_LABELS[t.phase]}</span>
        </ProgressRing>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-icon" aria-label="Zurücksetzen" onClick={timer.reset}>
            <RotateCcw size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ minWidth: 150, padding: '14px 24px', borderRadius: 999, fontSize: 17 }}
            onClick={running ? timer.pause : timer.start}
          >
            {running ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
            {running ? 'Pause' : t.status === 'paused' ? 'Weiter' : 'Start'}
          </button>
          <button type="button" className="btn btn-icon" aria-label="Phase überspringen" onClick={timer.skip}>
            <SkipForward size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="hint">Leertaste: Start und Pause · {timer.synced ? 'Mit anderen Geräten verbunden' : 'Nur auf diesem Gerät'}</p>
      </div>

      <div className="stack">
        <div className="card between">
          <span>Heute gelernt</span>
          <strong>{formatMinutes(learned)}</strong>
        </div>
        <div className="card stack" style={{ gap: 16 }}>
          <h2>Längen</h2>
          <PlainSlider
            label="Konzentration"
            value={state.timer.focusMin}
            min={5}
            max={90}
            step={5}
            format={(v) => `${v} min`}
            onChange={(focusMin) => dispatch({ type: 'setTimer', timer: { focusMin } })}
          />
          <PlainSlider
            label="Kurze Pause"
            value={state.timer.shortBreakMin}
            min={1}
            max={20}
            format={(v) => `${v} min`}
            onChange={(shortBreakMin) => dispatch({ type: 'setTimer', timer: { shortBreakMin } })}
          />
          <PlainSlider
            label="Lange Pause"
            value={state.timer.longBreakMin}
            min={5}
            max={45}
            step={5}
            format={(v) => `${v} min`}
            onChange={(longBreakMin) => dispatch({ type: 'setTimer', timer: { longBreakMin } })}
          />
          <PlainSlider
            label="Sessions bis zur langen Pause"
            value={state.timer.sessionsUntilLongBreak}
            min={2}
            max={8}
            format={(v) => String(v)}
            onChange={(sessionsUntilLongBreak) => dispatch({ type: 'setTimer', timer: { sessionsUntilLongBreak } })}
          />
          <p className="hint">Neue Längen gelten ab der nächsten Phase.</p>
        </div>
      </div>
    </div>
  );
}
