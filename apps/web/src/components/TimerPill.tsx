import { Timer } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { formatClock } from '../lib/format';
import { useStore } from '../state/store';
import { useTimer } from '../timer/TimerProvider';
import { PHASE_LABELS } from '../timer/types';

/** Schmale Leiste oben, solange ein Timer läuft oder pausiert und man nicht auf der Fokus-Seite ist. Tippen führt zum Timer. */
export function TimerPill() {
  const { pathname } = useLocation();
  const { state } = useStore();
  const timer = useTimer();
  const t = timer.state;
  if (t.status === 'idle' || pathname === '/fokus' || pathname === '/') return null; // auf Heute zeigt die Karte oben den Timer
  const subject = state.subjects.find((s) => s.id === t.subjectId);
  return (
    <Link to="/fokus" className={`timer-pill${t.status === 'paused' ? ' paused' : ''}`} aria-label={`${t.status === 'running' ? 'Timer läuft' : 'Timer pausiert'}, ${formatClock(timer.remainingMs)} übrig, zum Timer`}>
      <Timer size={16} aria-hidden="true" />
      <span className="timer-pill-text">
        {subject ? subject.name : PHASE_LABELS[t.phase]}
        {t.status === 'paused' ? ' · pausiert' : ''}
      </span>
      <strong aria-hidden="true">{formatClock(timer.remainingMs)}</strong>
    </Link>
  );
}
