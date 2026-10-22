import { describe, expect, it } from 'vitest';
import { newCard, type Flashcard } from './cards';
import {
  answerCandidates,
  answerOf,
  buildChoice,
  buildMatchSet,
  buildTest,
  checkTyped,
  gradeFor,
  isChoiceable,
  isTypable,
  levenshtein,
  normalizeAnswer,
  practiceSet,
  scoreTest,
  seededRng,
  shuffle,
} from './quiz';

const T = '2026-10-07';
const card = (id: string, front: string, back: string, subjectId: string | null = 'ph'): Flashcard => newCard({ id, subjectId, noteId: null, front, back }, T);
const deck = [
  card('1', 'Einheit der Frequenz?', 'Hertz'),
  card('2', 'Einheit der Kraft?', 'Newton'),
  card('3', 'Einheit der Energie?', 'Joule'),
  card('4', 'Einheit des Drucks?', 'Pascal'),
  card('5', 'Einheit der Leistung?', 'Watt'),
  card('6', 'Hauptstadt von Hessen?', 'Wiesbaden', 'd'),
];

describe('shuffle und seededRng', () => {
  it('gleicher Startwert gibt gleiche Reihenfolge, die Eingabe bleibt unverändert, nichts geht verloren', () => {
    const list = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(list, seededRng(7))).toEqual(shuffle(list, seededRng(7)));
    expect(list).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffle(list, seededRng(3))].sort()).toEqual(list);
    expect(shuffle(list, seededRng(1))).not.toEqual(shuffle(list, seededRng(2)));
    expect(shuffle([], seededRng(1))).toEqual([]);
  });
});

describe('Antworten prüfen', () => {
  it('answerOf nimmt die erste Zeile, auch bei Lückenkarten mit ganzem Satz dahinter', () => {
    expect(answerOf({ back: 'Brechung\n\nDie Brechung ändert die Richtung' })).toBe('Brechung');
    expect(answerOf({ back: '\n  zweite  \nx' })).toBe('zweite');
    expect(answerOf({ back: '' })).toBe('');
  });

  it('normalizeAnswer: ohne Akzente, Groß- und Kleinschreibung und Satzzeichen, Rechenzeichen bleiben', () => {
    expect(normalizeAnswer('  Größe!  ')).toBe('grosse');
    expect(normalizeAnswer('Dr. Müller, bitte')).toBe('dr muller bitte');
    expect(normalizeAnswer('n = c / v')).toBe('n = c / v');
    // Dezimalzeichen: 1,5 ist nicht 15, Punkt und Komma gelten gleich
    expect(normalizeAnswer('1,5')).toBe('1,5');
    expect(normalizeAnswer('1.5')).toBe('1,5');
    expect(normalizeAnswer('Satz. 3,14!')).toBe('satz 3,14');
  });

  it('mehrere richtige Antworten', () => {
    expect(answerCandidates('run / sprint')).toEqual(['run / sprint', 'run', 'sprint']);
    expect(answerCandidates('Hertz; Hz')).toEqual(['hertz hz', 'hertz', 'hz']);
  });

  it('levenshtein', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('checkTyped: richtig, fast richtig (Tippfehler) und falsch', () => {
    expect(checkTyped('hertz', 'Hertz').result).toBe('correct');
    expect(checkTyped('  HERTZ ', 'Hertz').result).toBe('correct');
    expect(checkTyped('Hertz.', 'Hertz').result).toBe('correct');
    expect(checkTyped('Hertzz', 'Hertz').result).toBe('close');
    // Zahlen: eine falsche Ziffer ist kein Tippfehler
    expect(checkTyped('13,5', '12,5').result).toBe('wrong');
    expect(checkTyped('125', '12,5').result).toBe('wrong');
    expect(checkTyped('12.5', '12,5').result).toBe('correct');
    expect(checkTyped('Herz', 'Hertz').result).toBe('close');
    expect(checkTyped('Newton', 'Hertz').result).toBe('wrong');
    expect(checkTyped('', 'Hertz').result).toBe('wrong');
    expect(checkTyped('   ', 'Hertz').result).toBe('wrong');
    expect(checkTyped('Hertz', 'Hertz\n\nganzer Satz').expected).toBe('Hertz');
  });

  it('kurze Wörter ohne Toleranz, damit "Ja" nicht für "Na" durchgeht', () => {
    expect(checkTyped('na', 'ja').result).toBe('wrong');
    expect(checkTyped('cat', 'car').result).toBe('wrong');
  });

  it('Alternativen, Leerzeichen in Formeln und Zahlen', () => {
    expect(checkTyped('sprint', 'run / sprint').result).toBe('correct');
    expect(checkTyped('n=c/v', 'n = c / v').result).toBe('correct');
    expect(checkTyped('42', '42').result).toBe('correct');
    expect(checkTyped('43', '42').result).toBe('wrong');
  });

  it('isTypable und isChoiceable', () => {
    expect(isTypable({ back: 'Hertz' })).toBe(true);
    expect(isTypable({ back: 'Ein ganzer langer Satz mit sehr vielen Wörtern darin, der nicht eingetippt werden soll' })).toBe(false);
    expect(isTypable({ back: '' })).toBe(false);
    expect(isChoiceable({ back: 'x'.repeat(90) })).toBe(true);
    expect(isChoiceable({ back: 'x'.repeat(91) })).toBe(false);
  });

  it('gradeFor: Schreiben zählt mehr als Auswahl, falsch ist immer nochmal', () => {
    expect(gradeFor('write', true)).toBe('good');
    expect(gradeFor('choice', true)).toBe('hard');
    expect(gradeFor('write', false)).toBe('again');
    expect(gradeFor('choice', false)).toBe('again');
  });
});

describe('buildChoice', () => {
  it('eine richtige und drei falsche Antworten, gemischt, richtige Stelle stimmt', () => {
    const c = buildChoice(deck[0], deck, seededRng(1))!;
    expect(c.options).toHaveLength(4);
    expect(new Set(c.options).size).toBe(4);
    expect(c.options[c.correctIndex]).toBe('Hertz');
  });

  it('falsche Antworten kommen zuerst aus demselben Fach', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(buildChoice(deck[0], deck, seededRng(seed))!.options).not.toContain('Wiesbaden');
    }
  });

  it('mit zu wenig anderen Antworten gibt es keine Auswahl', () => {
    expect(buildChoice(deck[0], deck.slice(0, 3))).toBeNull();
    expect(buildChoice(deck[0], [deck[0]])).toBeNull();
  });

  it('gleiche Antworten zählen nur einmal, auch in anderer Schreibweise', () => {
    const dup = [card('a', 'q1', 'Hertz'), card('b', 'q2', 'hertz'), card('c', 'q3', 'Newton'), card('d', 'q4', 'Joule'), card('e', 'q5', 'Watt')];
    const c = buildChoice(dup[0], dup, seededRng(2))!;
    expect(c.options.map((o) => o.toLowerCase()).filter((o) => o === 'hertz')).toHaveLength(1);
  });

  it('zu lange Antworten gehen nicht als Auswahl', () => {
    const long = card('l', 'q', 'x'.repeat(120));
    expect(buildChoice(long, [long, ...deck])).toBeNull();
  });
});

describe('buildMatchSet', () => {
  it('Frage und Antwort je Paar, gemischt, höchstens so viele Paare wie gewünscht', () => {
    const tiles = buildMatchSet(deck, seededRng(3), 4)!;
    expect(tiles).toHaveLength(8);
    const ids = new Set(tiles.map((t) => t.pairId));
    expect(ids.size).toBe(4);
    for (const id of ids) expect(tiles.filter((t) => t.pairId === id).map((t) => t.side).sort()).toEqual(['back', 'front']);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(8);
  });

  it('lange Texte und doppelte Antworten fallen heraus, unter drei Paaren gibt es nichts', () => {
    expect(buildMatchSet(deck.slice(0, 2))).toBeNull();
    const cards = [card('a', 'f1', 'Gleich'), card('b', 'f2', 'gleich'), card('c', 'f3', 'Anders'), card('d', 'f4', 'x'.repeat(100)), card('e', 'f5', 'Drei')];
    const tiles = buildMatchSet(cards, seededRng(1), 6)!;
    expect(new Set(tiles.map((t) => t.pairId)).size).toBe(3);
    expect(buildMatchSet([])).toBeNull();
  });
});

describe('buildTest', () => {
  it('so viele Fragen wie gewünscht (höchstens so viele wie Karten), jede Karte einmal', () => {
    const t = buildTest(deck, 4, seededRng(5));
    expect(t).toHaveLength(4);
    expect(new Set(t.map((q) => q.cardId)).size).toBe(4);
    expect(buildTest(deck, 50, seededRng(5))).toHaveLength(deck.length);
    expect(buildTest([], 5)).toEqual([]);
  });

  it('mischt die Fragearten, wenn die Karten es erlauben', () => {
    const kinds = new Set(buildTest(deck, 6, seededRng(11)).map((q) => q.kind));
    expect(kinds.size).toBe(3);
  });

  it('Auswahl-Fragen haben die richtige Antwort an der angegebenen Stelle', () => {
    for (const q of buildTest(deck, 6, seededRng(2))) {
      if (q.kind === 'choice') expect(q.options[q.correctIndex]).toBe(answerOf(deck.find((c) => c.id === q.cardId)!));
    }
  });

  it('Richtig oder Falsch: bei "falsch" steht eine andere Antwort da, bei "richtig" die echte', () => {
    for (let seed = 1; seed <= 15; seed++) {
      for (const q of buildTest(deck, 6, seededRng(seed))) {
        if (q.kind !== 'truefalse') continue;
        const real = answerOf(deck.find((c) => c.id === q.cardId)!);
        if (q.isTrue) expect(q.shown).toBe(real);
        else expect(q.shown).not.toBe(real);
        expect(q.correct).toBe(real);
      }
    }
  });

  it('mit wenigen Karten bleibt es brauchbar: Schreiben und Richtig oder Falsch statt Auswahl', () => {
    const three = deck.slice(0, 3);
    const t = buildTest(three, 3, seededRng(4));
    expect(t).toHaveLength(3);
    expect(t.some((q) => q.kind === 'choice')).toBe(false);
  });

  it('lange Antworten werden nie zum Tippen verlangt, wenn es eine Alternative gibt, und es gibt immer eine Frage je Karte', () => {
    const longCards = [card('x', 'Frage?', 'Ein langer Satz als Antwort, der weit über sechzig Zeichen hinausgeht und viele Wörter hat'), ...deck];
    const t = buildTest(longCards, longCards.length, seededRng(9));
    expect(t).toHaveLength(longCards.length);
    const q = t.find((x) => x.cardId === 'x')!;
    expect(q.kind).not.toBe('write');
  });

  it('einzelne Karte allein: Schreiben', () => {
    const t = buildTest([deck[0]], 1, seededRng(1));
    expect(t).toHaveLength(1);
    expect(['write', 'truefalse']).toContain(t[0].kind);
  });
});

describe('scoreTest', () => {
  it('Anzahl und Prozent', () => {
    expect(scoreTest([true, true, false, true])).toEqual({ correct: 3, total: 4, percent: 75 });
    expect(scoreTest([])).toEqual({ correct: 0, total: 0, percent: 0 });
    expect(scoreTest([false, false])).toEqual({ correct: 0, total: 2, percent: 0 });
    expect(scoreTest([true, false, false]).percent).toBe(33);
  });
});

describe('practiceSet', () => {
  it('nimmt zuerst fällige und schwache Karten, begrenzt und mischt', () => {
    const cards = [
      { ...card('fertig', 'a', 'a'), box: 5, due: '2026-12-01', reps: 5 },
      { ...card('faellig', 'b', 'b'), box: 2, due: '2026-10-01', reps: 2 },
      { ...card('neu', 'c', 'c'), box: 0, due: T, reps: 0 },
      { ...card('spaeter', 'd', 'd'), box: 1, due: '2026-10-20', reps: 1 },
    ];
    const two = practiceSet(cards, T, 2, seededRng(1)).map((c) => c.id).sort();
    expect(two).toEqual(['faellig', 'neu']);
    expect(practiceSet(cards, T, 10, seededRng(1))).toHaveLength(4);
    expect(practiceSet(cards, T, 0)).toEqual([]);
    expect(practiceSet([], T)).toEqual([]);
  });
});
