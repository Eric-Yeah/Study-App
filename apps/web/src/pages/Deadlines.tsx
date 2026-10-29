import { DEADLINE_KINDS, DEADLINE_LABELS, DEADLINE_TEMPLATES, CONFIG, allDeadlines, deadlineText, examsWithoutRegistration, toIsoDate, type Deadline, type DeadlineKind } from '@study/core';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateShort, uid } from '../lib/format';
import { useStore } from '../state/store';

/** Fristen im Studium: Rückmeldung, Prüfungsanmeldung, BAföG, Abgaben. Die App erinnert, die Termine kennt nur die Hochschule. */
export function Deadlines() {
  const { state, dispatch } = useStore();
  const today = toIsoDate(new Date());
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [kind, setKind] = useState<DeadlineKind>('other');
  const [remind, setRemind] = useState<number>(CONFIG.study.defaultRemindDays);
  const items = allDeadlines(state.deadlines, state.exams, state.subjects, today);
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const missing = examsWithoutRegistration(state.exams, today);
  const valid = title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const add = () => {
    if (!valid) return;
    dispatch({ type: 'upsertDeadline', deadline: { id: uid(), title: title.trim(), date, kind, done: false, remindDays: remind } });
    setTitle('');
    setDate('');
    setKind('other');
  };
  const own = (id: string): Deadline | undefined => state.deadlines.find((d) => d.id === id);

  const row = (i: (typeof items)[number]) => {
    const mine = own(i.id);
    return (
      <div key={i.id} className="task">
        {mine ? (
          <button type="button" className="check" role="checkbox" aria-checked={i.done} aria-label={`${i.title} erledigt`} onClick={() => dispatch({ type: 'upsertDeadline', deadline: { ...mine, done: !mine.done } })}>
            {i.done && <Check size={14} aria-hidden="true" />}
          </button>
        ) : (
          <span style={{ width: 22 }} />
        )}
        <span style={{ flex: 1 }} className={i.done ? 'done-text' : ''}>
          {i.examId ? <Link to={`/klausur/${i.examId}`}>{i.title}</Link> : i.title}
          <span className="hint">
            {' '}
            · {DEADLINE_LABELS[i.kind]} · {formatDateShort(i.date)}
            {!i.done && ` · ${deadlineText(i.daysLeft)}`}
          </span>
          {i.urgent && <span style={{ color: 'var(--warn)' }}> · bald</span>}
        </span>
        {mine && (
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Frist löschen" onClick={() => dispatch({ type: 'deleteDeadline', id: i.id })}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Fristen</h1>
          <p className="sub">Rückmeldung, Prüfungsanmeldung, BAföG und Abgaben. Die App erinnert dich, die genauen Termine kennt deine Hochschule.</p>
        </div>
      </div>

      {missing.length > 0 && (
        <p className="notice">
          Zu {missing.length === 1 ? 'einer Prüfung' : `${missing.length} Prüfungen`} in den nächsten 90 Tagen fehlt die Anmeldefrist:{' '}
          {missing.slice(0, 3).map((e, n) => (
            <span key={e.id}>
              {n > 0 && ', '}
              <Link to={`/klausur/${e.id}`}>{e.title || state.subjects.find((s) => s.id === e.subjectId)?.name}</Link>
            </span>
          ))}
          . Trag sie in der Prüfung ein, dann erinnert die App rechtzeitig.
        </p>
      )}

      <div className="card stack" style={{ gap: 12 }}>
        <h2>Neue Frist</h2>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {DEADLINE_TEMPLATES.map((t) => (
            <button key={t.title} type="button" className="chip" onClick={() => { setTitle(t.title); setKind(t.kind); }} title={t.hint}>
              {t.title}
            </button>
          ))}
        </div>
        <form
          className="stack"
          style={{ gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label className="field">
            <span>Was?</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rückmeldung zum Sommersemester" maxLength={120} />
          </label>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label className="field">
              <span>Datum</span>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Art</span>
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as DeadlineKind)}>
                {DEADLINE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DEADLINE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Erinnerung (Tage vorher)</span>
              <input className="input" type="number" inputMode="numeric" min={0} max={60} value={remind} onChange={(e) => setRemind(Math.min(60, Math.max(0, Math.round(Number(e.target.value)) || 0)))} />
            </label>
          </div>
          {title && DEADLINE_TEMPLATES.find((t) => t.title === title) && <p className="hint">{DEADLINE_TEMPLATES.find((t) => t.title === title)?.hint}</p>}
          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={!valid}>
            <Plus size={18} aria-hidden="true" /> Frist hinzufügen
          </button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 8 }}>Offen</h2>
        {open.length === 0 && <p className="hint">Keine offenen Fristen.</p>}
        {open.map(row)}
      </div>
      {done.length > 0 && (
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Erledigt</h2>
          {done.map(row)}
        </div>
      )}
    </div>
  );
}
