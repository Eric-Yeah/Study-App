import { coursesWithAbsences, hasAbsences, totalOfKind } from '@study/core';
import { useStore } from '../state/store';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Heute: Fehlstunden aus Lanis. Erscheint nur, wenn irgendwo eine Fehlzeit eingetragen ist. */
export function AbsencesCard() {
  const { state } = useStore();
  const report = state.absences;
  if (!report || !hasAbsences(report)) return null;

  const totals = Object.entries(report.totals).filter(([, n]) => n > 0);
  const courses = coursesWithAbsences(report);
  const unexcused = totalOfKind(report, 'unexcused');
  const labels = [...new Set(courses.flatMap((c) => Object.keys(c.counts).filter((k) => c.counts[k] > 0)))];

  return (
    <details className="card stack">
      <summary className="between" style={{ cursor: 'pointer' }}>
        <h2>Fehlstunden</h2>
        <span className={`tag${unexcused > 0 ? ' warn' : ''}`}>
          {totals.map(([k, n]) => `${n} ${k}`).join(' · ')}
        </span>
      </summary>
      {unexcused > 0 && (
        <p className="notice" role="status">
          {unexcused} {unexcused === 1 ? 'Stunde ist' : 'Stunden sind'} noch unentschuldigt. Kläre das am besten bald mit der Lehrkraft.
        </p>
      )}
      <div className="stack" style={{ gap: 6 }}>
        {courses.map((c) => (
          <div key={c.course} className="between">
            <strong>{c.course}</strong>
            <span className="muted">
              {labels
                .filter((k) => c.counts[k] > 0)
                .map((k) => `${cap(k)} ${c.counts[k]}`)
                .join(' · ')}
            </span>
          </div>
        ))}
      </div>
      {state.absencesAt && <p className="hint">Stand aus Lanis: {new Date(state.absencesAt).toLocaleDateString('de-DE')}. Die Zahlen führt die Schule, nicht die App.</p>}
    </details>
  );
}
