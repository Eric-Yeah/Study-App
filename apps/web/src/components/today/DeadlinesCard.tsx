import { allDeadlines, deadlineText, dueSoon, toIsoDate } from '@study/core';
import { Link } from 'react-router-dom';
import { formatDateShort } from '../../lib/format';
import { useStore } from '../../state/store';

const WITHIN_DAYS = 14;

/** Fristen der nächsten zwei Wochen auf Heute (nur im Studium, nur wenn etwas ansteht). */
export function DeadlinesCard() {
  const { state } = useStore();
  const items = dueSoon(allDeadlines(state.deadlines, state.exams, state.subjects, toIsoDate(new Date())), WITHIN_DAYS).slice(0, 4);
  if (items.length === 0) return null;
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="between">
        <h2>Fristen</h2>
        <Link to="/fristen" className="link-btn">
          Alle
        </Link>
      </div>
      {items.map((i) => (
        <div key={i.id} className="between">
          <span style={{ overflowWrap: 'anywhere' }}>{i.title}</span>
          <span className="muted" style={{ flex: 'none', color: i.urgent ? 'var(--warn)' : undefined }}>
            {formatDateShort(i.date)} · {deadlineText(i.daysLeft)}
          </span>
        </div>
      ))}
    </div>
  );
}
