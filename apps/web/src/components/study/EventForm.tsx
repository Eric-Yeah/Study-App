import { EVENT_KINDS, EVENT_KIND_LABELS, formatClock, matchSubjectId, parseClock, type EventKind, type StudyEvent, type Subject } from '@study/core';
import { useState } from 'react';
import { uid } from '../../lib/format';

const WEEKDAYS = [
  { value: 1, label: 'Montag' },
  { value: 2, label: 'Dienstag' },
  { value: 3, label: 'Mittwoch' },
  { value: 4, label: 'Donnerstag' },
  { value: 5, label: 'Freitag' },
  { value: 6, label: 'Samstag' },
  { value: 0, label: 'Sonntag' },
];

type Rhythm = 'weekly' | 'biweekly' | 'once';

const time = (min: number) => formatClock(min);

/** Einen Termin im Stundenplan anlegen oder ändern: Vorlesung, Übung, Seminar oder gesperrte Zeit (Job, Pendeln). */
export function EventForm({
  modules,
  initial,
  defaultDate,
  onSave,
  onCancel,
  onDelete,
}: {
  modules: Subject[];
  initial?: StudyEvent;
  defaultDate: string;
  onSave: (e: StudyEvent) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [kind, setKind] = useState<EventKind>(initial?.kind ?? 'lecture');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [subjectId, setSubjectId] = useState<string>(initial?.subjectId ?? '');
  const [rhythm, setRhythm] = useState<Rhythm>(initial ? (initial.date !== null ? 'once' : initial.every === 2 ? 'biweekly' : 'weekly') : 'weekly');
  const [weekday, setWeekday] = useState(initial?.weekday ?? new Date(defaultDate + 'T00:00:00').getDay());
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [start, setStart] = useState(time(initial?.startMin ?? 10 * 60));
  const [end, setEnd] = useState(time(initial?.endMin ?? 12 * 60));
  const [room, setRoom] = useState(initial?.room ?? '');
  const [lecturer, setLecturer] = useState(initial?.lecturer ?? '');
  const [validFrom, setValidFrom] = useState(initial?.validFrom ?? '');
  const [validTo, setValidTo] = useState(initial?.validTo ?? '');

  const s = parseClock(start);
  const e = parseClock(end);
  const subjectName = modules.find((m) => m.id === subjectId)?.name ?? '';
  const effectiveTitle = title.trim() || subjectName || EVENT_KIND_LABELS[kind];
  const valid = s !== null && e !== null && e > s && (rhythm !== 'once' || /^\d{4}-\d{2}-\d{2}$/.test(date)) && (rhythm !== 'biweekly' || /^\d{4}-\d{2}-\d{2}$/.test(validFrom));

  const save = () => {
    if (!valid || s === null || e === null) return;
    onSave({
      id: initial?.id ?? uid(),
      subjectId: subjectId || matchSubjectId(effectiveTitle, modules),
      kind,
      title: effectiveTitle,
      room: room.trim(),
      lecturer: lecturer.trim(),
      weekday: rhythm === 'once' ? null : weekday,
      date: rhythm === 'once' ? date : null,
      startMin: s,
      endMin: e,
      every: rhythm === 'biweekly' ? 2 : 1,
      validFrom: rhythm === 'once' ? null : validFrom || null,
      validTo: rhythm === 'once' ? null : validTo || null,
      skipped: initial?.skipped ?? [],
      uid: initial?.uid ?? null,
    });
  };

  return (
    <form
      className="card stack"
      style={{ gap: 14 }}
      onSubmit={(ev) => {
        ev.preventDefault();
        save();
      }}
    >
      <h2>{initial ? 'Termin ändern' : 'Neuer Termin'}</h2>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label className="field">
          <span>Art</span>
          <select className="input" value={kind} onChange={(ev) => setKind(ev.target.value as EventKind)}>
            {EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {EVENT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Modul</span>
          <select className="input" value={subjectId} onChange={(ev) => setSubjectId(ev.target.value)} disabled={kind === 'blocked'}>
            <option value="">(keins)</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Titel</span>
        <input className="input" value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder={subjectName || (kind === 'blocked' ? 'Nebenjob' : 'Vorlesung Analysis')} maxLength={160} />
      </label>
      <div className="field">
        <span>Wann?</span>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {(
            [
              ['weekly', 'Jede Woche'],
              ['biweekly', 'Alle 2 Wochen'],
              ['once', 'Einmalig'],
            ] as [Rhythm, string][]
          ).map(([value, label]) => (
            <button key={value} type="button" className="chip" aria-pressed={rhythm === value} onClick={() => setRhythm(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {rhythm === 'once' ? (
          <label className="field">
            <span>Datum</span>
            <input className="input" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
          </label>
        ) : (
          <label className="field">
            <span>Wochentag</span>
            <select className="input" value={weekday} onChange={(ev) => setWeekday(Number(ev.target.value))}>
              {WEEKDAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Von</span>
          <input className="input" type="time" value={start} onChange={(ev) => setStart(ev.target.value)} />
        </label>
        <label className="field">
          <span>Bis</span>
          <input className="input" type="time" value={end} onChange={(ev) => setEnd(ev.target.value)} />
        </label>
      </div>
      {s !== null && e !== null && e <= s && <p className="notice">Das Ende muss nach dem Beginn liegen.</p>}
      {rhythm !== 'once' && (
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="field">
            <span>{rhythm === 'biweekly' ? 'Erste Woche am' : 'Gilt ab (optional)'}</span>
            <input className="input" type="date" value={validFrom} onChange={(ev) => setValidFrom(ev.target.value)} />
          </label>
          <label className="field">
            <span>Gilt bis (optional)</span>
            <input className="input" type="date" value={validTo} onChange={(ev) => setValidTo(ev.target.value)} />
          </label>
        </div>
      )}
      {kind !== 'blocked' && (
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="field">
            <span>Raum</span>
            <input className="input" value={room} onChange={(ev) => setRoom(ev.target.value)} maxLength={120} />
          </label>
          <label className="field">
            <span>Dozent/in</span>
            <input className="input" value={lecturer} onChange={(ev) => setLecturer(ev.target.value)} maxLength={120} />
          </label>
        </div>
      )}
      {kind === 'blocked' && <p className="hint">Gesperrte Zeit (Job, Pendeln) mindert die Lernzeit, die der Plan an diesem Tag einplant.</p>}
      <div className="between">
        {onDelete ? (
          <button type="button" className="btn btn-ghost btn-danger" onClick={onDelete}>
            Löschen
          </button>
        ) : (
          <span />
        )}
        <div className="row">
          <button type="button" className="btn" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={!valid}>
            Speichern
          </button>
        </div>
      </div>
    </form>
  );
}
