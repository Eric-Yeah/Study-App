import type { RealityStatus } from '@study/core';
import { Link } from 'react-router-dom';
import { Timeline } from './Timeline';
import { formatDateShort, formatHours, formatInDays, formatMinutes } from '../lib/format';
import { examsWithPlans, learnedForExam, realityFor, topicsOf } from '../state/selectors';
import { useMode } from '../lib/mode';
import { useStore } from '../state/store';

const REALITY_TEXT: Record<RealityStatus, (min: number) => string> = {
  not_started: () => '',
  ahead: (m) => `${formatMinutes(m)} voraus`,
  on_track: () => 'Im Plan',
  behind: (m) => `${formatMinutes(-m)} hinter dem Plan`,
  far_behind: (m) => `${formatMinutes(-m)} hinter dem Plan`,
};

/** Alle Klausuren als Karten mit Fortschritt, Realitätscheck, Themen und Zeitleiste (Bereich Klausuren, Reiter Termine). */
export function ExamCards() {
  const { state } = useStore();
  const { isUni } = useMode();
  const today = new Date();
  const list = examsWithPlans(state, today);
  return (
    <>
      {list.length === 0 && (
        <div className="card empty">
          <p className="muted">{isUni ? 'Noch keine Prüfung angelegt. Lege sie von Hand an, dann plant die App die Lernzeit aus den ECTS des Moduls.' : 'Noch keine Klausur angelegt. Importiere sie aus Lanis oder lege sie von Hand an.'}</p>
        </div>
      )}
      <div className="grid cols-2 match">
        {list.map((item) => {
          const learned = learnedForExam(state.sessions, item) / 60;
          const totalH = item.plan.totalHours.value;
          const topics = topicsOf(state, item.exam.id);
          const reality = item.plan.hasPlan && item.plan.daysLeft > 0 ? realityFor(state, item, today) : null;
          return (
            <Link
              key={item.exam.id}
              to={`/klausur/${item.exam.id}`}
              className="card exam-card stack"
              style={{ ['--c' as string]: item.subject.color }}
            >
              <div className="between">
                <strong className="exam-title">{item.exam.title || item.subject.name}</strong>
                <span className={`tag${item.plan.daysLeft <= 7 && item.plan.daysLeft >= 0 ? ' warn' : ''}`}>
                  {item.plan.daysLeft < 0 ? 'vorbei' : item.plan.daysLeft === 0 ? 'heute' : formatInDays(item.plan.daysLeft)}
                </span>
              </div>
              <p className="hint">
                {item.subject.name} · {formatDateShort(item.exam.date)} · Priorität {item.plan.priority.value}
              </p>
              {item.plan.hasPlan ? (
                <>
                  <div className="bar">
                    <i style={{ width: `${totalH ? Math.min(100, (learned / totalH) * 100) : 0}%`, background: 'var(--c)' }} />
                  </div>
                  <p className="hint">
                    {formatHours(learned)} von {formatHours(totalH)} · {formatMinutes(item.plan.minutesPerStudyDay)} pro Lerntag
                  </p>
                  {reality && reality.status !== 'not_started' && (
                    <p className={`reality ${reality.status}`}>{REALITY_TEXT[reality.status](reality.deltaMin)}</p>
                  )}
                  {topics.total > 0 && (
                    <p className="hint">
                      Themen: {topics.done} von {topics.total} erledigt
                    </p>
                  )}
                  <Timeline days={item.plan.timeline} showLegend={false} />
                </>
              ) : (
                <p className="hint">Fach abgewählt, kein Lernplan.</p>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
