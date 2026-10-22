import { checkTyped, gradeFor, isTypable, reviewCard, toIsoDate, type Flashcard, type Subject } from '@study/core';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { DifficultyTag } from '../DifficultyPicker';
import { StudyDone, StudyHead } from './StudyDone';
import { useRoundTime } from './useRoundTime';

/**
 * Schreiben: die Antwort eintippen, die App prüft ohne Groß- und Kleinschreibung und verzeiht kleine Tippfehler.
 * Das Ergebnis zählt für die Wiederholung (richtig = gut, falsch = nochmal). "Ich hatte recht" korrigiert die Prüfung.
 */
export function StudyWrite({ cards, subjects, onClose }: { cards: Flashcard[]; subjects: Subject[]; onClose: () => void }) {
  const { dispatch } = useStore();
  const noteAnswer = useRoundTime(cards);
  const today = toIsoDate(new Date());
  const [round, setRound] = useState(cards.filter(isTypable));
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<{ result: 'correct' | 'close' | 'wrong'; expected: string } | null>(null);
  const [missed, setMissed] = useState<Flashcard[]>([]);
  const [rightCount, setRightCount] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const card = round[index];
  const subject = card ? subjects.find((s) => s.id === card.subjectId) : undefined;

  useEffect(() => {
    if (!feedback) field.current?.focus();
  }, [index, feedback, round]);

  const finish = (correct: boolean) => {
    if (!card) return;
    dispatch({ type: 'upsertCard', card: reviewCard(card, gradeFor('write', correct), today) });
    noteAnswer();
    if (correct) setRightCount((n) => n + 1);
    else setMissed((m) => [...m, card]);
    setFeedback(null);
    setInput('');
    setIndex((i) => i + 1);
  };

  const check = () => {
    if (!card || feedback) return;
    setFeedback(checkTyped(input, card.back));
  };

  if (index >= round.length) {
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
      >
        {missed.length > 0 && (
          <ul className="missed-list">
            {missed.map((c) => (
              <li key={c.id}>
                <strong>{c.front}</strong>
                <span className="hint">{c.back.split('\n')[0]}</span>
              </li>
            ))}
          </ul>
        )}
      </StudyDone>
    );
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <StudyHead label={`${index + 1} von ${round.length}`} progress={index / round.length} onClose={onClose} />
      <div className="flash" style={{ ['--c' as string]: subject?.color ?? 'var(--ink-3)' }}>
        <div className="between">
          <span className="hint">{subject?.name ?? ''}</span>
          <DifficultyTag value={card.difficulty} />
        </div>
        <p className="flash-text">{card.front}</p>
      </div>
      {!feedback ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            check();
          }}
        >
          <input ref={field} className="input write-input" value={input} placeholder="Deine Antwort" autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => setInput(e.target.value)} />
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              Prüfen
            </button>
            <button type="button" className="btn" onClick={() => setFeedback({ result: 'wrong', expected: checkTyped('', card.back).expected })}>
              Weiß ich nicht
            </button>
          </div>
        </form>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <div className={`answer-box ${feedback.result === 'wrong' ? 'bad' : 'good'}`} role="status">
            <strong>{feedback.result === 'correct' ? 'Richtig!' : feedback.result === 'close' ? 'Fast richtig, achte auf die Schreibweise.' : 'Leider falsch.'}</strong>
            {feedback.result !== 'correct' && <span>Richtig ist: {feedback.expected}</span>}
            {input.trim() && feedback.result === 'wrong' && <span className="hint">Du hast geschrieben: {input}</span>}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} autoFocus onClick={() => finish(feedback.result !== 'wrong')}>
              Weiter
            </button>
            {feedback.result === 'wrong' && (
              <button type="button" className="btn" onClick={() => finish(true)}>
                Ich hatte recht
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
