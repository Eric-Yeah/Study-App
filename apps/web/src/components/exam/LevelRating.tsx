import { useState } from 'react';
import { useStore } from '../../state/store';

const OPTIONS: { value: number; label: string }[] = [
  { value: -1, label: 'Zu leicht' },
  { value: 0, label: 'Genau richtig' },
  { value: 1, label: 'Zu schwer' },
];

/** Rückmeldung zur Schwierigkeit einer Übungsklausur. Damit passt die App die nächste Klausur dieser Stufe an. */
export function LevelRating({ practiceId }: { practiceId: string }) {
  const { state, dispatch } = useStore();
  const practice = state.practiceExams.find((p) => p.id === practiceId);
  const [saved, setSaved] = useState(false);
  if (!practice) return null;
  const set = (value: number | null) => {
    dispatch({ type: 'upsertPractice', practice: { ...practice, rating: value } });
    setSaved(value !== null);
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="form-label">Wie war die Schwierigkeit?</span>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Schwierigkeit der Übungsklausur">
        {OPTIONS.map((o) => (
          <button key={o.value} type="button" className="chip" aria-pressed={practice.rating === o.value} onClick={() => set(practice.rating === o.value ? null : o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="hint">
        {saved || practice.rating !== null
          ? 'Gespeichert. Die nächste Übungsklausur dieser Stufe passt sich daran an.'
          : 'Damit passt die App die nächste Übungsklausur dieser Stufe an. Auch das Ergebnis deiner Lösung zählt dabei.'}
      </p>
    </div>
  );
}
