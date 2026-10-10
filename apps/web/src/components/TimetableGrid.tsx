import { matchSubject, toIsoDate, weekdayIndex, type TimetableLesson } from '@study/core';
import { Link } from 'react-router-dom';
import { useStore } from '../state/store';

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];

/** Wochenraster des Stundenplans, Doppelstunden über zwei Zeilen, Fächer in ihren Farben. */
export function TimetableGrid() {
  const { state } = useStore();
  const tt = state.timetable;
  if (!tt) return null;

  const today = weekdayIndex(toIsoDate(new Date()));
  const rowOf = new Map(tt.periods.map((p, i) => [p.period, i]));
  // Mehrere Kurse in derselben Stunde teilen sich eine Zelle
  const cells = new Map<string, TimetableLesson[]>();
  for (const l of tt.lessons) cells.set(`${l.weekday}:${l.period}`, [...(cells.get(`${l.weekday}:${l.period}`) ?? []), l]);

  const colorOf = (l: TimetableLesson) => state.subjects.find((s) => s.id === matchSubject(l.abbr, state.subjects))?.color;

  return (
    <div className="card stack">
      <div className="between">
        <h2>Stundenplan</h2>
        <Link className="link-btn" to="/import" style={{ fontSize: 13 }}>
          Aus Lanis aktualisieren
        </Link>
      </div>
      <div className="tt" style={{ gridTemplateRows: `auto repeat(${tt.periods.length}, minmax(40px, auto))` }}>
        <span />
        {DAYS.map((d, i) => (
          <span key={d} className={`tt-head${i === today ? ' today' : ''}`}>
            {d}
          </span>
        ))}
        {tt.periods.map((p, i) => (
          <span key={p.period} className="tt-time" style={{ gridRow: i + 2, gridColumn: 1 }}>
            {p.period}.<small>{p.start}</small>
          </span>
        ))}
        {[...cells.entries()].map(([key, list]) => {
          const first = list[0];
          const row = rowOf.get(first.period);
          if (row === undefined) return null;
          return (
            <div
              key={key}
              className={`tt-cell${first.weekday === today ? ' today' : ''}`}
              style={{
                gridColumn: first.weekday + 2,
                gridRow: `${row + 2} / span ${Math.max(...list.map((l) => l.span))}`,
                ['--c' as string]: colorOf(first) ?? 'var(--ink-3)',
              }}
              title={list.map((l) => `${l.course} ${l.room} ${l.teacher}`).join(', ')}
            >
              {list.map((l) => (
                <span key={l.course}>
                  <b>{l.abbr}</b>
                  <small>{l.room}</small>
                </span>
              ))}
            </div>
          );
        })}
      </div>
      <p className="hint">Stand: {tt.validFrom ? `gültig ab ${tt.validFrom.split('-').reverse().join('.')}` : 'aus Lanis'}. Grau sind Kurse, zu denen es in der App kein Fach gibt. Lege sie unter Fächer an.</p>
    </div>
  );
}
