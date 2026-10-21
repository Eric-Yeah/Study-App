import type { FocusReason, FocusRecommendation } from '@study/core';
import { ArrowRight, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatClock, formatMinutes } from '../../lib/format';
import { useStore } from '../../state/store';
import { useStartFocus } from '../../timer/useStartFocus';
import { useTimer } from '../../timer/TimerProvider';
import { PHASE_LABELS } from '../../timer/types';

const REASON: Record<FocusReason, (r: FocusRecommendation) => string> = {
  planned: (r) => `Noch ${formatMinutes(r.remainingMin)} von ${formatMinutes(r.plannedMin)} für heute geplant.`,
  done: () => 'Der Plan für heute ist geschafft. Mehr geht immer, muss aber nicht.',
  behind: () => 'Hier liegst du hinter dem Plan.',
  next_exam: () => 'Heute ist nichts eingeplant, das hier ist die nächste Klausur.',
  last: () => 'Zuletzt hast du dieses Fach gelernt.',
  none: () => 'Wähle ein Fach, dann startet der Timer.',
};

/** Der eine große Knopf auf Heute: Fach laut Tagesplan, ein Tipp startet den Timer. */
export function FocusHero({ rec, goal, learned }: { rec: FocusRecommendation; goal: number; learned: number }) {
  const { state } = useStore();
  const timer = useTimer();
  const start = useStartFocus();
  const t = timer.state;
  const name = (id: string | null) => state.subjects.find((s) => s.id === id);
  const subject = name(rec.subjectId);
  const timerSubject = name(t.subjectId);
  const pct = goal ? Math.min(100, (learned / goal) * 100) : 0;

  const bar = (
    <>
      <div className="bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
      <p className="hint">
        {goal > 0 ? `Heute ${formatMinutes(learned)} von ${formatMinutes(goal)}${learned >= goal ? ', Tagesziel erreicht.' : '.'}` : learned > 0 ? `Heute ${formatMinutes(learned)} gelernt.` : 'Heute ist kein Lernblock geplant.'}
      </p>
    </>
  );

  if (t.status === 'running') {
    return (
      <section className="card hero hero-live stack" aria-label="Timer läuft">
        <p className="hero-kicker">{PHASE_LABELS[t.phase]} läuft</p>
        <div className="hero-main">
          <div>
            <h2 className="hero-title">{t.phase === 'focus' ? (timerSubject?.name ?? 'Ohne Fach') : 'Kurz durchatmen'}</h2>
            <span className="big-num hero-clock" aria-live="off">
              {formatClock(timer.remainingMs)}
            </span>
          </div>
          <Link className="btn btn-primary hero-btn" to="/fokus">
            Zum Timer <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
        {bar}
      </section>
    );
  }

  if (t.status === 'paused' && t.phase === 'focus') {
    return (
      <section className="card hero stack" aria-label="Timer pausiert">
        <p className="hero-kicker">Pausiert</p>
        <div className="hero-main">
          <div>
            <h2 className="hero-title">{timerSubject?.name ?? 'Ohne Fach'}</h2>
            <span className="big-num hero-clock">{formatClock(timer.remainingMs)}</span>
          </div>
          <button type="button" className="btn btn-primary hero-btn" onClick={() => start(null)}>
            <Play size={18} aria-hidden="true" /> Weiter
          </button>
        </div>
        {bar}
      </section>
    );
  }

  return (
    <section className="card hero stack" aria-label="Jetzt lernen">
      <p className="hero-kicker">{rec.reason === 'done' ? 'Geschafft' : 'Jetzt dran'}</p>
      <div className="hero-main">
        <div>
          <h2 className="hero-title">
            {subject && <span className="dot" style={{ background: subject.color }} aria-hidden="true" />}
            {subject?.name ?? 'Noch kein Fach'}
          </h2>
          <p className="muted">{REASON[rec.reason](rec)}</p>
        </div>
        {subject ? (
          <button type="button" className="btn btn-primary hero-btn" onClick={() => start(subject.id)}>
            <Play size={18} aria-hidden="true" /> {rec.reason === 'done' ? 'Noch eine Runde' : 'Jetzt lernen'} · {state.timer.focusMin} min
          </button>
        ) : (
          <Link className="btn btn-primary hero-btn" to="/fokus">
            Fokus öffnen <ArrowRight size={18} aria-hidden="true" />
          </Link>
        )}
      </div>
      {bar}
      {subject && (
        <Link className="link-btn" style={{ alignSelf: 'flex-start' }} to="/fokus">
          Anderes Fach oder andere Länge wählen
        </Link>
      )}
    </section>
  );
}
