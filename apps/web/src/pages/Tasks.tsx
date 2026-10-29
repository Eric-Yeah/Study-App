import { dueGroup, toIsoDate } from '@study/core';
import { Check, Trash2 } from 'lucide-react';
import { HomeworkComposer } from '../components/HomeworkComposer';
import { formatAgendaDay, formatDateShort } from '../lib/format';
import { useStore, type Task } from '../state/store';

const GROUPS = [
  ['late', 'Überfällig'],
  ['today', 'Heute'],
  ['tomorrow', 'Morgen'],
  ['day', 'Danach'],
] as const;

/** Aufgaben und Abgaben im Studium (Übungsblätter, Hausarbeits-Schritte, eigene Aufgaben), nach Fälligkeit geordnet. */
export function Tasks() {
  const { state, dispatch } = useStore();
  const today = toIsoDate(new Date());
  const open = state.tasks.filter((t) => !t.done).sort((a, b) => a.date.localeCompare(b.date));
  const done = state.tasks.filter((t) => t.done).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  const subject = (id: string | null) => state.subjects.find((s) => s.id === id);

  const row = (t: Task) => (
    <div key={t.id} className="task">
      <button type="button" className="check" role="checkbox" aria-checked={t.done} aria-label={`${t.title} erledigt`} onClick={() => dispatch({ type: 'toggleTask', id: t.id })}>
        {t.done && <Check size={14} aria-hidden="true" />}
      </button>
      <span style={{ flex: 1, overflowWrap: 'anywhere' }} className={t.done ? 'done-text' : ''}>
        {t.title}
        {subject(t.subjectId) && <span className="hint"> · {subject(t.subjectId)?.name}</span>}
        <span className="hint"> · {formatDateShort(t.date)}</span>
      </span>
      <button type="button" className="btn btn-ghost btn-icon" aria-label="Aufgabe löschen" onClick={() => dispatch({ type: 'deleteTask', id: t.id })}>
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Aufgaben</h1>
          <p className="sub">Übungsblätter, Abgaben und eigene Aufgaben, nach Fälligkeit. Eine Zeile reicht: „Analysis Blatt 5 bis Freitag“.</p>
        </div>
      </div>
      <div className="card">
        <HomeworkComposer />
      </div>
      {open.length === 0 && <p className="hint">Keine offenen Aufgaben.</p>}
      {GROUPS.map(([key, label]) => {
        const items = open.filter((t) => dueGroup(t.date, today) === key);
        if (items.length === 0) return null;
        return (
          <div key={key} className="card">
            <h2 style={{ marginBottom: 8 }}>
              {label}
              {key === 'day' ? '' : <span className="hint"> · {formatAgendaDay(items[0].date, today)}</span>}
            </h2>
            {items.map(row)}
          </div>
        );
      })}
      {done.length > 0 && (
        <details className="card">
          <summary>Erledigt ({done.length})</summary>
          <div style={{ marginTop: 8 }}>{done.map(row)}</div>
        </details>
      )}
    </div>
  );
}
