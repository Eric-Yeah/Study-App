import { CONFIG } from '@study/core';
import { Flame } from 'lucide-react';
import { streakFor } from '../../state/daily';
import { useStore } from '../../state/store';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Serie mit Gnade und die Woche als Punkte. Ein Ausfalltag bricht die Serie nicht, es gibt keinen Druck und keine Strafe. */
export function StreakRow() {
  const { state } = useStore();
  const s = streakFor(state, new Date());
  const min = CONFIG.daily.streakMinMinutes;

  const headline =
    s.current >= 2
      ? `${s.current} Lerntage in Folge`
      : s.current === 1
        ? s.todayDone
          ? 'Heute zählt, morgen kann die Serie wachsen'
          : '1 Lerntag in Folge'
        : 'Starte heute eine neue Serie';
  const detail = s.todayDone
    ? s.savedDate
      ? 'Ein freier Tag in der Serie war in Ordnung.'
      : 'Heute zählt als Lerntag.'
    : `Noch ${s.needTodayMin} min Lernzeit, dann zählt der heutige Tag.`;

  return (
    <div className="streak">
      <div className="week-dots" role="img" aria-label={`Lerntage dieser Woche, ab ${min} Minuten zählt ein Tag`}>
        {s.week.map((d, i) => (
          <span key={d.date} className={`wd${d.active ? ' on' : ''}${d.neutral ? ' off' : ''}${d.today ? ' today' : ''}${d.future ? ' future' : ''}`} title={`${d.minutes} min`}>
            <i aria-hidden="true">{d.active ? '✓' : ''}</i>
            <small>{WEEKDAYS[i]}</small>
          </span>
        ))}
      </div>
      <div className="streak-text">
        <strong className="row" style={{ gap: 6 }}>
          <Flame size={16} aria-hidden="true" /> {headline}
        </strong>
        <span className="hint">
          {detail}
          {s.best > s.current && s.best >= 3 ? ` Bestwert: ${s.best}.` : ''}
        </span>
      </div>
    </div>
  );
}
