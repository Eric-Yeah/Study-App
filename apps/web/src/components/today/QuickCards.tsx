import { Brain } from 'lucide-react';
import { useState } from 'react';
import { cardRound } from '../../state/selectors';
import { useStore } from '../../state/store';
import { StudyReview } from '../cards/StudyReview';

/** Kurze Kartenrunde direkt auf Heute: fällige Karten, wenige neue, ein paar Minuten. */
export function QuickCards() {
  const { state } = useStore();
  const [round, setRound] = useState<ReturnType<typeof cardRound>['queue'] | null>(null);
  if (round) {
    return (
      <section className="card" data-no-reload aria-label="Kartenrunde">
        <StudyReview queue={round} subjects={state.subjects} onClose={() => setRound(null)} />
      </section>
    );
  }
  const r = cardRound(state);
  if (state.cards.length === 0 || r.queue.length === 0) return null;
  return (
    <section className="card today-card" aria-label="Karten üben">
      <div className="row" style={{ gap: 12 }}>
        <span className="mode-icon" aria-hidden="true">
          <Brain size={20} />
        </span>
        <div>
          <h2>
            {r.queue.length} {r.queue.length === 1 ? 'Karte' : 'Karten'} zum Üben
          </h2>
          <p className="hint">
            ca. {r.minutes} {r.minutes === 1 ? 'Minute' : 'Minuten'}
            {r.fresh > 0 ? `, davon ${r.fresh} neu` : ''}. Zählt auch für deine Serie.
          </p>
        </div>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => setRound(r.queue)}>
        Los
      </button>
    </section>
  );
}
