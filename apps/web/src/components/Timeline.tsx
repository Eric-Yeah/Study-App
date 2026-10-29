import type { DayKind } from '@study/core';
import { useMode } from '../lib/mode';

const LABELS: Record<DayKind, string> = {
  study: 'Lernen',
  review: 'Wiederholen',
  free: 'Frei',
  exam: 'Prüfung/Klausur',
  none: 'Kein Plan',
};

export function Timeline({ days, showLegend = true }: { days: DayKind[]; showLegend?: boolean }) {
  const { terms } = useMode();
  const counts = days.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d]: (acc[d] ?? 0) + 1 }), {});
  const summary = `Zeitleiste: ${counts.study ?? 0} Lerntage, ${counts.review ?? 0} Wiederholungstage, ${counts.free ?? 0} freie Tage, dann die ${terms.exam}`;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="timeline" role="img" aria-label={summary}>
        {days.map((d, i) => (
          <span key={i} className={`tl-${d}`} title={d === 'exam' ? terms.exam : LABELS[d]} />
        ))}
      </div>
      {showLegend && (
        <div className="legend" aria-hidden="true">
          <span>
            <i className="tl-study" />
            Lernen
          </span>
          <span>
            <i className="tl-review" />
            Wiederholen
          </span>
          <span>
            <i className="tl-free" />
            Frei
          </span>
          <span>
            <i className="tl-exam" />
            {terms.exam}
          </span>
        </div>
      )}
    </div>
  );
}
