/**
 * Karteikarten ohne KI: Wiederholungsrhythmus nach Leitner (Kästen mit wachsenden Abständen) und Vorschläge aus
 * den Notizen (Lückenkarten: ein Fachbegriff wird im Satz verdeckt). Reine Funktionen ohne UI.
 */
import { CONFIG } from './config';
import { fold } from './notesSearch';
import { addDays } from './schedule';

export type CardGrade = 'again' | 'hard' | 'good' | 'easy';

/** 1 einfach, 2 mittel, 3 schwer, 4 sehr schwer */
export type Difficulty = 1 | 2 | 3 | 4;
export const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4];
export const DIFFICULTY_LABELS: Record<Difficulty, string> = { 1: 'Einfach', 2: 'Mittel', 3: 'Schwer', 4: 'Sehr schwer' };
export const DEFAULT_DIFFICULTY: Difficulty = 2;

/** Macht aus einer beliebigen Zahl eine gültige Stufe (gerundet, im Zweifel Mittel). */
export function toDifficulty(value: unknown): Difficulty {
  const n = typeof value === 'number' ? Math.round(value) : Number.NaN;
  return n >= 1 && n <= 4 ? (n as Difficulty) : DEFAULT_DIFFICULTY;
}

export interface Flashcard {
  id: string;
  subjectId: string | null;
  noteId: string | null; // Notiz, aus der die Karte stammt
  front: string;
  back: string;
  difficulty: Difficulty;
  box: number; // 0 = neu oder vergessen
  due: string; // YYYY-MM-DD, ab dann fällig
  reps: number; // wie oft beantwortet
  lapses: number; // wie oft vergessen
  lastReviewed: string | null;
  createdAt: string;
}

export const isNewCard = (c: Pick<Flashcard, 'reps'>): boolean => c.reps === 0;

const maxBox = (cfg = CONFIG.cards) => cfg.intervalsDays.length - 1;

/** Neue Karte: Kasten 0, heute fällig. */
export function newCard(
  init: { id: string; subjectId: string | null; noteId: string | null; front: string; back: string; difficulty?: Difficulty },
  today: string,
  createdAt = '',
): Flashcard {
  return { ...init, difficulty: init.difficulty ?? DEFAULT_DIFFICULTY, box: 0, due: today, reps: 0, lapses: 0, lastReviewed: null, createdAt };
}

/** Kasten und Fälligkeit nach einer Antwort. Nochmal: zurück in Kasten 0 und heute noch einmal. */
export function reviewCard(card: Flashcard, grade: CardGrade, today: string, cfg = CONFIG.cards): Flashcard {
  const top = maxBox(cfg);
  const factor = cfg.difficultyFactor[toDifficulty(card.difficulty) - 1];
  const scaled = (days: number) => Math.max(1, Math.round(days * factor)); // einfache Karten später, schwere früher
  let box = card.box;
  let wait: number;
  switch (grade) {
    case 'again':
      box = 0;
      wait = 0;
      break;
    case 'hard':
      wait = scaled(cfg.intervalsDays[box] / 2);
      break;
    case 'good':
      box = Math.min(top, box + 1);
      wait = scaled(cfg.intervalsDays[box]);
      break;
    case 'easy':
      box = Math.min(top, box + 2);
      wait = scaled(cfg.intervalsDays[box]);
      break;
  }
  return {
    ...card,
    box,
    due: addDays(today, wait),
    reps: card.reps + 1,
    lapses: card.lapses + (grade === 'again' ? 1 : 0),
    lastReviewed: today,
  };
}

/** In wie vielen Tagen käme die Karte nach dieser Antwort wieder? (0 = heute noch einmal) */
export function daysAfter(card: Flashcard, grade: CardGrade, today: string, cfg = CONFIG.cards): number {
  const next = reviewCard(card, grade, today, cfg);
  return Math.round((Date.parse(next.due) - Date.parse(today)) / 86_400_000);
}

export const isDue = (c: Flashcard, today: string): boolean => c.due <= today;

/**
 * Lernrunde: erst fällige Wiederholungen (am längsten überfällige zuerst, bei Gleichstand niedriger Kasten zuerst),
 * dann neue Karten bis maxNew, insgesamt höchstens max. Nur Karten des Fachs, wenn eines gewählt ist.
 */
export function buildQueue(
  cards: readonly Flashcard[],
  today: string,
  opts: { subjectId?: string | null; difficulty?: Difficulty | null; maxNew?: number; max?: number } = {},
  cfg = CONFIG.cards,
): Flashcard[] {
  const pool = cards.filter(
    (c) =>
      isDue(c, today) &&
      (opts.subjectId === undefined || opts.subjectId === null || c.subjectId === opts.subjectId) &&
      (opts.difficulty === undefined || opts.difficulty === null || c.difficulty === opts.difficulty),
  );
  const byDue = (a: Flashcard, b: Flashcard) => a.due.localeCompare(b.due) || a.box - b.box || a.createdAt.localeCompare(b.createdAt);
  const reviews = pool.filter((c) => !isNewCard(c)).sort(byDue);
  const fresh = pool.filter(isNewCard).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, opts.maxNew ?? cfg.maxNewPerSession);
  return [...reviews, ...fresh].slice(0, opts.max ?? cfg.maxPerSession);
}

export interface CardStats {
  total: number;
  due: number; // heute fällig, ohne neue
  fresh: number; // neu, noch nie beantwortet
  known: number; // Kasten 4 und höher: sitzt
}

export function cardStats(cards: readonly Flashcard[], today: string, subjectId?: string | null): CardStats {
  const pool = subjectId == null ? cards : cards.filter((c) => c.subjectId === subjectId);
  return {
    total: pool.length,
    due: pool.filter((c) => !isNewCard(c) && isDue(c, today)).length,
    fresh: pool.filter(isNewCard).length,
    known: pool.filter((c) => c.box >= 4).length,
  };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface CardSuggestion {
  front: string;
  back: string;
  difficulty: Difficulty;
}

/**
 * Vorschläge aus einer Notiz, ohne KI:
 * - Lückenkarte: eine Kernaussage, in der ein Begriff der Notiz als ganzes Wort vorkommt, mit verdecktem Begriff
 * - Formelkarte: "Welche Formeln gehören zu <Thema>?"
 * `existingFronts` sind schon vorhandene Vorderseiten, sie werden nicht noch einmal vorgeschlagen.
 */
export function suggestCards(
  note: { title: string; summary: { thema: string; kernaussagen: string[]; begriffe: string[]; formeln: string[] } | null },
  existingFronts: Iterable<string> = [],
  cfg = CONFIG.cards,
): CardSuggestion[] {
  const s = note.summary;
  if (!s) return [];
  const seen = new Set([...existingFronts].map(fold));
  const out: CardSuggestion[] = [];
  const add = (front: string, back: string, difficulty: Difficulty) => {
    const key = fold(front);
    if (seen.has(key) || out.length >= cfg.maxSuggestionsPerNote) return;
    seen.add(key);
    out.push({ front, back, difficulty });
  };

  const terms = [...new Set(s.begriffe.map((t) => t.trim()).filter((t) => t.length >= cfg.minTermChars))].sort((a, b) => b.length - a.length);
  for (const sentence of s.kernaussagen) {
    const text = sentence.trim();
    if (text.length < cfg.minSentenceChars) continue;
    for (const term of terms) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'giu');
      if (!re.test(text)) continue;
      const blanked = text.replace(re, '_____');
      if (blanked.replace(/_____/g, '').trim().length < 15 || term.length > text.length * 0.6) continue;
      add(blanked, `${term}\n\n${text}`, 2); // Lückenkarten: Mittel
      break; // eine Karte je Satz
    }
  }

  const topic = (s.thema || note.title).trim();
  const formulas = s.formeln.map((f) => f.trim()).filter(Boolean);
  if (formulas.length > 0 && topic.length >= cfg.minTermChars) add(`Welche Formeln gehören zu „${topic}“?`, formulas.join('\n'), 3); // Formelkarten: Schwer
  return out;
}
