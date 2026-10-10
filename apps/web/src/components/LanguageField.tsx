import { LANGUAGES, LANGUAGE_LABELS, isLanguageSubject, type Language } from '@study/core';
import { useAccess } from '../lib/access';

/**
 * Unterrichtssprache eines Fachs. Sie bestimmt, in welcher Sprache die KI Zusammenfassungen und Karteikarten schreibt:
 * Englisch bei Englisch und bilingualen Fächern (Bio Bili), Deutsch bei Bio Deutsch, Französisch bei Französisch ...
 */
export function LanguageField({ value, subjectName, onChange }: { value: Language; subjectName: string; onChange: (l: Language) => void }) {
  const access = useAccess();
  const note = !access.anyAi
    ? 'In dieser Sprache wird das Fach unterrichtet.'
    : value === 'de'
      ? 'Zusammenfassungen und KI-Karten kommen auf Deutsch.'
      : value === 'la'
        ? 'Lateinische Begriffe und Sätze bleiben Latein, Fragen und Erklärungen kommen auf Deutsch.'
        : isLanguageSubject(subjectName)
          ? `Zusammenfassungen und KI-Karten kommen auf ${LANGUAGE_LABELS[value]}.`
          : `Bilingualer Unterricht: Zusammenfassungen und KI-Karten kommen auf ${LANGUAGE_LABELS[value]}.`;
  return (
    <div className="field">
      <span>Unterrichtssprache</span>
      <div className="row note-filter" role="group" aria-label="Unterrichtssprache">
        {LANGUAGES.map((l) => (
          <button key={l} type="button" className="chip" aria-pressed={value === l} onClick={() => onChange(l)}>
            {l === 'de' ? 'Deutsch (z. B. Bio Deutsch)' : l === 'en' ? 'Englisch (Bili)' : LANGUAGE_LABELS[l]}
          </button>
        ))}
      </div>
      <p className="hint">{note}</p>
    </div>
  );
}
