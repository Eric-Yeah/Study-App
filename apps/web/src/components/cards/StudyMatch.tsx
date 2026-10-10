import { buildMatchSet, type Flashcard, type MatchTile } from '@study/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StudyDone, StudyHead } from './StudyDone';

const BEST_KEY = 'study-app-match-best';

const readBest = (): number | null => {
  try {
    const v = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

/** Zuordnen: Fragen und Antworten sind gemischte Kacheln, passende Paare antippen, möglichst schnell. Zählt nicht für die Wiederholung. */
export function StudyMatch({ cards, onClose }: { cards: Flashcard[]; onClose: () => void }) {
  const [game, setGame] = useState(0); // neue Runde, neuer Satz
  const tiles = useMemo<MatchTile[] | null>(() => buildMatchSet(cards), [cards, game]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState<{ ms: number; best: boolean } | null>(null);
  const start = useRef(Date.now());
  const pairs = tiles ? tiles.length / 2 : 0;

  useEffect(() => {
    start.current = Date.now();
    setSelected(null);
    setDone(new Set());
    setMistakes(0);
    setElapsed(0);
    setFinished(null);
  }, [game]);

  useEffect(() => {
    if (finished || !tiles) return;
    const id = window.setInterval(() => setElapsed(Date.now() - start.current), 100);
    return () => window.clearInterval(id);
  }, [finished, tiles, game]);

  const tap = (t: MatchTile) => {
    if (finished || done.has(t.pairId) || flash.length > 0) return;
    if (selected === null) return setSelected(t.id);
    if (selected === t.id) return setSelected(null);
    const first = tiles!.find((x) => x.id === selected)!;
    if (first.pairId === t.pairId && first.side !== t.side) {
      const next = new Set(done).add(t.pairId);
      setDone(next);
      setSelected(null);
      if (next.size === pairs) {
        const ms = Date.now() - start.current;
        const best = readBest();
        const isBest = best === null || ms < best;
        if (isBest) {
          try {
            localStorage.setItem(BEST_KEY, String(ms));
          } catch {
            /* ohne Speicher keine Bestzeit */
          }
        }
        setFinished({ ms, best: isBest });
      }
    } else {
      setMistakes((m) => m + 1);
      setFlash([first.id, t.id]);
      setSelected(null);
      window.setTimeout(() => setFlash([]), 600);
    }
  };

  if (!tiles) {
    return (
      <StudyDone title="Zu wenig Karten" text="Zum Zuordnen brauchst du mindestens drei Karten mit kurzer Frage und kurzer Antwort." onClose={onClose} />
    );
  }

  if (finished) {
    return (
      <StudyDone
        title="Alle Paare gefunden"
        big={seconds(finished.ms)}
        text={`${mistakes === 0 ? 'Ohne Fehler' : mistakes === 1 ? '1 Fehler' : `${mistakes} Fehler`}${finished.best ? ' · neue Bestzeit!' : readBest() ? ` · Bestzeit ${seconds(readBest()!)}` : ''}`}
        onClose={onClose}
        extra={
          <button type="button" className="btn" onClick={() => setGame((g) => g + 1)}>
            Noch einmal
          </button>
        }
      />
    );
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <StudyHead label={`${done.size} von ${pairs} Paaren · ${seconds(elapsed)}`} progress={done.size / pairs} onClose={onClose} />
      <div className="match-grid" role="group" aria-label="Kacheln zum Zuordnen">
        {tiles.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`match-tile${selected === t.id ? ' picked' : ''}${done.has(t.pairId) ? ' gone' : ''}${flash.includes(t.id) ? ' wrong' : ''}`}
            data-side={t.side}
            disabled={done.has(t.pairId)}
            aria-pressed={selected === t.id}
            onClick={() => tap(t)}
          >
            {t.text}
          </button>
        ))}
      </div>
      <p className="hint">Tippe eine Frage und die passende Antwort an. Bestzeit: {readBest() ? seconds(readBest()!) : 'noch keine'}.</p>
    </div>
  );
}
