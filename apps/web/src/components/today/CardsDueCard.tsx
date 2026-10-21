import { CONFIG, addDays, buildQueue, estimateCardMinutes, toIsoDate } from '@study/core';
import { Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDateShort } from '../../lib/format';
import { useStore } from '../../state/store';

/** Karteikarten auf Heute: wie viele fällig sind und ein Knopf für eine kurze Runde (zum Beispiel in der Freistunde oder im Bus). */
export function CardsDueCard() {
  const { state } = useStore();
  const iso = toIsoDate(new Date());

  if (state.cards.length === 0) {
    const withSummary = state.notes.filter((n) => n.summary).length;
    if (withSummary === 0) return null;
    return (
      <div className="card stack">
        <h2>Karteikarten</h2>
        <p className="muted">
          Aus {withSummary === 1 ? 'deiner Notiz' : `deinen ${withSummary} Notizen`} kann die App Karten vorschlagen, ohne KI und ohne Kosten. Zwei Minuten, dann sind die ersten da.
        </p>
        <Link className="btn" to="/karten">
          <Layers size={16} aria-hidden="true" /> Vorschläge ansehen
        </Link>
      </div>
    );
  }

  const queue = buildQueue(state.cards, iso);
  if (queue.length === 0) {
    const nextDue = state.cards.map((c) => c.due).filter((d) => d > iso).sort()[0];
    return (
      <div className="card stack">
        <div className="between">
          <h2>Karteikarten</h2>
          <span className="tag">nichts fällig</span>
        </div>
        <p className="hint">
          Alles wiederholt.{nextDue ? ` Die nächste Karte ist ${nextDue === addDays(iso, 1) ? 'morgen' : `am ${formatDateShort(nextDue)}`} dran.` : ''}
        </p>
        <Link className="link-btn" to="/karten">
          Neue Karte anlegen oder üben
        </Link>
      </div>
    );
  }

  const n = Math.min(queue.length, CONFIG.daily.miniRoundCards);
  return (
    <div className="card stack">
      <div className="between">
        <h2>Karteikarten</h2>
        <span className="tag warn">{queue.length} fällig</span>
      </div>
      <p className="hint">Etwa {estimateCardMinutes(queue.length)} min für alle, {estimateCardMinutes(n)} min für die ersten {n}. Zählt als Lernzeit.</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Link className="btn btn-primary" to={`/karten?runde=${n}&von=heute`}>
          {queue.length <= CONFIG.daily.miniRoundCards ? `${n} ${n === 1 ? 'Karte' : 'Karten'} lernen` : `${n} Karten jetzt`}
        </Link>
        {queue.length > n && (
          <Link className="btn" to={`/karten?runde=${CONFIG.cards.maxPerSession}&von=heute`}>
            Alle {queue.length}
          </Link>
        )}
      </div>
    </div>
  );
}
