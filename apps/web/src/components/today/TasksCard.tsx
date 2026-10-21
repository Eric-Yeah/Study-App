import { Check, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatAgendaDay, uid } from '../../lib/format';
import { useStore, type Task } from '../../state/store';

function TaskRow({ task, subjectName, extra }: { task: Task; subjectName?: string; extra?: ReactNode }) {
  const { dispatch } = useStore();
  return (
    <div className="task">
      <button
        type="button"
        className="check"
        role="checkbox"
        aria-checked={task.done}
        aria-label={`${task.title} erledigt`}
        onClick={() => dispatch({ type: 'toggleTask', id: task.id })}
      >
        {task.done && <Check size={14} aria-hidden="true" />}
      </button>
      <span style={{ flex: 1 }} className={task.done ? 'done-text' : ''}>
        {task.title}
        {subjectName && <span className="hint"> · {subjectName}</span>}
      </span>
      {extra}
      <button type="button" className="btn btn-ghost btn-icon" aria-label="Aufgabe löschen" onClick={() => dispatch({ type: 'deleteTask', id: task.id })}>
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Aufgaben für heute, dazu was von den letzten Tagen offen geblieben ist (ein Tipp holt es auf heute) und was für morgen vorgemerkt ist. */
export function TasksCard({ today, carried, tomorrow }: { today: string; carried: Task[]; tomorrow: Task[] }) {
  const { state, dispatch } = useStore();
  const [title, setTitle] = useState('');
  const tasks = state.tasks.filter((t) => t.date === today);
  const subjectName = (id: string | null) => state.subjects.find((s) => s.id === id)?.name;
  const toToday = (ids: string[]) => dispatch({ type: 'moveTasks', ids, date: today });

  return (
    <div className="card stack" style={{ gap: 8 }}>
      <h2>Aufgaben</h2>
      {tasks.length === 0 && carried.length === 0 && <p className="hint">Noch keine Aufgaben für heute.</p>}
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} subjectName={subjectName(t.subjectId)} />
      ))}

      {carried.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="between">
            <span className="form-label">Noch offen von früher</span>
            {carried.length > 1 && (
              <button type="button" className="link-btn" onClick={() => toToday(carried.map((t) => t.id))}>
                Alle auf heute
              </button>
            )}
          </div>
          {carried.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              subjectName={[formatAgendaDay(t.date, today), subjectName(t.subjectId)].filter(Boolean).join(' · ')}
              extra={
                <button type="button" className="chip" onClick={() => toToday([t.id])} aria-label={`${t.title} auf heute holen`}>
                  Auf heute
                </button>
              }
            />
          ))}
        </div>
      )}

      <form
        className="row"
        style={{ marginTop: 4 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          dispatch({ type: 'addTask', task: { id: uid(), title: title.trim(), subjectId: null, minutes: null, date: today, done: false } });
          setTitle('');
        }}
      >
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vokabeln Unit 5" aria-label="Neue Aufgabe" maxLength={200} />
        <button className="btn" type="submit">
          Hinzufügen
        </button>
      </form>

      {tomorrow.length > 0 && (
        <p className="hint">
          Für morgen vorgemerkt: {tomorrow.slice(0, 3).map((t) => t.title).join(', ')}
          {tomorrow.length > 3 ? ` und ${tomorrow.length - 3} weitere` : ''}.
        </p>
      )}
    </div>
  );
}
