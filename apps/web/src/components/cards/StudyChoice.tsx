import { buildChoice, gradeFor, isChoiceable, reviewCard, toIsoDate, type Choice, type Flashcard, type Subject } from '@study/core';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { DifficultyTag } from '../DifficultyPicker';
import { StudyDone, StudyHead } from './StudyDone';

/**
 * Multiple Choice: eine richtige und drei falsche Antworten aus anderen Karten. Zählt für die Wiederholung wie
 * "schwer" (nur erkannt, nicht selbst abgerufen), falsch zählt als "nochmal".
 */
export function StudyChoice({ cards, pool, subjects, onClose }: { cards: Flashcard[]; pool: Flashcard[]; subjects: Subject[]; onClose: () => void }) {
  const { dispatch } = useStore();
  const today = toIsoDate(new Date());
  const [round, setRound] = useState(cards.filter(isChoiceable));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [missed, setMissed] = useState<Flashcard[]>([]);
  const [rightCount, setRightCount] = useState(0);
  const card = round[index];
  const subject = card ? subjects.find((s) => s.id === card.subjectId) : undefined;
  // Auswahl einmal je Karte und Runde bauen, damit sie sich beim Antworten nicht neu mischt
  const choices = useMemo(() => new Map<string, Choice | null>(round.map((c) => [c.id, buildChoice(c, pool)])), [round, pool]);
  const choice = card ? choices.get(card.id) : null;

  const answer = (i: number) => {
    if (picked !== null || !card || !choice) return;
    const correct = i === choice.correctIndex;
    setPicked(i);
    dispatch({ type: 'upsertCard', card: reviewCard(card, gradeFor('choice', correct), today) });
    if (correct) setRightCount((n) => n + 1);
    else setMissed((m) => [...m, card]);
  };
  const next = () => {
    setPicked(null);
    setIndex((i) => i + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'Escape') return onClose();
      if (picked !== null && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
      } else if (picked === null && /^[1-4]$/.test(e.key)) answer(Number(e.key) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (index >= round.length || !choice) {
    return (
      <StudyDone
        title="Geschafft"
        big={`${round.length === 0 ? 0 : Math.round((rightCount / round.length) * 100)} %`}
        text={`${rightCount} von ${round.length} richtig.`}
        onClose={onClose}
        extra={
          missed.length > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setRound(missed);
                setMissed([]);
                setRightCount(0);
                setIndex(0);
              }}
            >
              Falsche noch einmal ({missed.length})
            </button>
          )
        }
      />
    );
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <StudyHead label={`${index + 1} von ${round.length}`} progress={index / round.length} onClose={onClose} />
      <div className="flash" style={{ ['--c' as string]: subject?.color ?? 'var(--ink-3)', minHeight: 140 }}>
        <div className="between">
          <span className="hint">{subject?.name ?? ''}</span>
          <DifficultyTag value={card.difficulty} />
        </div>
        <p className="flash-text">{card.front}</p>
      </div>
      <div className="choice-grid">
        {choice.options.map((o, i) => (
          <button
            key={`${i}-${o}`}
            type="button"
            className={`choice-btn${picked !== null && i === choice.correctIndex ? ' right' : ''}${picked === i && i !== choice.correctIndex ? ' wrong' : ''}`}
            disabled={picked !== null}
            onClick={() => answer(i)}
            aria-keyshortcuts={String(i + 1)}
          >
            <span className="choice-key">{i + 1}</span>
            {o}
          </button>
        ))}
      </div>
      {picked !== null && (
        <button type="button" className="btn btn-primary" autoFocus onClick={next}>
          Weiter
        </button>
      )}
      <p className="hint">Tastatur: 1 bis 4 wählt, Leertaste geht weiter.</p>
    </div>
  );
}
