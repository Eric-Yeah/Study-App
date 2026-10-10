/**
 * Notizen durchsuchen: ohne Groß- und Kleinschreibung und ohne Akzente (ä findet a, ß findet ss),
 * mehrere Wörter müssen alle vorkommen. Treffer bekommen eine Wertung (Titel und Begriffe zählen mehr)
 * und einen Ausschnitt, in dem das Gefundene steht. Reine Funktionen ohne UI.
 */

export interface SearchableNote {
  title: string;
  teacher: string;
  quarter: string | null;
  summary: {
    thema: string;
    kernaussagen: string[];
    begriffe: string[];
    formeln: string[];
    offene_fragen: string[];
  } | null;
}

/** Kleinbuchstaben ohne Akzente. Gibt auch zurück, zu welcher Stelle im Original jedes Zeichen gehört. */
function foldWithMap(text: string): { folded: string; origin: number[] } {
  let folded = '';
  const origin: number[] = [];
  let i = 0;
  for (const ch of text) {
    const piece = ch.normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss').toLowerCase();
    for (const c of piece) {
      folded += c;
      origin.push(i);
    }
    i += ch.length;
  }
  return { folded, origin };
}

export const fold = (text: string): string => foldWithMap(text).folded;

/** Suchwörter aus der Eingabe, gefaltet, ohne Doppelte. */
export function searchTokens(query: string): string[] {
  return [...new Set(fold(query).split(/\s+/).filter(Boolean))];
}

/** Stellen im Original (Anfang inklusive, Ende exklusive), an denen ein Suchwort steht, zusammengefasst und sortiert. */
export function highlightRanges(text: string, tokens: readonly string[]): [number, number][] {
  if (tokens.length === 0) return [];
  const { folded, origin } = foldWithMap(text);
  const ranges: [number, number][] = [];
  for (const token of tokens) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(token, from);
      if (at < 0) break;
      const start = origin[at];
      const last = origin[at + token.length - 1];
      ranges.push([start, last + (text.codePointAt(last)! > 0xffff ? 2 : 1)]);
      from = at + Math.max(1, token.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

export interface SearchHit<T> {
  note: T;
  score: number;
  /** Erste Zeile, in der ein Suchwort steht (nicht im Titel), mit Angabe des Feldes. */
  snippet: { label: string; text: string } | null;
}

const WEIGHTS = { title: 5, begriffe: 4, meta: 3, kernaussagen: 2, formeln: 2, offene: 1 } as const;

/**
 * Sucht in Titel, Fach, Lehrkraft, Q-Phase und der Zusammenfassung. Leere Suche gibt eine leere Liste.
 * Sortiert nach Wertung, bei Gleichstand bleibt die Reihenfolge der Eingabe (neueste zuerst, wenn so übergeben).
 */
export function searchNotes<T extends SearchableNote>(notes: readonly T[], query: string, subjectName: (note: T) => string): SearchHit<T>[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return [];
  const hits: (SearchHit<T> & { order: number })[] = [];
  notes.forEach((note, order) => {
    const s = note.summary;
    const fields: { label: string; weight: number; lines: string[] }[] = [
      { label: 'Titel', weight: WEIGHTS.title, lines: [note.title, s?.thema ?? ''] },
      { label: 'Begriff', weight: WEIGHTS.begriffe, lines: s?.begriffe ?? [] },
      { label: 'Fach', weight: WEIGHTS.meta, lines: [subjectName(note), note.teacher, note.quarter ?? ''] },
      { label: 'Aussage', weight: WEIGHTS.kernaussagen, lines: s?.kernaussagen ?? [] },
      { label: 'Formel', weight: WEIGHTS.formeln, lines: s?.formeln ?? [] },
      { label: 'Offene Frage', weight: WEIGHTS.offene, lines: s?.offene_fragen ?? [] },
    ];
    const folded = fields.map((f) => ({ ...f, lines: f.lines.map(fold) }));
    let score = 0;
    for (const token of tokens) {
      let best = 0;
      for (const f of folded) {
        for (const line of f.lines) {
          const at = line.indexOf(token);
          if (at < 0) continue;
          const wordStart = at === 0 || /[^\p{L}\p{N}]/u.test(line[at - 1]);
          best = Math.max(best, f.weight + (wordStart ? 1 : 0) + (line === token ? 1 : 0));
        }
      }
      if (best === 0) return; // jedes Wort muss irgendwo vorkommen
      score += best;
    }
    // Ausschnitt: erste Zeile außerhalb von Titel und Fach, in der das erste Suchwort steht
    let snippet: SearchHit<T>['snippet'] = null;
    for (const f of fields.slice(1)) {
      if (f.label === 'Fach') continue;
      const line = f.lines.find((l) => tokens.some((t) => fold(l).includes(t)));
      if (line) {
        snippet = { label: f.label, text: line };
        break;
      }
    }
    hits.push({ note, score, snippet, order });
  });
  return hits.sort((a, b) => b.score - a.score || a.order - b.order).map(({ note, score, snippet }) => ({ note, score, snippet }));
}
