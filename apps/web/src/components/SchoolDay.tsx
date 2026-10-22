import { dayView, lessonsOn, splitFreePeriods, toIsoDate, type SubstitutionEntry, type TimetableLesson } from '@study/core';
import { Link } from 'react-router-dom';
import { formatAgendaDay, formatMinutes } from '../lib/format';
import { useLanisAuto } from '../lib/lanisAuto';
import { useStore } from '../state/store';

const KIND_LABEL = { cancelled: 'Entfall', substitute: 'Vertretung', room: 'Raumwechsel', other: 'Änderung' } as const;

function addDay(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return toIsoDate(new Date(y, m - 1, d + n));
}

const minutesBetween = (a: string, b: string) => {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return bh * 60 + bm - (ah * 60 + am);
};

function age(iso: string | null): string | null {
  if (!iso) return null;
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return 'gerade eben';
  if (h < 24) return `vor ${h} h`;
  const d = Math.round(h / 24);
  return `vor ${d} ${d === 1 ? 'Tag' : 'Tagen'}`;
}

function SubTag({ s }: { s: SubstitutionEntry }) {
  const label =
    s.kind === 'substitute' && s.substitute
      ? `Vertretung: ${s.substitute}`
      : s.kind === 'room' && s.room
        ? `Raum ${s.room}`
        : KIND_LABEL[s.kind];
  return <span className={`tag ${s.kind === 'cancelled' ? 'danger' : 'warn'}`}>{label}</span>;
}

/** Schule heute (oder am nächsten Schultag): Stunden, Freistunden und Vertretungen aus Lanis. */
export function SchoolDay() {
  const { state } = useStore();
  const auto = useLanisAuto();
  const tt = state.timetable;

  if (!tt) {
    return (
      <div className="card stack">
        <h2>Schule</h2>
        <p className="muted">Hol deinen Stundenplan und die Vertretungen aus Lanis, dann siehst du hier den Schultag und deine Freistunden.</p>
        <Link className="btn" to="/import">
          Aus Lanis importieren
        </Link>
      </div>
    );
  }

  const todayIso = toIsoDate(new Date());
  let iso = todayIso;
  for (let i = 0; i < 5 && lessonsOn(tt, iso).length === 0; i++) iso = addDay(iso, 1);
  const view = dayView(tt, state.substitutions, state.subjects, iso);
  const { study: free, lunch } = splitFreePeriods(tt, iso);
  const rows = [
    ...groupByPeriod(view.lessons).map((g) => ({ period: g[0].lesson.period, kind: 'lessons' as const, group: g })),
    ...free.map((f) => ({ period: f.period, kind: 'free' as const, free: f })),
    ...lunch.map((f) => ({ period: f.period, kind: 'lunch' as const, free: f })),
  ].sort((a, b) => a.period - b.period);
  const changes = view.lessons.reduce((n, l) => n + l.substitutions.length, 0) + view.unmatched.length;
  const subsAge = age(state.substitutionsAt);
  const stale = state.substitutionsAt ? Date.now() - new Date(state.substitutionsAt).getTime() > 18 * 3_600_000 : false;

  return (
    <div className="card stack">
      <div className="between">
        <h2>Schule {iso === todayIso ? 'heute' : formatAgendaDay(iso, todayIso).toLowerCase()}</h2>
        {changes > 0 ? (
          <span className="tag warn">{changes} {changes === 1 ? 'Änderung' : 'Änderungen'}</span>
        ) : (
          state.substitutionsAt && <span className="tag">keine Änderungen</span>
        )}
      </div>

      {rows.length === 0 && <p className="hint">Keine Stunden in den nächsten Tagen im Plan.</p>}
      <div className="sch">
        {rows.map((r) =>
          r.kind === 'lunch' ? (
            <div key={`m${r.period}`} className="sch-row free">
              <span className="sch-time">
                {r.free.start}
                <small>{r.free.end}</small>
              </span>
              <div className="sch-main">
                <strong>Mittagspause</strong>
                <span className="hint">{formatMinutes(minutesBetween(r.free.start, r.free.end))} zum Essen</span>
              </div>
            </div>
          ) : r.kind === 'free' ? (
            <div key={`f${r.period}`} className="sch-row free">
              <span className="sch-time">
                {r.free.start}
                <small>{r.free.end}</small>
              </span>
              <div className="sch-main">
                <strong>Freistunde</strong>
                <span className="hint">{formatMinutes(minutesBetween(r.free.start, r.free.end))} zum Lernen</span>
              </div>
            </div>
          ) : (
            <div key={`l${r.period}`} className="sch-row">
              <span className="sch-time">
                {r.group[0].lesson.start}
                <small>{r.group[0].lesson.end}</small>
              </span>
              <div className="sch-main">
                {r.group.map(({ lesson, subjectId, substitutions }) => {
                  const subject = state.subjects.find((s) => s.id === subjectId);
                  const cancelled = substitutions.some((s) => s.kind === 'cancelled');
                  return (
                    <div key={lesson.course} className="sch-lesson" style={{ ['--c' as string]: subject?.color ?? 'var(--ink-3)' }}>
                      <strong className={cancelled ? 'done-text' : ''}>
                        {subject?.name ?? lesson.abbr}
                        {lesson.isAdvanced && <em> LK</em>}
                      </strong>
                      <span className="hint">
                        {lesson.room}
                        {lesson.teacher ? ` · ${lesson.teacher}` : ''}
                      </span>
                      {substitutions.map((s, i) => (
                        <span key={i} className="sch-sub">
                          <SubTag s={s} />
                          {(s.note ?? (s.kind === 'cancelled' && s.art && !/entfall|ausfall|entfällt/i.test(s.art) ? s.art : null)) && (
                            <span className="hint">{s.note ?? s.art}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ),
        )}
      </div>

      {view.unmatched.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <p className="hint">Weitere Änderungen</p>
          {view.unmatched.map((s, i) => (
            <p key={i} className="notice">
              {s.periods.length ? `${s.periods.join('.–')}. Stunde` : 'Ganztägig'}: {[s.subject, KIND_LABEL[s.kind], s.substitute, s.room, s.note].filter(Boolean).join(' · ')}
            </p>
          ))}
        </div>
      )}

      {state.substitutionsAt && (
        <p className="hint">
          Vertretungsplan: Stand {subsAge}.{' '}
          {auto.enabled || auto.dsbEnabled ? (
            <>
              Aktualisiert sich automatisch.{' '}
              <button type="button" className="link-btn" disabled={auto.busy} onClick={() => void auto.refresh(true)}>
                {auto.busy ? 'Aktualisiere …' : 'Jetzt aktualisieren'}
              </button>
            </>
          ) : (
            <>
              {stale ? 'Er ist nicht mehr aktuell, ' : ''}
              <Link to="/import">{stale ? 'neu abrufen' : 'Aktualisieren'}</Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function groupByPeriod<T extends { lesson: TimetableLesson }>(items: T[]): T[][] {
  const map = new Map<number, T[]>();
  for (const i of items) map.set(i.lesson.period, [...(map.get(i.lesson.period) ?? []), i]);
  return [...map.values()].sort((a, b) => a[0].lesson.period - b[0].lesson.period);
}
