import { CONFIG, type StreakResult, type StripDay } from '@study/core';
import { Flame } from 'lucide-react';
import { formatMinutes } from '../../lib/format';

const STATE_LABEL: Record<StripDay['state'], string> = {
  done: 'gelernt',
  missed: 'ausgefallen',
  paused: 'frei',
  today: 'heute',
  future: 'kommt noch',
};

function headline(s: StreakResult): string {
  if (s.current === 0) return s.todayDone ? 'Serie gestartet' : 'Starte heute deine Serie';
  return `${s.current} ${s.current === 1 ? 'Tag' : 'Tage'} in Folge`;
}

function note(s: StreakResult): string | null {
  if (s.breakIfMissed) return 'Heute zählt: Ohne Lernzeit reißt die Serie.';
  if (s.forgivenDay && !s.todayDone) return 'Gestern war frei, die Serie hält. Heute noch etwas, dann ist alles gut.';
  if (s.atRisk) return `Heute fehlt noch etwas: ${CONFIG.daily.streakMinMinutes} Minuten Fokus oder ${CONFIG.daily.streakMinCards} Karten.`;
  if (s.todayDone && s.best > s.current) return `Bestwert: ${s.best} Tage.`;
  if (s.todayDone) return 'Heute ist schon geschafft.';
  return null;
}

/** Serie mit Gnade und die Woche als Streifen: ein Blick sagt, ob man dranbleibt. */
export function StreakCard({ streak, strip }: { streak: StreakResult; strip: { days: StripDay[]; learnedMin: number; plannedMin: number } }) {
  const n = note(streak);
  return (
    <section className="card stack streak-card" aria-label="Serie und Woche">
      <div className="between">
        <h2 className="streak-title">
          <Flame size={20} aria-hidden="true" className={streak.current > 0 ? 'streak-flame on' : 'streak-flame'} />
          {headline(streak)}
        </h2>
        <span className="hint">
          Woche: {formatMinutes(strip.learnedMin)}
          {strip.plannedMin > 0 ? ` von ${formatMinutes(strip.plannedMin)}` : ''}
        </span>
      </div>
      <ol className="week-strip">
        {strip.days.map((d) => (
          <li key={d.date} className="week-day" data-state={d.state} aria-current={d.isToday ? 'date' : undefined}>
            <span className="week-dot" aria-hidden="true" />
            <span className="week-label">{d.label}</span>
            <span className="sr-only">{`${d.label}: ${STATE_LABEL[d.state]}`}</span>
          </li>
        ))}
      </ol>
      {n && <p className={streak.breakIfMissed ? 'notice' : 'hint'}>{n}</p>}
    </section>
  );
}
