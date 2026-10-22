import { cardRoundMinutes, type Flashcard } from '@study/core';
import { useCallback, useRef } from 'react';
import { uid } from '../../lib/format';
import { useStore } from '../../state/store';

/**
 * Eine Kartenrunde zählt als Lernzeit (Tagesziel, Serie, Plan). Nach jeder Antwort wird die Zeit der Runde unter derselben Kennung
 * gespeichert, so geht nichts verloren, wenn man mittendrin aufhört. Gedeckelt je Antwort (cardRoundMinutes), ein liegengebliebener Tab zählt nicht.
 * Das Fach gilt nur, wenn alle Karten der Runde zu einem Fach gehören.
 * Gibt die Funktion zurück, die nach jeder beantworteten Karte aufgerufen wird.
 */
export function useRoundTime(cards: Flashcard[]): () => void {
  const { dispatch } = useStore();
  const started = useRef(Date.now());
  const id = useRef(`cards-${uid()}`);
  const answered = useRef(0);
  const logged = useRef(0);
  const subjectId = useRef<string | null>(null);
  if (subjectId.current === null && cards.length > 0) {
    const ids = new Set(cards.map((c) => c.subjectId));
    subjectId.current = ids.size === 1 ? ([...ids][0] ?? '') : '';
  }
  return useCallback(() => {
    answered.current += 1;
    const now = Date.now();
    const minutes = cardRoundMinutes(now - started.current, answered.current);
    if (minutes < 1 || minutes === logged.current) return;
    logged.current = minutes;
    dispatch({
      type: 'addSession',
      session: { id: id.current, subjectId: subjectId.current || null, startedAt: now - minutes * 60_000, endedAt: now, minutes },
    });
  }, [dispatch]);
}
