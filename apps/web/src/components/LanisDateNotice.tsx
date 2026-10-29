import { pendingNotice } from '@study/core';
import { CalendarCheck } from 'lucide-react';
import { formatDateShort } from '../lib/format';
import { useStore } from '../state/store';

/**
 * Einmaliger Hinweis, wenn der Lanis-Kalender einen anderen Termin nennt als den, den du selbst gesetzt hast.
 * Dein Termin bleibt, die App überschreibt ihn nie. "Verstanden" blendet den Hinweis für dieses Lanis-Datum dauerhaft aus,
 * erst ein weiteres, neues Lanis-Datum meldet sich wieder.
 */
export function LanisDateNotice() {
  const { state, dispatch } = useStore();
  const open = state.exams.flatMap((exam) => {
    const lanis = pendingNotice(exam);
    return lanis ? [{ exam, lanis }] : [];
  });
  if (open.length === 0) return null;

  return (
    <div className="stack" style={{ gap: 12 }}>
      {open.map(({ exam, lanis }) => (
        <div key={exam.id} className="card stack" role="status">
          <div className="notice-soft">
            <CalendarCheck size={20} aria-hidden="true" />
            <div className="stack" style={{ gap: 4 }}>
              <strong>{exam.title || 'Klausur'}: dein Termin bleibt</strong>
              <span className="muted">
                Im Lanis-Kalender steht der {formatDateShort(lanis)}, du hast sie auf den {formatDateShort(exam.date)} gelegt. Dein Datum hat Vorrang und wird nicht überschrieben. Diesen Hinweis siehst du nur einmal.
              </span>
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'upsertExam', exam: { ...exam, lanisNotice: null, lanisAck: lanis } })}>
              Verstanden
            </button>
            <button type="button" className="link-btn" onClick={() => dispatch({ type: 'upsertExam', exam: { ...exam, date: lanis, lanisNotice: null, lanisAck: lanis } })}>
              Lanis-Datum übernehmen
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
