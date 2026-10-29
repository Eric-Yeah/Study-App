import { lessonsOn, splitFreePeriods, toIsoDate, type PlanDay, type Timetable } from '@study/core';
import { CalendarOff, ChevronDown, ChevronRight, Plus, Utensils } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TimetableGrid } from '../components/TimetableGrid';
import { formatAgendaDay, formatMinutes } from '../lib/format';
import { blocksForDate, combinedPlan, examsWithPlans, learnedMinutesOn, type ExamWithPlan } from '../state/selectors';
import { useMode } from '../lib/mode';
import { useStore } from '../state/store';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const AGENDA_DAYS = 14;

/** Auswahl pro Tag: Normal, weniger Zeit oder Ausfall. Der Plan rechnet danach neu. */
const CAPACITY_OPTIONS = [
  { value: 120, label: 'Bis 2 h' },
  { value: 60, label: 'Bis 1 h' },
  { value: 30, label: 'Bis 30 min' },
  { value: 0, label: 'Fällt aus' },
];

function schoolInfo(tt: Timetable, date: string) {
  const lessons = lessonsOn(tt, date);
  if (lessons.length === 0) return null;
  const { study, lunch } = splitFreePeriods(tt, date);
  return { until: lessons.reduce((m, l) => (l.end > m ? l.end : m), ''), free: study.length, lunch: lunch.length > 0 };
}

const dayParts = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    dow: new Intl.DateTimeFormat('de-DE', { weekday: 'short' }).format(date).replace('.', ''),
    dom: String(d),
    month: new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(date),
  };
};

/** Eine Karte pro Tag: Lernzeit gegen Kapazität, Fächer in Farbe, Schule und Freistunden, Ausfall einstellbar. */
function DayCard({
  day,
  todayIso,
  blocks,
  school,
  onSet,
}: {
  day: PlanDay;
  todayIso: string;
  blocks: { item: ExamWithPlan; minutes: number; kind: 'study' | 'review' }[];
  school: { until: string; free: number; lunch: boolean } | null;
  onSet: (capacityMin: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { dow, dom, month } = dayParts(day.date);
  const dropped = day.overridden && day.capacityMin === 0;
  const off = dropped || (!day.overridden && day.free);
  const scale = Math.max(day.capacityMin, day.totalMin, 1);
  const options = [
    { value: null as number | null, label: day.free ? 'Lernfrei' : 'Normal' },
    ...CAPACITY_OPTIONS,
    ...(day.overridden && !CAPACITY_OPTIONS.some((o) => o.value === day.capacityMin) ? [{ value: day.capacityMin, label: `Bis ${formatMinutes(day.capacityMin)}` }] : []),
  ];
  const current = day.overridden ? day.capacityMin : null;

  return (
    <article className={`day-card${day.date === todayIso ? ' today' : ''}${off ? ' off' : ''}`}>
      <header className="day-head">
        <div className="day-date" aria-hidden="true">
          <span>{dow}</span>
          <b>{dom}</b>
          <small>{month}</small>
        </div>
        <div className="day-title">
          <strong>{formatAgendaDay(day.date, todayIso)}</strong>
          <span className="hint">
            {school ? `Schule bis ${school.until}` : 'Kein Unterricht'}
            {school && school.free > 0 ? ` · ${school.free} ${school.free === 1 ? 'Freistunde' : 'Freistunden'}` : ''}
            {school?.lunch && (
              <>
                {' · '}
                <Utensils size={11} aria-label="Mittagspause" style={{ verticalAlign: '-1px' }} />
              </>
            )}
          </span>
        </div>
        <div className="day-total">
          <b>{dropped || day.totalMin === 0 ? '–' : formatMinutes(day.totalMin)}</b>
          <small>{dropped ? 'fällt aus' : day.free && !day.overridden ? 'lernfrei' : `von ${formatMinutes(day.capacityMin)}`}</small>
        </div>
      </header>

      <div className="day-bar" aria-hidden="true">
        {blocks.map((b) => (
          <i key={b.item.exam.id} style={{ width: `${(b.minutes / scale) * 100}%`, background: b.item.subject.color }} />
        ))}
      </div>

      <ul className="day-blocks">
        {blocks.length === 0 && (
          <li className="hint">
            {dropped ? (
              <>
                <CalendarOff size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Dieser Tag fällt aus, die Zeit steckt in den anderen Tagen.
              </>
            ) : day.free && !day.overridden ? (
              'Lernfreier Tag zum Erholen.'
            ) : (
              'Nichts geplant.'
            )}
          </li>
        )}
        {blocks.map((b) => (
          <li key={b.item.exam.id} style={{ ['--c' as string]: b.item.subject.color }}>
            <i className="dot" style={{ background: b.item.subject.color }} />
            <span>
              {b.item.subject.name}
              {b.kind === 'review' && <em>Wiederholen</em>}
            </span>
            <b>{formatMinutes(b.minutes)}</b>
          </li>
        ))}
      </ul>

      <footer className="day-foot">
        {day.overLimit && <span className="tag warn">über Limit</span>}
        <button type="button" className="day-adjust" aria-expanded={open} onClick={() => setOpen(!open)}>
          {options.find((o) => o.value === current)?.label ?? 'Normal'} · Anpassen
          <ChevronDown size={14} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        </button>
      </footer>
      {open && (
        <div className="day-chips" role="group" aria-label={`Lernzeit am ${formatAgendaDay(day.date, todayIso)}`}>
          {options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={o.value === current}
              onClick={() => {
                onSet(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

export function Plan() {
  const { state, dispatch } = useStore();
  const { isUni, terms } = useMode();
  const today = new Date();
  const todayIso = toIsoDate(today);
  const list = examsWithPlans(state, today);
  const plan = combinedPlan(state, list, today);

  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const week = WEEKDAYS.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = toIsoDate(d);
    const blocks = blocksForDate(plan, list, iso);
    return {
      label,
      iso,
      blocks,
      planned: blocks.reduce((s, b) => s + b.minutes, 0),
      learned: learnedMinutesOn(state.sessions, iso),
      isToday: iso === todayIso,
    };
  });
  const max = Math.max(60, ...week.map((w) => Math.max(w.planned, w.learned)));
  const total = week.reduce((s, w) => s + w.planned, 0);

  const upcoming = list.filter((x) => x.plan.daysLeft >= 0).length;
  const agenda = plan.days.slice(0, AGENDA_DAYS);
  const shortfalls = Object.entries(plan.shortfall)
    .map(([examId, minutes]) => ({ item: list.find((x) => x.exam.id === examId), minutes }))
    .filter((x) => x.item);

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="page-head">
        <div>
          <h1>Plan</h1>
          <p className="sub">Diese Woche geplant: {formatMinutes(total)}</p>
        </div>
        <div className="row">
          <Link className="btn btn-primary" to="/klausur/neu">
            <Plus size={18} aria-hidden="true" /> {terms.newExam}
          </Link>
        </div>
      </div>

      {shortfalls.map(({ item, minutes }) => (
        <p key={item!.exam.id} className="notice" role="status">
          Für {item!.exam.title || item!.subject.name} fehlen im Plan noch {formatMinutes(minutes)}.{' '}
          {isUni
            ? 'Erhöhe das Tageslimit in den Einstellungen, senke die Gesamtzeit der Prüfung oder starte früher.'
            : 'Gib mehr Tage frei (zum Beispiel „Bis 2 h“), senke die Gesamtzeit oder starte früher.'}
        </p>
      ))}

      <div className="card">
        <div
          className="wk"
          role="img"
          aria-label={`Wochenübersicht: ${week.map((w) => `${w.label} ${formatMinutes(w.planned)} geplant, ${formatMinutes(w.learned)} gelernt`).join(', ')}`}
        >
          {week.map((w) => (
            <div key={w.iso} className={`wk-col${w.isToday ? ' today' : ''}`}>
              <div className="wk-bars">
                <div className="wk-plan" style={{ height: `${(w.planned / max) * 100}%` }}>
                  {w.blocks.map((b) => (
                    <i key={b.item.exam.id} style={{ flexGrow: b.minutes, background: b.item.subject.color }} />
                  ))}
                </div>
                <div className="wk-learned" style={{ height: `${(w.learned / max) * 100}%` }} />
              </div>
              <span className="wk-label">{w.label}</span>
            </div>
          ))}
        </div>
        <div className="legend" style={{ marginTop: 12 }}>
          <span>
            <i style={{ background: 'var(--accent)', opacity: 0.55 }} />
            Geplant (Farbe = Fach)
          </span>
          <span>
            <i style={{ background: 'var(--ok)' }} />
            Gelernt
          </span>
        </div>
      </div>

      <section className="stack">
        <div className="between">
          <h2>Nächste Tage</h2>
          <span className="hint">Tippe „Anpassen“, der Plan rechnet neu</span>
        </div>
        {agenda.length === 0 ? (
          <div className="card empty">
            <p className="muted">Sobald {isUni ? 'eine Prüfung' : 'eine Klausur'} ansteht, verteilt die App die Lernzeit auf die Tage.</p>
          </div>
        ) : (
          <div className="days">
            {agenda.map((day) => (
              <DayCard
                key={day.date}
                day={day}
                todayIso={todayIso}
                blocks={blocksForDate(plan, list, day.date)}
                school={state.timetable ? schoolInfo(state.timetable, day.date) : null}
                onSet={(capacityMin) => dispatch({ type: 'setDayOverride', date: day.date, capacityMin })}
              />
            ))}
          </div>
        )}
      </section>

      {isUni ? (
        <Link to="/stundenplan" className="card between" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span>
            <strong>Stundenplan</strong>
            <span className="hint" style={{ display: 'block' }}>
              {state.events.length === 0 ? 'Noch leer: Vorlesungen eintragen oder aus einer Kalenderdatei übernehmen' : `${state.events.length} Termine · Woche, Lücken und gesperrte Zeiten`}
            </span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      ) : (
        <TimetableGrid />
      )}

      <Link to="/klausuren" className="card between" style={{ textDecoration: 'none', color: 'inherit' }}>
        <span>
          <strong>{terms.exams}</strong>
          <span className="hint" style={{ display: 'block' }}>
            {upcoming === 0 ? terms.noExam : upcoming === 1 ? `1 ${terms.exam} steht an` : `${upcoming} ${terms.exams} stehen an`} · Fortschritt und Themen{isUni ? '' : ' und Korrektur'}
          </span>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </div>
  );
}
