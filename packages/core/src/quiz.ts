/**
 * Lernmodi für Karteikarten wie bei Quizlet, ohne KI: Schreiben (Antwort eintippen), Multiple Choice, Zuordnen und Test
 * mit gemischten Fragen. Reine Funktionen: Auswahl der Karten, Fragen bauen, Antworten prüfen, Ergebnis rechnen.
 * Der Zufall kommt als Funktion herein (`Rng`), damit Tests feste Ergebnisse haben.
 */
import type { CardGrade, Flashcard } from './cards';
import { fold } from './notesSearch';

export type Rng = () => number;

/** Fester Zufall aus einer Zahl (mulberry32), für Tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mischt eine Kopie der Liste (Fisher-Yates). */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Erste nicht leere Zeile der Rückseite: das ist die eigentliche Antwort (bei Lückenkarten steht dahinter der ganze Satz). */
export const answerOf = (card: Pick<Flashcard, 'back'>): string =>
  card.back
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean) ?? '';

/** Zum Vergleichen: ohne Akzente, Groß- und Kleinschreibung und Satzzeichen, Rechenzeichen bleiben, Leerraum zusammengefasst. */
export const normalizeAnswer = (text: string): string =>
  fold(text)
    .replace(/[^\p{L}\p{N}=+\-*/^()<>]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Mehrere richtige Antworten, getrennt mit " / ", ";" oder "|", dazu die ganze Zeile. */
export function answerCandidates(back: string): string[] {
  const line = answerOf({ back });
  const parts = [line, ...line.split(/\s\/\s|;|\s\|\s/)].map(normalizeAnswer).filter(Boolean);
  return [...new Set(parts)];
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export type TypedResult = 'correct' | 'close' | 'wrong';

/**
 * Prüft eine getippte Antwort. "close" ist ein kleiner Tippfehler (bei kurzen Wörtern keiner, ab 4 Zeichen einer, ab 8 zwei)
 * und zählt als richtig, mit Hinweis auf die Schreibweise.
 */
export function checkTyped(input: string, back: string): { result: TypedResult; expected: string } {
  const expected = answerOf({ back });
  const typed = normalizeAnswer(input);
  if (!typed) return { result: 'wrong', expected };
  const squash = (s: string) => s.replace(/\s/g, '');
  let close = false;
  for (const candidate of answerCandidates(back)) {
    if (typed === candidate || squash(typed) === squash(candidate)) return { result: 'correct', expected };
    const allowed = candidate.length < 4 ? 0 : candidate.length < 8 ? 1 : 2;
    if (allowed > 0 && levenshtein(typed, candidate) <= allowed) close = true;
  }
  return { result: close ? 'close' : 'wrong', expected };
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Lässt sich die Antwort sinnvoll eintippen? Kurz genug, kein ganzer Satz. */
export const isTypable = (card: Pick<Flashcard, 'back'>): boolean => {
  const a = answerOf(card);
  return a.length > 0 && a.length <= 60 && words(a) <= 8;
};

/** Passt die Antwort als Auswahl auf einen Knopf? */
export const isChoiceable = (card: Pick<Flashcard, 'back'>): boolean => {
  const a = answerOf(card);
  return a.length > 0 && a.length <= 90;
};

export interface Choice {
  options: string[];
  correctIndex: number;
}

/**
 * Multiple Choice: die richtige Antwort und drei falsche aus anderen Karten (Karten desselben Fachs zuerst).
 * Gibt null zurück, wenn es keine drei verschiedenen falschen Antworten gibt.
 */
export function buildChoice(card: Flashcard, pool: readonly Flashcard[], rng: Rng = Math.random, wrong = 3): Choice | null {
  const correct = answerOf(card);
  const key = normalizeAnswer(correct);
  const seen = new Set([key]);
  const candidates = pool.filter((c) => c.id !== card.id && isChoiceable(c));
  const sameSubject = shuffle(candidates.filter((c) => c.subjectId === card.subjectId), rng);
  const others = shuffle(candidates.filter((c) => c.subjectId !== card.subjectId), rng);
  const picked: string[] = [];
  for (const c of [...sameSubject, ...others]) {
    const a = answerOf(c);
    const k = normalizeAnswer(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    picked.push(a);
    if (picked.length === wrong) break;
  }
  if (picked.length < wrong || !isChoiceable(card)) return null;
  const options = shuffle([correct, ...picked], rng);
  return { options, correctIndex: options.indexOf(correct) };
}

export interface MatchTile {
  id: string; // eindeutig je Kachel
  pairId: string; // gleiche pairId: gehört zusammen
  side: 'front' | 'back';
  text: string;
}

/** Zuordnen: Fragen und Antworten von `pairs` Karten, gemischt. Nur Karten mit kurzem Text. Null bei weniger als 3 Paaren. */
export function buildMatchSet(cards: readonly Flashcard[], rng: Rng = Math.random, pairs = 6): MatchTile[] | null {
  const usedFronts = new Set<string>();
  const usedBacks = new Set<string>();
  const eligible = shuffle(cards, rng).filter((c) => {
    const f = normalizeAnswer(c.front);
    const b = normalizeAnswer(answerOf(c));
    if (c.front.length > 90 || answerOf(c).length > 60 || !f || !b || usedFronts.has(f) || usedBacks.has(b)) return false;
    usedFronts.add(f);
    usedBacks.add(b);
    return true;
  });
  const chosen = eligible.slice(0, pairs);
  if (chosen.length < 3) return null;
  return shuffle(
    chosen.flatMap((c) => [
      { id: `${c.id}:f`, pairId: c.id, side: 'front' as const, text: c.front },
      { id: `${c.id}:b`, pairId: c.id, side: 'back' as const, text: answerOf(c) },
    ]),
    rng,
  );
}

export type TestQuestion =
  | { kind: 'choice'; cardId: string; prompt: string; options: string[]; correctIndex: number }
  | { kind: 'truefalse'; cardId: string; prompt: string; shown: string; isTrue: boolean; correct: string }
  | { kind: 'write'; cardId: string; prompt: string; expected: string; back: string };

/**
 * Test: bis zu `size` Fragen aus den Karten, gemischt aus Multiple Choice, Richtig oder Falsch und Schreiben. Welche Art geht,
 * hängt von den Karten ab (Auswahl braucht mindestens vier Karten mit verschiedenen Antworten, Schreiben kurze Antworten).
 */
export function buildTest(cards: readonly Flashcard[], size: number, rng: Rng = Math.random): TestQuestion[] {
  const picked = shuffle(cards, rng).slice(0, Math.max(0, size));
  const kinds = ['choice', 'write', 'truefalse'] as const;
  const offset = Math.floor(rng() * kinds.length);
  const out: TestQuestion[] = [];
  picked.forEach((card, i) => {
    const order = [0, 1, 2].map((k) => kinds[(i + offset + k) % kinds.length]);
    for (const kind of order) {
      if (kind === 'choice') {
        const ch = buildChoice(card, cards, rng);
        if (ch) return void out.push({ kind, cardId: card.id, prompt: card.front, options: ch.options, correctIndex: ch.correctIndex });
      } else if (kind === 'write') {
        if (isTypable(card)) return void out.push({ kind, cardId: card.id, prompt: card.front, expected: answerOf(card), back: card.back });
      } else {
        const correct = answerOf(card);
        const key = normalizeAnswer(correct);
        const other = shuffle(cards.filter((c) => c.id !== card.id && isChoiceable(c) && normalizeAnswer(answerOf(c)) !== key), rng)[0];
        if (!isChoiceable(card)) continue;
        const isTrue = !other || rng() < 0.5;
        return void out.push({ kind, cardId: card.id, prompt: card.front, shown: isTrue ? correct : answerOf(other!), isTrue, correct });
      }
    }
    // Nichts passt (zum Beispiel lange Antworten ohne Vergleichskarten): als Schreiben mit der ganzen Zeile
    out.push({ kind: 'write', cardId: card.id, prompt: card.front, expected: answerOf(card), back: card.back });
  });
  return out;
}

export interface TestScore {
  correct: number;
  total: number;
  percent: number;
}

export function scoreTest(results: readonly boolean[]): TestScore {
  const correct = results.filter(Boolean).length;
  return { correct, total: results.length, percent: results.length === 0 ? 0 : Math.round((correct / results.length) * 100) };
}

/**
 * Wie eine Antwort in der Wiederholung zählt: Schreiben richtig = gut (selbst gewusst), falsch = nochmal.
 * Auswahl richtig = schwer (nur erkannt, nicht selbst abgerufen), falsch = nochmal.
 */
export function gradeFor(mode: 'write' | 'choice', correct: boolean): CardGrade {
  if (!correct) return 'again';
  return mode === 'write' ? 'good' : 'hard';
}

/**
 * Karten für eine Übung: erst die, die heute fällig oder neu sind, dann die mit dem niedrigsten Kasten, höchstens `max`,
 * danach gemischt, damit die Reihenfolge nicht vorhersehbar ist.
 */
export function practiceSet(cards: readonly Flashcard[], today: string, max = 20, rng: Rng = Math.random): Flashcard[] {
  const weakFirst = [...cards].sort((a, b) => Number(b.due <= today) - Number(a.due <= today) || a.box - b.box || a.due.localeCompare(b.due));
  return shuffle(weakFirst.slice(0, Math.max(0, max)), rng);
}
