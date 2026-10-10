import { DIFFICULTIES, DIFFICULTY_LABELS, type Difficulty } from '@study/core';

export const DIFFICULTY_HINTS: Record<Difficulty, string> = {
  1: 'Einen Begriff oder Fakt direkt abfragen. Kommt später wieder.',
  2: 'Etwas in eigenen Worten erklären oder zuordnen.',
  3: 'Einen Zusammenhang begründen oder eine Formel anwenden. Kommt früher wieder.',
  4: 'Mehrere Gedanken verbinden oder auf einen neuen Fall übertragen. Kommt am frühesten wieder.',
};

/** Vier Stufen zum Auswählen, farbig von grün (einfach) bis rot (sehr schwer). */
export function DifficultyPicker({ value, onChange, disabled = false, label = 'Schwierigkeit' }: { value: Difficulty; onChange: (d: Difficulty) => void; disabled?: boolean; label?: string }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="diff-pick" role="group" aria-label={label}>
        {DIFFICULTIES.map((d) => (
          <button key={d} type="button" className="diff-pill" data-d={d} aria-pressed={value === d} disabled={disabled} onClick={() => onChange(d)}>
            {DIFFICULTY_LABELS[d]}
          </button>
        ))}
      </div>
      <p className="hint">{DIFFICULTY_HINTS[value]}</p>
    </div>
  );
}

/** Kleine farbige Marke mit dem Namen der Stufe. */
export function DifficultyTag({ value }: { value: Difficulty }) {
  return (
    <span className="diff-tag" data-d={value}>
      {DIFFICULTY_LABELS[value]}
    </span>
  );
}
