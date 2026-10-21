import type { WrapUp as WrapUpData } from '@study/core';
import { Moon } from 'lucide-react';
import { formatMinutes } from '../../lib/format';
import { useStore, type Task } from '../../state/store';

/** Tagesabschluss ab dem späten Nachmittag: was geschafft ist, offene Aufgaben auf morgen schieben, was morgen ansteht. */
export function WrapUp({
  wrap,
  openTasks,
  tomorrowDate,
  tomorrowBlocks,
  tomorrowExam,
}: {
  wrap: WrapUpData;
  openTasks: Task[];
  tomorrowDate: string;
  tomorrowBlocks: { name: string; minutes: number }[];
  tomorrowExam: string | null;
}) {
  const { dispatch } = useStore();
  const total = tomorrowBlocks.reduce((s, b) => s + b.minutes, 0);
  return (
    <section className={`card stack wrap-up wrap-${wrap.level}`} aria-label="Tagesabschluss">
      <div className="row" style={{ gap: 8 }}>
        <Moon size={18} aria-hidden="true" />
        <h2>{wrap.title}</h2>
      </div>
      {wrap.text && <p>{wrap.text}</p>}
      {openTasks.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="hint">
            {openTasks.length} {openTasks.length === 1 ? 'Aufgabe ist' : 'Aufgaben sind'} noch offen.
          </span>
          <button type="button" className="btn" onClick={() => dispatch({ type: 'moveTasks', ids: openTasks.map((t) => t.id), date: tomorrowDate })}>
            Auf morgen schieben
          </button>
        </div>
      )}
      <p className="hint">
        {tomorrowExam
          ? `Morgen: ${tomorrowExam}.`
          : total > 0
            ? `Morgen geplant: ${formatMinutes(total)} (${tomorrowBlocks.map((b) => b.name).join(', ')}).`
            : 'Morgen ist kein Lernblock geplant.'}
      </p>
    </section>
  );
}
