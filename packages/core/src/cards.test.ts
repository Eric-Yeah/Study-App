import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { buildQueue, cardStats, DEFAULT_DIFFICULTY, DIFFICULTY_LABELS, daysAfter, isDue, newCard, reviewCard, suggestCards, toDifficulty, type Flashcard } from './cards';

const T = '2026-10-07';
const card = (o: Partial<Flashcard> = {}): Flashcard => ({ ...newCard({ id: 'c', subjectId: 'ph', noteId: null, front: 'F', back: 'B' }, T, '2026-10-01T00:00'), ...o });
const I = CONFIG.cards.intervalsDays;

describe('reviewCard', () => {
  it('gut: ein Kasten höher, nächster Abstand aus der Tabelle', () => {
    const r = reviewCard(card(), 'good', T);
    expect(r.box).toBe(1);
    expect(r.due).toBe('2026-10-08'); // I[1] = 1 Tag
    expect(r.reps).toBe(1);
    expect(r.lastReviewed).toBe(T);
    const r2 = reviewCard(r, 'good', '2026-10-08');
    expect(r2.box).toBe(2);
    expect(r2.due).toBe('2026-10-11'); // 3 Tage
  });

  it('leicht: zwei Kästen, nie über den obersten hinaus', () => {
    expect(reviewCard(card(), 'easy', T).box).toBe(2);
    expect(reviewCard(card({ box: I.length - 2 }), 'easy', T).box).toBe(I.length - 1);
    expect(reviewCard(card({ box: I.length - 1 }), 'good', T).box).toBe(I.length - 1);
  });

  it('nochmal: zurück in Kasten 0, heute noch einmal, Fehlversuch gezählt', () => {
    const r = reviewCard(card({ box: 4, reps: 6 }), 'again', T);
    expect(r.box).toBe(0);
    expect(r.due).toBe(T);
    expect(r.lapses).toBe(1);
    expect(r.reps).toBe(7);
    expect(isDue(r, T)).toBe(true);
  });

  it('schwer: bleibt im Kasten, kommt nach dem halben Abstand, mindestens 1 Tag', () => {
    const r = reviewCard(card({ box: 3, reps: 3 }), 'hard', T);
    expect(r.box).toBe(3);
    expect(r.due).toBe('2026-10-11'); // I[3] = 7, halbe = 4 (gerundet 3,5 → 4)
    expect(reviewCard(card({ box: 0 }), 'hard', T).due).toBe('2026-10-08');
    expect(reviewCard(card({ box: 1, reps: 1 }), 'hard', T).due).toBe('2026-10-08');
  });

  it('ändert die Karte nicht und überspringt Monatsgrenzen richtig', () => {
    const c = card({ box: 5, reps: 5 });
    const r = reviewCard(c, 'good', '2026-10-28');
    expect(c.box).toBe(5);
    expect(r.box).toBe(6);
    expect(r.due).toBe('2026-12-27'); // 60 Tage nach dem 28. Oktober
  });

  it('daysAfter nennt den Abstand für die Knöpfe', () => {
    expect(daysAfter(card(), 'again', T)).toBe(0);
    expect(daysAfter(card(), 'good', T)).toBe(1);
    expect(daysAfter(card({ box: 2, reps: 2 }), 'good', T)).toBe(7);
  });

  it('der Abstand wächst mit jedem Kasten', () => {
    for (let i = 1; i < I.length; i++) expect(I[i]).toBeGreaterThan(I[i - 1]);
  });
});

describe('buildQueue', () => {
  it('erst Wiederholungen (überfällige zuerst), dann neue, nur fällige', () => {
    const cards = [
      card({ id: 'neu1', reps: 0, createdAt: '2026-10-02T00:00' }),
      card({ id: 'alt', reps: 3, box: 2, due: '2026-10-01' }),
      card({ id: 'heute', reps: 3, box: 1, due: T }),
      card({ id: 'spaeter', reps: 3, box: 1, due: '2026-10-09' }),
    ];
    expect(buildQueue(cards, T).map((c) => c.id)).toEqual(['alt', 'heute', 'neu1']);
  });

  it('begrenzt neue Karten und die Runde', () => {
    const cards = Array.from({ length: 20 }, (_, i) => card({ id: `n${i}`, createdAt: `2026-10-01T00:${String(i).padStart(2, '0')}` }));
    expect(buildQueue(cards, T, { maxNew: 3 })).toHaveLength(3);
    expect(buildQueue(cards, T, { maxNew: 20, max: 5 })).toHaveLength(5);
    expect(buildQueue(cards, T)).toHaveLength(CONFIG.cards.maxNewPerSession);
    expect(buildQueue(cards, T, { maxNew: 3 }).map((c) => c.id)).toEqual(['n0', 'n1', 'n2']); // älteste neue zuerst
  });

  it('nach Fach filtern', () => {
    const cards = [card({ id: 'a', subjectId: 'ph' }), card({ id: 'b', subjectId: 'm' }), card({ id: 'c', subjectId: null })];
    expect(buildQueue(cards, T, { subjectId: 'm' }).map((c) => c.id)).toEqual(['b']);
    expect(buildQueue(cards, T, { subjectId: null })).toHaveLength(3);
    expect(buildQueue(cards, T)).toHaveLength(3);
    expect(buildQueue([], T)).toEqual([]);
  });
});

describe('cardStats', () => {
  it('zählt fällige, neue und gelernte Karten', () => {
    const cards = [
      card({ id: '1' }), // neu
      card({ id: '2', reps: 2, box: 2, due: T }), // fällig
      card({ id: '3', reps: 2, box: 2, due: '2026-10-20' }), // nicht fällig
      card({ id: '4', reps: 5, box: 4, due: '2026-11-01' }), // sitzt
      card({ id: '5', reps: 1, box: 1, due: '2026-10-01', subjectId: 'm' }), // fällig, anderes Fach
    ];
    expect(cardStats(cards, T)).toEqual({ total: 5, due: 2, fresh: 1, known: 1 });
    expect(cardStats(cards, T, 'm')).toEqual({ total: 1, due: 1, fresh: 0, known: 0 });
    expect(cardStats([], T)).toEqual({ total: 0, due: 0, fresh: 0, known: 0 });
  });
});

describe('suggestCards', () => {
  const note = (s: Partial<{ thema: string; kernaussagen: string[]; begriffe: string[]; formeln: string[] }>, title = 'Optik') => ({
    title,
    summary: { thema: '', kernaussagen: [], begriffe: [], formeln: [], ...s },
  });

  it('verdeckt den Begriff im Satz', () => {
    const r = suggestCards(note({ kernaussagen: ['Die Brechung ändert die Richtung des Lichts an der Grenzfläche'], begriffe: ['Brechung'] }));
    expect(r).toEqual([{ front: 'Die _____ ändert die Richtung des Lichts an der Grenzfläche', back: 'Brechung\n\nDie Brechung ändert die Richtung des Lichts an der Grenzfläche', difficulty: 2 }]);
  });

  it('nimmt den längsten passenden Begriff, nur ganze Wörter, eine Karte je Satz', () => {
    const sentence = 'Der Brechungsindex gibt das Verhältnis der Lichtgeschwindigkeiten an';
    const r = suggestCards(note({ kernaussagen: [sentence], begriffe: ['Brechung', 'Brechungsindex'] }));
    expect(r).toHaveLength(1);
    expect(r[0].back.startsWith('Brechungsindex')).toBe(true);
    // "Brechung" allein steckt nur in einem längeren Wort: keine Karte
    expect(suggestCards(note({ kernaussagen: [sentence], begriffe: ['Brechung'] }))).toEqual([]);
  });

  it('ohne Groß- und Kleinschreibung gefunden, alle Vorkommen verdeckt', () => {
    const r = suggestCards(note({ kernaussagen: ['Licht ist Licht, aber Schall braucht ein Medium zum Ausbreiten'], begriffe: ['licht'] }));
    expect(r[0].front).toBe('_____ ist _____, aber Schall braucht ein Medium zum Ausbreiten');
  });

  it('überspringt zu kurze Sätze, zu kurze Begriffe und Sätze, die fast nur aus dem Begriff bestehen', () => {
    expect(suggestCards(note({ kernaussagen: ['Kurz und Licht'], begriffe: ['Licht'] }))).toEqual([]);
    expect(suggestCards(note({ kernaussagen: ['Eine längere Aussage über die Welle im Raum'], begriffe: ['Ei'] }))).toEqual([]);
    expect(suggestCards(note({ kernaussagen: ['Elektromagnetische Wellenausbreitung'], begriffe: ['Elektromagnetische Wellenausbreitung'] }))).toEqual([]);
  });

  it('Formelkarte mit Thema oder Titel', () => {
    expect(suggestCards(note({ thema: 'Brechung', formeln: ['n1 sin a1 = n2 sin a2', 'n = c / v'] }))).toEqual([
      { front: 'Welche Formeln gehören zu „Brechung“?', back: 'n1 sin a1 = n2 sin a2\nn = c / v', difficulty: 3 },
    ]);
    expect(suggestCards(note({ formeln: ['a = b'] }, 'Mechanik'))[0].front).toContain('Mechanik');
    expect(suggestCards(note({ formeln: [] }))).toEqual([]);
  });

  it('schlägt Vorhandenes nicht noch einmal vor und begrenzt die Zahl', () => {
    const n = note({ kernaussagen: ['Die Brechung ändert die Richtung des Lichts an der Grenzfläche'], begriffe: ['Brechung'] });
    expect(suggestCards(n, ['DIE _____ ändert die Richtung des Lichts an der Grenzfläche'])).toEqual([]); // Schreibweise egal
    const many = note({
      kernaussagen: Array.from({ length: 30 }, (_, i) => `Satz Nummer ${i} über das Thema Wellen und mehr Text dazu`),
      begriffe: ['Wellen'],
    });
    expect(suggestCards(many).length).toBeLessThanOrEqual(CONFIG.cards.maxSuggestionsPerNote);
  });

  it('Notiz ohne Zusammenfassung', () => {
    expect(suggestCards({ title: 'x', summary: null })).toEqual([]);
  });
});

describe('Schwierigkeit', () => {
  it('Stufen und Namen', () => {
    expect(DIFFICULTY_LABELS).toEqual({ 1: 'Einfach', 2: 'Mittel', 3: 'Schwer', 4: 'Sehr schwer' });
    expect(DEFAULT_DIFFICULTY).toBe(2);
    expect(card().difficulty).toBe(2);
    expect(newCard({ id: 'x', subjectId: null, noteId: null, front: 'f', back: 'b', difficulty: 4 }, T).difficulty).toBe(4);
  });

  it('toDifficulty: gültige Stufe, im Zweifel Mittel', () => {
    expect(toDifficulty(1)).toBe(1);
    expect(toDifficulty(4)).toBe(4);
    expect(toDifficulty(3.4)).toBe(3);
    for (const bad of [0, 5, -1, NaN, null, undefined, '3', {}]) expect(toDifficulty(bad), String(bad)).toBe(2);
  });

  it('einfache Karten kommen später wieder, schwere früher, Mittel bleibt wie bisher', () => {
    const wait = (d: 1 | 2 | 3 | 4, box: number) => daysAfter(card({ difficulty: d, box, reps: box }), 'good', T);
    // Kasten 2 nach "gut": Kasten 3 mit 7 Tagen
    expect(wait(2, 2)).toBe(7);
    expect(wait(1, 2)).toBeGreaterThan(wait(2, 2));
    expect(wait(3, 2)).toBeLessThan(wait(2, 2));
    expect(wait(4, 2)).toBeLessThan(wait(3, 2));
    expect([wait(1, 2), wait(2, 2), wait(3, 2), wait(4, 2)]).toEqual([11, 7, 5, 4]);
  });

  it('nie unter einem Tag, "nochmal" bleibt heute, auch bei Sehr schwer und Einfach', () => {
    for (const d of [1, 2, 3, 4] as const) {
      expect(daysAfter(card({ difficulty: d }), 'again', T)).toBe(0);
      expect(daysAfter(card({ difficulty: d, box: 0 }), 'hard', T)).toBeGreaterThanOrEqual(1);
      expect(daysAfter(card({ difficulty: d }), 'good', T)).toBeGreaterThanOrEqual(1);
    }
  });

  it('die Stufe bleibt bei der Antwort erhalten, ungültige Werte rechnen wie Mittel', () => {
    expect(reviewCard(card({ difficulty: 4 }), 'good', T).difficulty).toBe(4);
    expect(daysAfter(card({ difficulty: 9 as never, box: 2, reps: 2 }), 'good', T)).toBe(7);
  });

  it('buildQueue nach Schwierigkeit filtern', () => {
    const cards = [card({ id: 'a', difficulty: 1 }), card({ id: 'b', difficulty: 3 }), card({ id: 'c', difficulty: 3 })];
    expect(buildQueue(cards, T, { difficulty: 3 }).map((c) => c.id).sort()).toEqual(['b', 'c']);
    expect(buildQueue(cards, T, { difficulty: null })).toHaveLength(3);
    expect(buildQueue(cards, T, { difficulty: 4 })).toEqual([]);
  });

  it('Vorschläge: Lückenkarten Mittel, Formelkarten Schwer', () => {
    const r = suggestCards({
      title: 'Optik',
      summary: { thema: 'Brechung', kernaussagen: ['Die Brechung ändert die Richtung des Lichts an der Grenzfläche'], begriffe: ['Brechung'], formeln: ['n = c / v'] },
    });
    expect(r.map((c) => c.difficulty)).toEqual([2, 3]);
  });
});
