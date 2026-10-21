import { CONFIG, addDays, dayWrapUp, parseLocal, toIsoDate } from '@study/core';
import { ChevronRight, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ConcentrationCard } from '../components/ConcentrationCard';
import { SchoolDay } from '../components/SchoolDay';
import { FocusHero } from '../components/today/FocusHero';
import { QuickCards } from '../components/today/QuickCards';
import { StreakCard } from '../components/today/StreakCard';
import { TasksCard } from '../components/today/TasksCard';
import { WrapUp } from '../components/today/WrapUp';
import { formatDateLong, formatDateShort, formatDays, formatMinutes } from '../lib/format';
import {
  activeDaysFor,
  blocksForDate,
  carriedOver,
  combinedPlan,
  examsWithPlans,
  focusRecommendation,
  learnedMinutesOn,
  streakFor,
  stripFor,
  upcoming,
} from '../state/selectors';
import { useStore } from '../state/store';
import { useStartFocus } from '../timer/useStartFocus';
import { useTimer } from '../timer/TimerProvider';

export function Today() {
  const { state, dispatch } = useStore();
  const timer = useTimer();
  const startFocus = useStartFocus();
  const today = new Date();
  const iso = toIsoDate(today);
  const tomorrow = addDays(iso, 1);
  const list = examsWithPlans(state, today);
  const cplan = combinedPlan(state, list, today);
  const blocks = blocksForDate(cplan, list, iso);
  const todayOverride = state.dayOverrides.find((o) => o.date === iso);
  const droppedToday = todayOverride?.capacityMin === 0;
  const goal = blocks.reduce((s, b) => s + b.minutes, 0);
  const learned = learnedMinutesOn(state.sessions, iso);
  const next = upcoming(list)[0];
  const rec = focusRecommendation(state, list, cplan, timer.state.subjectId, today);
  const streak = streakFor(state, today);
  const strip = stripFor(state, list, today);
  const activity = activeDaysFor(state);
  const carried = carriedOver(state, today);
  const evening = today.getHours() >= CONFIG.daily.eveningFromHour;
  const openToday = state.tasks.filter((t) => t.date === iso && !t.done);
  const wrap = dayWrapUp({
    learnedMin: learned,
    goalMin: goal,
    tasksDone: activity.tasksDoneByDate[iso] ?? 0,
    cardsReviewed: activity.cardsByDate[iso] ?? 0,
    streak,
  });
  const tomorrowBlocks = [...blocksForDate(cplan, list, tomorrow).reduce((m, b) => m.set(b.item.subject.name, (m.get(b.item.subject.name) ?? 0) + b.minutes), new Map<string, number>())].map(
    ([name, minutes]) => ({ name, minutes }),
  );
  const tomorrowExam = list.find((x) => x.exam.date === tomorrow);
  const nextStart = upcoming(list)
    .filter((x) => x.plan.hasPlan && x.plan.totalHours.value > 0)
    .map((x) => {
      const d = parseLocal(x.exam.date);
      d.setDate(d.getDate() - x.plan.startDays.value);
      return { item: x, date: d };
    })
    .filter((x) => toIsoDate(x.date) > iso)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>{state.profile?.name ? `Hallo ${state.profile.name}` : 'Heute'}</h1>
          <p className="sub">{formatDateLong(today)}</p>
        </div>
      </div>

      {[5, 6, 0, 1].includes(today.getDay()) && (
        <Link to={today.getDay() === 1 ? '/rueckblick?zurueck=1' : '/rueckblick'} className="card review-teaser">
          <span>
            <strong>{today.getDay() === 1 ? 'Wie war letzte Woche?' : 'Wie war deine Woche?'}</strong>
            <span className="hint"> Wochenrückblick ansehen</span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      )}

      <FocusHero rec={rec} goal={goal} learned={learned} />

      {evening && (
        <WrapUp
          wrap={wrap}
          openTasks={openToday}
          tomorrowDate={tomorrow}
          tomorrowBlocks={tomorrowBlocks}
          tomorrowExam={tomorrowExam ? `${tomorrowExam.exam.title || tomorrowExam.subject.name}, viel Erfolg` : null}
        />
      )}

      <QuickCards />

      <StreakCard streak={streak} strip={strip} />

      <div className="grid cols-2">
        <TasksCard today={iso} carried={carried} tomorrow={state.tasks.filter((t) => t.date === tomorrow && !t.done)} />

        <div className="stack">
          {next ? (
            <Link to={`/klausur/${next.exam.id}`} className="card stack" style={{ textDecoration: 'none', color: 'inherit', background: 'var(--warn-soft)', borderColor: 'transparent' }}>
              <p className="muted" style={{ color: 'var(--warn)' }}>
                Nächste Klausur
              </p>
              <div className="between">
                <div>
                  <h2 style={{ color: 'var(--warn)' }}>{next.exam.title || next.subject.name}</h2>
                  <p style={{ color: 'var(--warn)' }}>
                    {next.subject.name} · {formatDateShort(next.exam.date)}
                  </p>
                </div>
                <span className="big-num" style={{ color: 'var(--warn)' }}>
                  {next.plan.daysLeft === 0 ? 'Heute' : formatDays(next.plan.daysLeft)}
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

          <div className="card stack">
            <h2>Heute geplant</h2>
            {blocks.length > 0 ? (
              blocks.map(({ item, minutes }) => (
                <button key={item.exam.id} type="button" className="plan-row" onClick={() => startFocus(item.subject.id)} aria-label={`${item.subject.name} jetzt lernen starten`}>
                  <span className="row">
                    <span className="dot" style={{ background: item.subject.color }} aria-hidden="true" />
                    <span>
                      {item.subject.name}: {item.exam.title || 'Klausur'}
                    </span>
                  </span>
                  <span className="muted">{formatMinutes(minutes)}</span>
                </button>
              ))
            ) : (
              <p className="hint">
                {nextStart
                  ? `Heute steht kein Lernblock an. ${nextStart.item.subject.name} startet am ${formatDateLong(nextStart.date)}.`
                  : list.length === 0
                    ? 'Heute ist nichts geplant. Lege eine Klausur an, dann verteilt die App die Lernzeit.'
                    : 'Heute steht kein Lernblock an.'}
              </p>
            )}
            {blocks.length > 0 && <p className="hint">Tippe auf ein Fach, dann startet der Timer.</p>}
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
        </div>
      </div>

      <SchoolDay />

      <ConcentrationCard plannedMin={goal} />
    </div>
  );
}
