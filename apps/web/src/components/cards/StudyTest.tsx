import { checkTyped, scoreTest, type Flashcard, type TestQuestion } from '@study/core';
import { Check, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { StudyDone, StudyHead } from './StudyDone';

interface Answer {
  correct: boolean;
  given: string;
}

const KIND_LABEL = { choice: 'Multiple Choice', truefalse: 'Richtig oder falsch', write: 'Schreiben' } as const;

/**
 * Test: gemischte Fragen (Auswahl, Richtig oder falsch, Schreiben), erst am Ende steht das Ergebnis mit allen Fehlern.
 * Ein Test ändert den Wiederholungsplan der Karten nicht.
 */
export function StudyTest({ questions, cards, onClose, onAgain, onPracticeWrong }: { questions: TestQuestion[]; cards: Flashcard[]; onClose: () => void; onAgain: () => void; onPracticeWrong: (wrong: Flashcard[]) => void }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [input, setInput] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const q = questions[index];

  const record = (correct: boolean, given: string) => {
    setAnswers((a) => [...a, { correct, given }]);
    setInput('');
    setIndex((i) => i + 1);
  };

  if (questions.length === 0) return <StudyDone title="Zu wenig Karten" text="Für einen Test braucht es mindestens eine Karte." onClose={onClose} />;

  if (!q) {
    const score = scoreTest(answers.map((a) => a.correct));
    const wrong = questions.flatMap((qq, i) => (answers[i]?.correct ? [] : cards.filter((c) => c.id === qq.cardId)));
    return (
      <StudyDone
        title="Testergebnis"
        big={`${score.percent} %`}
        text={`${score.correct} von ${score.total} richtig.`}
        onClose={onClose}
        extra={
          <>
            <button type="button" className="btn" onClick={onAgain}>
              Neuer Test
            </button>
            {wrong.length > 0 && (
              <button type="button" className="btn" onClick={() => onPracticeWrong(wrong)}>
                Falsche üben ({wrong.length})
              </button>
            )}
          </>
        }
      >
        <ul className="test-review">
          {questions.map((qq, i) => (
            <li key={i} className={answers[i]?.correct ? 'ok' : 'bad'}>
              <span className="test-mark" aria-label={answers[i]?.correct ? 'richtig' : 'falsch'}>
                {answers[i]?.correct ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
              </span>
              <span>
                <strong>{qq.prompt}</strong>
                {!answers[i]?.correct && (
                  <span className="hint">
                    Richtig: {qq.kind === 'choice' ? qq.options[qq.correctIndex] : qq.kind === 'truefalse' ? qq.correct : qq.expected}
                    {answers[i]?.given ? ` · deine Antwort: ${answers[i].given}` : ''}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </StudyDone>
    );
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <StudyHead label={`Frage ${index + 1} von ${questions.length} · ${KIND_LABEL[q.kind]}`} progress={index / questions.length} onClose={onClose} />
      <div className="flash" style={{ minHeight: 140 }}>
        <p className="flash-text">{q.prompt}</p>
        {q.kind === 'truefalse' && <p className="flash-text flash-back">{q.shown}</p>}
      </div>
      {q.kind === 'choice' && (
        <div className="choice-grid">
          {q.options.map((o, i) => (
            <button key={`${i}-${o}`} type="button" className="choice-btn" onClick={() => record(i === q.correctIndex, o)}>
              <span className="choice-key">{i + 1}</span>
              {o}
            </button>
          ))}
        </div>
      )}
      {q.kind === 'truefalse' && (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => record(q.isTrue, 'richtig')}>
            Richtig
          </button>
          <button type="button" className="btn" style={{ flex: 1 }} onClick={() => record(!q.isTrue, 'falsch')}>
            Falsch
          </button>
        </div>
      )}
      {q.kind === 'write' && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            record(checkTyped(input, q.back).result !== 'wrong', input.trim());
            field.current?.focus();
          }}
        >
          <input ref={field} className="input write-input" autoFocus value={input} placeholder="Deine Antwort" autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => setInput(e.target.value)} />
          <button type="submit" className="btn btn-primary">
            Weiter
          </button>
        </form>
      )}
    </div>
  );
}
