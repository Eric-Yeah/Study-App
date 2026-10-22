import { shuffle, type Flashcard, type Subject } from '@study/core';
import { ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DifficultyTag } from '../DifficultyPicker';
import { StudyDone, StudyHead } from './StudyDone';

/** Durchblättern: Karten umdrehen und weiterblättern, ohne Bewertung. Zählt nicht für die Wiederholung. */
export function StudyBrowse({ cards, subjects, onClose }: { cards: Flashcard[]; subjects: Subject[]; onClose: () => void }) {
  const [list, setList] = useState(cards);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const card = list[index];
  const subject = card ? subjects.find((s) => s.id === card.subjectId) : undefined;

  const go = (by: number) => {
    setShown(false);
    setIndex((i) => Math.min(list.length - 1, Math.max(0, i + by)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'Escape') return onClose();
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setShown((s) => !s);
      } else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!card) return <StudyDone title="Keine Karten" text="Hier gibt es nichts zum Blättern." onClose={onClose} />;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <StudyHead label={`${index + 1} von ${list.length}`} progress={(index + 1) / list.length} onClose={onClose} />
      <button
        type="button"
        className="flash flip"
        style={{ ['--c' as string]: subject?.color ?? 'var(--ink-3)' }}
        onClick={() => setShown(!shown)}
        aria-label={shown ? 'Zeigt die Antwort, tippen für die Frage' : 'Zeigt die Frage, tippen für die Antwort'}
      >
        <span className="between" style={{ width: '100%' }}>
          <span className="hint">{subject?.name ?? ''}</span>
          <DifficultyTag value={card.difficulty} />
        </span>
        <span className="flash-text">{shown ? card.back : card.front}</span>
        <span className="hint">{shown ? 'Antwort' : 'Frage'} · tippen zum Umdrehen</span>
      </button>
      <div className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
        <button type="button" className="btn" disabled={index === 0} onClick={() => go(-1)} aria-label="Vorherige Karte">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setList(shuffle(list));
            setIndex(0);
            setShown(false);
          }}
        >
          <Shuffle size={16} aria-hidden="true" /> Mischen
        </button>
        <button type="button" className="btn" disabled={index === list.length - 1} onClick={() => go(1)} aria-label="Nächste Karte">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="hint kbd-hint">Tastatur: Leertaste dreht um, Pfeiltasten blättern.</p>
    </div>
  );
}
