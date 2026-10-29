import { EVENT_KIND_LABELS, addDay, eventLength, formatClock, gapsOn, mondayOf, toIsoDate, weekOf, type StudyEvent } from '@study/core';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { EventForm } from '../components/study/EventForm';
import { IcsImport } from '../components/study/IcsImport';
import { formatMinutes } from '../lib/format';
import { useStore } from '../state/store';

const dayName = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(y, m - 1, d));
};

/** Stundenplan im Studium: Woche mit Vorlesungen, Übungen und gesperrten Zeiten, Eintragen von Hand oder aus einer .ics-Datei. */
export function Schedule() {
  const { state, dispatch } = useStore();
  const todayIso = toIsoDate(new Date());
  const [anchor, setAnchor] = useState(todayIso);
  const [editing, setEditing] = useState<{ event?: StudyEvent } | null>(null);
  const modules = state.subjects.filter((s) => s.scope === 'uni');
  const week = weekOf(state.events, anchor);
  const monday = mondayOf(anchor);
  const sunday = addDay(monday, 6);
  const subject = (id: string | null) => state.subjects.find((s) => s.id === id);

  const skipDay = (e: StudyEvent, date: string) => {
    if (e.date !== null) dispatch({ type: 'deleteEvents', ids: [e.id] });
    else dispatch({ type: 'upsertEvents', events: [{ ...e, skipped: [...new Set([...e.skipped, date])].sort() }] });
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Stundenplan</h1>
          <p className="sub">
            {dayName(monday)} bis {dayName(sunday)}
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-icon" aria-label="Vorherige Woche" onClick={() => setAnchor(addDay(monday, -7))}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button type="button" className="btn" onClick={() => setAnchor(todayIso)} disabled={monday === mondayOf(todayIso)}>
            Diese Woche
          </button>
          <button type="button" className="btn btn-icon" aria-label="Nächste Woche" onClick={() => setAnchor(addDay(monday, 7))}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>
            <Plus size={18} aria-hidden="true" /> Termin
          </button>
        </div>
      </div>

      {editing && (
        <EventForm
          modules={modules}
          initial={editing.event}
          defaultDate={anchor}
          onCancel={() => setEditing(null)}
          onSave={(event) => {
            dispatch({ type: 'upsertEvents', events: [event] });
            setEditing(null);
          }}
          onDelete={
            editing.event
              ? () => {
                  if (confirm('Diesen Termin (alle Wochen) löschen?')) {
                    dispatch({ type: 'deleteEvents', ids: [editing.event!.id] });
                    setEditing(null);
                  }
                }
              : undefined
          }
        />
      )}

      {state.events.length === 0 && !editing && (
        <p className="notice">Noch kein Stundenplan. Trag Vorlesungen und Übungen von Hand ein oder übernimm sie unten aus einer Kalenderdatei.</p>
      )}

      <div className="week-grid">
        {week.map((cell) => {
          const gaps = cell.events.some((e) => e.kind !== 'blocked') ? gapsOn(state.events, cell.date, { minGapMin: 60 }) : [];
          return (
            <section key={cell.date} className={`week-day${cell.date === todayIso ? ' today' : ''}`} aria-label={dayName(cell.date)}>
              <h3>{dayName(cell.date)}</h3>
              {cell.events.length === 0 && <p className="hint">Frei</p>}
              {cell.events.map((e) => {
                const s = subject(e.subjectId);
                return (
                  <div key={e.id} className={`week-event${e.kind === 'blocked' ? ' blocked' : ''}`} style={{ borderLeftColor: s?.color ?? 'var(--line-strong)' }}>
                    <button type="button" className="week-event-main" onClick={() => setEditing({ event: e })} aria-label={`${e.title} bearbeiten`}>
                      <strong>
                        {formatClock(e.startMin)}–{formatClock(e.endMin)}
                      </strong>
                      <span>{e.title}</span>
                      <span className="hint">
                        {[EVENT_KIND_LABELS[e.kind], e.room, e.every === 2 ? 'alle 2 Wochen' : null].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                    <button type="button" className="link-btn" onClick={() => skipDay(e, cell.date)}>
                      Fällt aus
                    </button>
                  </div>
                );
              })}
              {gaps.length > 0 && (
                <p className="hint">
                  Lücken: {gaps.map((g) => `${formatClock(g.startMin)}–${formatClock(g.endMin)} (${formatMinutes(eventLength({ startMin: g.startMin, endMin: g.endMin }))})`).join(', ')}
                </p>
              )}
            </section>
          );
        })}
      </div>

      <IcsImport onDone={() => undefined} />

      {state.events.length > 0 && (
        <div className="card stack" style={{ gap: 8 }}>
          <h2>Alle Termine</h2>
          <p className="hint">{state.events.length} Termine gespeichert.</p>
          <button
            type="button"
            className="btn btn-ghost btn-danger"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              if (confirm(`Alle ${state.events.length} Termine aus dem Stundenplan löschen?`)) dispatch({ type: 'deleteEvents', ids: state.events.map((e) => e.id) });
            }}
          >
            Stundenplan leeren
          </button>
        </div>
      )}
    </div>
  );
}
