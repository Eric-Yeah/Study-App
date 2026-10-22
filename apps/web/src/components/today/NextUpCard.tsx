import { estimateCardMinutes, CONFIG, type FreeSlot, type NextUp } from '@study/core';
import { Check, Play } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { formatClock, formatMinutes } from '../../lib/format';
import type { ExamWithPlan } from '../../state/selectors';
import { useStore } from '../../state/store';
import { useTimer } from '../../timer/TimerProvider';
import { PHASE_LABELS } from '../../timer/types';

const inDays = (n: number) => (n <= 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`);

function slotLabel(slot: FreeSlot): string {
  return slot.running ? `Freistunde bis ${slot.end}` : `Freistunde ab ${slot.start}`;
}

/**
 * Das, was jetzt dran ist, mit einem Tipp gestartet: Fach und Länge sind schon gewählt (aus dem Tagesplan, der Freistunde,
 * offenen Aufgaben oder fälligen Karten). Läuft der Timer schon, zeigt die Karte ihn.
 */
export function NextUpCard({ list, next, slot }: { list: ExamWithPlan[]; next: NextUp; slot: FreeSlot | null }) {
  const { state, dispatch } = useStore();
  const timer = useTimer();
  const navigate = useNavigate();
  const t = timer.state;
  const subject = (id: string | null) => state.subjects.find((s) => s.id === id);

  // Der Timer ist schon im Gang: hier zeigen, nicht noch einmal anbieten
  if (t.status !== 'idle') {
    const s = subject(t.subjectId);
    return (
      <div className="card nextup running">
        <span className="nextup-eyebrow">{t.status === 'running' ? 'Timer läuft' : 'Timer pausiert'}</span>
        <div className="between">
          <div className="nextup-title">
            {s && <span className="dot" style={{ background: s.color }} />}
            {s ? s.name : PHASE_LABELS[t.phase]}
          </div>
          <span className="big-num" aria-hidden="true">
            {formatClock(timer.remainingMs)}
          </span>
        </div>
        <div className="bar" aria-hidden="true">
          <i style={{ width: `${Math.round(timer.progress * 100)}%` }} />
        </div>
        <div className="nextup-actions">
          <Link className="btn btn-primary" to="/fokus">
            Zum Timer
          </Link>
        </div>
      </div>
    );
  }

  const go = (subjectId: string | null, minutes: number) => {
    timer.startWith({ subjectId, minutes });
    navigate('/fokus');
  };

  if (next.kind === 'study') {
    const s = subject(next.subjectId);
    const item = list.find((x) => x.exam.id === next.examId);
    const forExam = item ? `${item.exam.title || 'Klausur'} ${inDays(item.plan.daysLeft)}` : '';
    return (
      <div className="card nextup">
        <span className="nextup-eyebrow">{next.slot ? slotLabel(next.slot) : 'Als Nächstes'}</span>
        <div className="nextup-title">
          {s && <span className="dot" style={{ background: s.color }} />}
          {s?.name ?? 'Lernen'}
        </div>
        <p className="muted">
          {forExam && `${forExam} · `}noch {formatMinutes(next.remainingMin)} im Tagesplan
        </p>
        <div className="nextup-actions">
          <button type="button" className="btn btn-primary btn-start" onClick={() => go(next.subjectId, next.minutes)}>
            <Play size={18} aria-hidden="true" /> {next.minutes} min starten
          </button>
          <Link className="link-btn" to="/fokus">
            Anderes Fach
          </Link>
        </div>
      </div>
    );
  }

  if (next.kind === 'task') {
    const s = subject(next.subjectId);
    return (
      <div className="card nextup">
        <span className="nextup-eyebrow">{next.slot ? slotLabel(next.slot) : 'Offene Aufgabe'}</span>
        <div className="nextup-title">{next.title}</div>
        {s && (
          <p className="muted">
            <span className="dot" style={{ background: s.color, display: 'inline-block', marginRight: 6 }} />
            {s.name}
          </p>
        )}
        <div className="nextup-actions">
          <button type="button" className="btn btn-primary btn-start" onClick={() => go(next.subjectId, next.minutes)}>
            <Play size={18} aria-hidden="true" /> {next.minutes} min starten
          </button>
          <button type="button" className="btn" onClick={() => dispatch({ type: 'toggleTask', id: next.taskId })}>
            <Check size={16} aria-hidden="true" /> Erledigt
          </button>
        </div>
      </div>
    );
  }

  if (next.kind === 'cards') {
    const n = Math.min(next.count, CONFIG.daily.miniRoundCards);
    return (
      <div className="card nextup">
        <span className="nextup-eyebrow">{slot ? slotLabel(slot) : 'Als Nächstes'}</span>
        <div className="nextup-title">{next.count === 1 ? '1 Karte ist fällig' : `${next.count} Karten sind fällig`}</div>
        <p className="muted">Der Tagesplan ist durch. Ein kurzer Durchgang hält das Gelernte frisch, ca. {estimateCardMinutes(n)} min.</p>
        <div className="nextup-actions">
          <Link className="btn btn-primary btn-start" to={`/karten?runde=${n}&von=heute`}>
            <Play size={18} aria-hidden="true" /> {n === 1 ? '1 Karte lernen' : `${n} Karten lernen`}
          </Link>
          {next.count > n && (
            <Link className="link-btn" to={`/karten?runde=${CONFIG.cards.maxPerSession}&von=heute`}>
              Alle {next.count}
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (next.kind === 'free') {
    const s = subject(next.subjectId);
    return (
      <div className="card nextup">
        <span className="nextup-eyebrow">{next.slot ? slotLabel(next.slot) : 'Heute ist nichts geplant'}</span>
        <div className="nextup-title">
          {s && <span className="dot" style={{ background: s.color }} />}
          {s?.name ?? 'Lernen'}
        </div>
        <p className="muted">Zeit für eine freiwillige Einheit? Dieses Fach hat gerade die höchste Priorität.</p>
        <div className="nextup-actions">
          <button type="button" className="btn btn-primary btn-start" onClick={() => go(next.subjectId, next.minutes)}>
            <Play size={18} aria-hidden="true" /> {next.minutes} min starten
          </button>
          <Link className="link-btn" to="/fokus">
            Anderes Fach
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card nextup done">
      <span className="nextup-eyebrow">Heute</span>
      <div className="nextup-title">
        <Check size={22} aria-hidden="true" /> {next.hadPlan ? 'Tagesplan geschafft' : 'Für heute ist alles erledigt'}
      </div>
      <p className="muted">{next.hadPlan ? 'Mehr musst du heute nicht tun. Wer mag, lernt freiwillig weiter.' : 'Du hast genug gelernt, nichts ist offen.'}</p>
      <div className="nextup-actions">
        <Link className="link-btn" to="/fokus">
          Trotzdem eine Einheit
        </Link>
      </div>
    </div>
  );
}
