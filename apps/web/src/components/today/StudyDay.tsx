import { EVENT_KIND_LABELS, dayStatus, eventsOn, formatClock, toIsoDate } from '@study/core';
import { Link } from 'react-router-dom';
import { useStore } from '../../state/store';

/** Heute im Studium: Vorlesungen, Übungen und gesperrte Zeiten des Tages mit dem, was gerade läuft. Gegenstück zu „Schule heute“. */
export function StudyDay() {
  const { state } = useStore();
  const now = new Date();
  const today = eventsOn(state.events, toIsoDate(now));
  const status = dayStatus(state.events, now);
  const subject = (id: string | null) => state.subjects.find((s) => s.id === id);

  if (state.events.length === 0) {
    return (
      <div className="card stack">
        <h2>Heute an der Uni</h2>
        <p className="muted">Noch kein Stundenplan. Trag deine Vorlesungen ein oder übernimm sie aus einer Kalenderdatei, dann siehst du hier den Tag und die Lücken zum Lernen.</p>
        <Link className="btn" style={{ alignSelf: 'flex-start' }} to="/stundenplan">
          Stundenplan einrichten
        </Link>
      </div>
    );
  }

  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="between">
        <h2>Heute an der Uni</h2>
        <Link to="/stundenplan" className="link-btn">
          Stundenplan
        </Link>
      </div>
      {today.length === 0 && <p className="muted">Heute stehen keine Termine an.</p>}
      {status.current && (
        <p>
          <strong>Jetzt:</strong> {status.current.title} bis {formatClock(status.current.endMin)}
          {status.current.room && ` · ${status.current.room}`}
        </p>
      )}
      {!status.current && status.next && (
        <p>
          <strong>Als Nächstes:</strong> {status.next.title} um {formatClock(status.next.startMin)}
          {status.next.room && ` · ${status.next.room}`}
        </p>
      )}
      {today.map((e) => (
        <div key={e.id} className="between" style={{ opacity: e.endMin <= now.getHours() * 60 + now.getMinutes() ? 0.55 : 1 }}>
          <span className="row" style={{ gap: 8, minWidth: 0 }}>
            <span className="dot" style={{ background: subject(e.subjectId)?.color ?? 'var(--line-strong)' }} />
            <span style={{ overflowWrap: 'anywhere' }}>
              {e.title} <span className="hint">· {EVENT_KIND_LABELS[e.kind]}</span>
            </span>
          </span>
          <span className="muted" style={{ flex: 'none' }}>
            {formatClock(e.startMin)}–{formatClock(e.endMin)}
          </span>
        </div>
      ))}
    </div>
  );
}
