import { daysAfter, isNewCard, reviewCard, toIsoDate, type CardGrade, type Flashcard, type Subject } from '@study/core';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DifficultyTag } from '../DifficultyPicker';
import { useStore } from '../../state/store';
import { StudyDone } from './StudyDone';
import { useRoundTime } from './useRoundTime';

/** "gleich", "morgen", "in 3 Tagen" für die Knöpfe beim Lernen. */
const when = (days: number) => (days <= 0 ? 'gleich' : days === 1 ? 'morgen' : `in ${days} Tagen`);

const GRADES: { grade: CardGrade; label: string; key: string }[] = [
  { grade: 'again', label: 'Nochmal', key: '1' },
  { grade: 'hard', label: 'Schwer', key: '2' },
  { grade: 'good', label: 'Gut', key: '3' },
  { grade: 'easy', label: 'Leicht', key: '4' },
];

/** Eine Lernrunde: Karte zeigen, Antwort aufdecken, bewerten. "Nochmal" kommt in derselben Runde noch einmal. */
export function StudyReview({
  queue,
  subjects,
  onClose,
  more,
}: {
  queue: Flashcard[];
  subjects: Subject[];
  onClose: () => void;
  /** Nach der Runde ein Knopf für die nächste kurze Runde (zum Beispiel "Noch 5 Karten") */
  more?: { label: string; run: () => void };
}) {
  const { dispatch } = useStore();
  const noteAnswer = useRoundTime(queue);
  const today = toIsoDate(new Date());
  const [list, setList] = useState(queue);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const [requeued, setRequeued] = useState<Set<string>>(new Set());
  const [tally, setTally] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const card = list[index];
  const finished = index >= list.length;
  const subject = card ? subjects.find((s) => s.id === card.subjectId) : undefined;

  const answer = (grade: CardGrade) => {
    if (!card) return;
    const next = reviewCard(card, grade, today);
    dispatch({ type: 'upsertCard', card: next });
    noteAnswer();
    setTally((t) => ({ ...t, [grade]: t[grade] + 1 }));
    // Vergessene Karten kommen noch einmal ans Ende der Runde, aber nur einmal je Karte
    if (grade === 'again' && !requeued.has(card.id)) {
      setRequeued(new Set(requeued).add(card.id));
      setList((l) => [...l, next]);
    }
    setShown(false);
    setIndex((i) => i + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'Escape') return onClose();
      if (finished) return;
      if (!shown && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setShown(true);
      } else if (shown) {
        const g = GRADES.find((x) => x.key === e.key);
        if (g) answer(g.grade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (finished) {
    const total = tally.again + tally.hard + tally.good + tally.easy;
    return (
      <StudyDone
        title="Runde geschafft"
        text={`${total === 1 ? '1 Antwort' : `${total} Antworten`}: ${tally.good + tally.easy} gewusst, ${tally.hard} schwer, ${tally.again} nochmal.`}
        onClose={onClose}
        extra={
          more && (
            <button type="button" className="btn" onClick={more.run}>
              {more.label}
            </button>
          )
        }
      />
    );
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="between">
        <span className="hint">
          {Math.min(index + 1, list.length)} von {list.length}
          {isNewCard(card) ? ' · neu' : ''}
        </span>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Runde beenden" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="bar" aria-hidden="true">
        <i style={{ width: `${(index / list.length) * 100}%` }} />
      </div>
      <div className="flash" style={{ ['--c' as string]: subject?.color ?? 'var(--ink-3)' }}>
        <div className="between">
          <span className="hint">{subject?.name ?? ''}</span>
          <DifficultyTag value={card.difficulty} />
        </div>
        <p className="flash-text">{card.front}</p>
        {shown && <p className="flash-text flash-back">{card.back}</p>}
      </div>
      {!shown ? (
        <button type="button" className="btn btn-primary" onClick={() => setShown(true)}>
          Antwort zeigen
        </button>
      ) : (
        <div className="grade-row">
          {GRADES.map(({ grade, label, key }) => (
            <button key={grade} type="button" className={`btn grade-${grade}`} onClick={() => answer(grade)} aria-keyshortcuts={key}>
              <strong>{label}</strong>
              <small>{when(daysAfter(card, grade, today))}</small>
            </button>
          ))}
        </div>
      )}
      <p className="hint kbd-hint">Tastatur: Leertaste zeigt die Antwort, 1 bis 4 bewertet.</p>
    </div>
  );
}
