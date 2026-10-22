import { parseLocal, sessionLength, toIsoDate } from '@study/core';
import { Check, ChevronRight, Play, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConcentrationCard } from '../components/ConcentrationCard';
import { AbsencesCard } from '../components/AbsencesCard';
import { SchoolDay } from '../components/SchoolDay';
import { CardsDueCard } from '../components/today/CardsDueCard';
import { NextUpCard } from '../components/today/NextUpCard';
import { PushNudge } from '../components/today/PushNudge';
import { StreakRow } from '../components/today/StreakRow';
import { formatDateLong, formatDateShort, formatDays, formatMinutes, uid } from '../lib/format';
import { minutesBySubject, nextUpFor, openTasksFor } from '../state/daily';
import { blocksForDate, combinedPlan, examsWithPlans, learnedMinutesOn, upcoming } from '../state/selectors';
import { useStore } from '../state/store';
import { useTimer } from '../timer/TimerProvider';

export function Today() {
  const { state, dispatch } = useStore();
  const timer = useTimer();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const today = new Date();
  const iso = toIsoDate(today);
  const list = examsWithPlans(state, today);
  const cplan = combinedPlan(state, list, today);
  const blocks = blocksForDate(cplan, list, iso);
  const todayOverride = state.dayOverrides.find((o) => o.date === iso);
  const droppedToday = todayOverride?.capacityMin === 0;
  const goal = blocks.reduce((s, b) => s + b.minutes, 0);
  const learned = learnedMinutesOn(state.sessions, iso);
  const nextExam = upcoming(list)[0];
  const tasks = state.tasks.filter((t) => t.date === iso);
  const overdue = openTasksFor(state, iso).filter((t) => t.date < iso);
  const subjectName = (id: string | null) => state.subjects.find((s) => s.id === id)?.name;
  const nextStart = upcoming(list)
    .filter((x) => x.plan.hasPlan && x.plan.totalHours.value > 0)
    .map((x) => {
      const d = parseLocal(x.exam.date);
      d.setDate(d.getDate() - x.plan.startDays.value);
      return { item: x, date: d };
    })
    .filter((x) => toIsoDate(x.date) > iso)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

  // Das, was jetzt dran ist, und der Ein-Tipp-Start für die geplanten Blöcke
  const { next, slot } = nextUpFor(state, today, { list, blocks });
  const learnedBySubject = minutesBySubject(state, iso);
  const plannedBySubject = blocks.reduce<Record<string, number>>((m, b) => ({ ...m, [b.item.subject.id]: (m[b.item.subject.id] ?? 0) + b.minutes }), {});
  const startBlock = (subjectId: string) => {
    const remaining = (plannedBySubject[subjectId] ?? 0) - (learnedBySubject[subjectId] ?? 0);
    if (timer.state.status === 'idle') timer.startWith({ subjectId, minutes: sessionLength(state.timer.focusMin, remaining > 0 ? remaining : null, slot) });
    navigate('/fokus');
  };

  const taskRow = (t: (typeof tasks)[number], note?: string) => (
    <div key={t.id} className="task">
      <button
        type="button"
        className="check"
        role="checkbox"
        aria-checked={t.done}
        aria-label={`${t.title} erledigt`}
        onClick={() => dispatch({ type: 'toggleTask', id: t.id })}
      >
        {t.done && <Check size={14} aria-hidden="true" />}
      </button>
      <span style={{ flex: 1 }} className={t.done ? 'done-text' : ''}>
        {t.title}
        {t.subjectId && <span className="hint"> · {subjectName(t.subjectId)}</span>}
        {note && <span className="hint"> · {note}</span>}
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
          <h1>{state.profile?.name ? `Hallo ${state.profile.name}` : 'Heute'}</h1>
          <p className="sub">{formatDateLong(today)}</p>
        </div>
      </div>

      <NextUpCard list={list} next={next} slot={slot} />

      {[5, 6, 0, 1].includes(today.getDay()) && (
        <Link to={today.getDay() === 1 ? '/rueckblick?zurueck=1' : '/rueckblick'} className="card review-teaser">
          <span>
            <strong>{today.getDay() === 1 ? 'Wie war letzte Woche?' : 'Wie war deine Woche?'}</strong>
            <span className="hint"> Wochenrückblick ansehen</span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      )}

      <div className="grid cols-2 match">
        <div className="card stack">
          <div className="between">
            <h2>Lernzeit heute</h2>
            <strong>
              {formatMinutes(learned)} / {goal ? formatMinutes(goal) : '–'}
            </strong>
          </div>
          <div className="bar">
            <i style={{ width: `${goal ? Math.min(100, (learned / goal) * 100) : 0}%` }} />
          </div>
          <p className="hint">
            {goal === 0
              ? nextStart
                ? `Heute steht kein Lernblock an. ${nextStart.item.subject.name} startet am ${formatDateLong(nextStart.date)}.`
                : list.length === 0
                  ? 'Heute ist nichts geplant. Lege eine Klausur an, dann verteilt die App die Lernzeit.'
                  : 'Heute steht kein Lernblock an.'
              : learned >= goal
                ? 'Tagesziel erreicht.'
                : `Noch ${formatMinutes(goal - learned)} bis zum Tagesziel.`}
          </p>
          <StreakRow />
          {list.length > 0 && (
            <button
              type="button"
              className="link-btn"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => dispatch({ type: 'setDayOverride', date: iso, capacityMin: droppedToday ? null : 0 })}
            >
              {droppedToday ? 'Heute doch lernen' : 'Heute fällt aus, Plan anpassen'}
            </button>
          )}
        </div>

        <div className="stack">
          {nextExam ? (
            <Link to={`/klausur/${nextExam.exam.id}`} className="card stack" style={{ textDecoration: 'none', color: 'inherit', background: 'var(--warn-soft)', borderColor: 'transparent' }}>
              <p className="muted" style={{ color: 'var(--warn)' }}>
                Nächste Klausur
              </p>
              <div className="between">
                <div>
                  <h2 style={{ color: 'var(--warn)' }}>{nextExam.exam.title || nextExam.subject.name}</h2>
                  <p style={{ color: 'var(--warn)' }}>
                    {nextExam.subject.name} · {formatDateShort(nextExam.exam.date)}
                  </p>
                </div>
                <span className="big-num" style={{ color: 'var(--warn)' }}>
                  {nextExam.plan.daysLeft === 0 ? 'Heute' : formatDays(nextExam.plan.daysLeft)}
                </span>
              </div>
            </Link>
          ) : (
            <div className="card stack">
              <h2>Keine Klausur geplant</h2>
              <p className="muted">Trag deine nächste Klausur ein, dann schlägt die App Vorlauf und Lernzeit vor.</p>
              <Link className="btn" to="/klausur/neu">
                <Plus size={18} aria-hidden="true" /> Klausur anlegen
              </Link>
            </div>
          )}
          {next.kind !== 'cards' && <CardsDueCard />}
        </div>
      </div>

      <SchoolDay />

      <AbsencesCard />

      <PushNudge />

      <ConcentrationCard plannedMin={goal} />

      {blocks.length > 0 && (
        <div className="card stack">
          <h2>Heute geplant</h2>
          {blocks.map(({ item, minutes }) => {
            const done = (learnedBySubject[item.subject.id] ?? 0) >= (plannedBySubject[item.subject.id] ?? 0);
            return (
              <button key={item.exam.id} type="button" className="plan-row" onClick={() => startBlock(item.subject.id)} aria-label={`${item.subject.name} lernen, ${formatMinutes(minutes)} geplant`}>
                <span className="row" style={{ gap: 10, minWidth: 0 }}>
                  <span className="dot" style={{ background: item.subject.color }} />
                  <span className={`plan-row-name${done ? ' done-text' : ''}`}>
                    {item.subject.name}: {item.exam.title || 'Klausur'}
                  </span>
                </span>
                <span className="row" style={{ gap: 10, flex: 'none' }}>
                  <span className="muted">{done ? 'erledigt' : formatMinutes(minutes)}</span>
                  <Play size={16} aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="card">
        <h2 style={{ marginBottom: 8 }}>Aufgaben</h2>
        {tasks.length === 0 && overdue.length === 0 && <p className="hint">Noch keine Aufgaben für heute. Über das Plus unten rechts legst du schnell eine an.</p>}
        {overdue.map((t) => taskRow(t, `offen seit ${formatDateShort(t.date)}`))}
        {tasks.map((t) => taskRow(t))}
        <form
          className="row"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            dispatch({ type: 'addTask', task: { id: uid(), title: title.trim(), subjectId: null, minutes: null, date: iso, done: false } });
            setTitle('');
          }}
        >
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vokabeln Unit 5" aria-label="Neue Aufgabe" />
          <button className="btn" type="submit">
            Hinzufügen
          </button>
        </form>
      </div>
    </div>
  );
}
