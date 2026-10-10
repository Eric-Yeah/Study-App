import { describe, expect, it } from 'vitest';
import { fold, highlightRanges, searchNotes, searchTokens, type SearchableNote } from './notesSearch';

const note = (o: Partial<SearchableNote> & { id?: string } = {}): SearchableNote & { id: string } => ({
  id: o.id ?? 'n',
  title: o.title ?? '',
  teacher: o.teacher ?? '',
  quarter: o.quarter ?? null,
  summary: o.summary === undefined ? { thema: '', kernaussagen: [], begriffe: [], formeln: [], offene_fragen: [] } : o.summary,
});
const withSummary = (id: string, s: Partial<NonNullable<SearchableNote['summary']>>, extra: Partial<SearchableNote> = {}) =>
  note({ id, ...extra, summary: { thema: '', kernaussagen: [], begriffe: [], formeln: [], offene_fragen: [], ...s } });
const name = () => 'Physik';

describe('fold und searchTokens', () => {
  it('ohne Groß- und Kleinschreibung und ohne Akzente', () => {
    expect(fold('Größe ÄÖÜ ß É')).toBe('grosse aou ss e');
    expect(searchTokens('  Brechung   LICHT brechung ')).toEqual(['brechung', 'licht']);
    expect(searchTokens('   ')).toEqual([]);
  });
});

describe('highlightRanges', () => {
  it('findet Stellen im Original, auch mit Umlauten und ß', () => {
    expect(highlightRanges('Die Größe der Brechung', ['grosse'])).toEqual([[4, 9]]);
    expect(highlightRanges('Brechung und brechung', ['brechung'])).toEqual([[0, 8], [13, 21]]);
  });
  it('fasst überlappende Treffer zusammen und kommt mit leerer Eingabe klar', () => {
    expect(highlightRanges('abcdef', ['abc', 'cde'])).toEqual([[0, 5]]);
    expect(highlightRanges('abc', [])).toEqual([]);
    expect(highlightRanges('', ['a'])).toEqual([]);
    expect(highlightRanges('abc', ['x'])).toEqual([]);
  });
});

describe('searchNotes', () => {
  it('leere Suche gibt nichts', () => {
    expect(searchNotes([note({ title: 'Optik' })], '  ', name)).toEqual([]);
  });

  it('findet in Titel, Begriffen, Aussagen, Formeln und offenen Fragen', () => {
    const notes = [
      note({ id: 'titel', title: 'Wellenoptik' }),
      withSummary('begriff', { begriffe: ['Interferenz'] }),
      withSummary('aussage', { kernaussagen: ['Licht zeigt Beugung am Spalt'] }),
      withSummary('formel', { formeln: ['n = c / v'] }),
      withSummary('frage', { offene_fragen: ['Aufgabe 3: Gitterkonstante bestimmen'] }),
    ];
    const ids = (q: string) => searchNotes(notes, q, name).map((h) => h.note.id);
    expect(ids('wellenoptik')).toEqual(['titel']);
    expect(ids('interferenz')).toEqual(['begriff']);
    expect(ids('beugung')).toEqual(['aussage']);
    expect(ids('c / v')).toEqual(['formel']);
    expect(ids('gitterkonstante')).toEqual(['frage']);
  });

  it('mehrere Wörter müssen alle vorkommen, auch in verschiedenen Feldern', () => {
    const notes = [withSummary('a', { begriffe: ['Brechung'], kernaussagen: ['Licht wird gebrochen'] }), withSummary('b', { begriffe: ['Brechung'] })];
    expect(searchNotes(notes, 'brechung licht', name).map((h) => h.note.id)).toEqual(['a']);
    expect(searchNotes(notes, 'brechung', name).map((h) => h.note.id).sort()).toEqual(['a', 'b']);
    expect(searchNotes(notes, 'brechung xyz', name)).toEqual([]);
  });

  it('findet nach Fach, Lehrkraft und Q-Phase', () => {
    const n = note({ id: 'm', teacher: 'Müller', quarter: 'Q2' });
    expect(searchNotes([n], 'physik', name)).toHaveLength(1);
    expect(searchNotes([n], 'muller', name)).toHaveLength(1);
    expect(searchNotes([n], 'q2', name)).toHaveLength(1);
    expect(searchNotes([n], 'q3', name)).toHaveLength(0);
  });

  it('Titel zählt mehr als Aussage, Wortanfang mehr als Mitte, bei Gleichstand bleibt die Reihenfolge', () => {
    const notes = [
      withSummary('aussage', { kernaussagen: ['Die Welle ist transversal'] }),
      note({ id: 'titel', title: 'Welle' }),
      withSummary('mitte', { kernaussagen: ['Schallwellen'] }),
    ];
    expect(searchNotes(notes, 'welle', name).map((h) => h.note.id)).toEqual(['titel', 'aussage', 'mitte']); // Wortanfang vor Wortmitte
    expect(searchNotes(notes, 'wellen', name).map((h) => h.note.id)).toEqual(['mitte']);
    const same = [withSummary('x', { begriffe: ['Welle'] }), withSummary('y', { begriffe: ['Welle'] })];
    expect(searchNotes(same, 'welle', name).map((h) => h.note.id)).toEqual(['x', 'y']);
  });

  it('liefert einen Ausschnitt mit Angabe des Feldes', () => {
    const n = withSummary('a', { begriffe: ['Brechungsindex'], kernaussagen: ['Der Brechungsindex ist c/v'] });
    expect(searchNotes([n], 'brechungsindex', name)[0].snippet).toEqual({ label: 'Begriff', text: 'Brechungsindex' });
    const m = withSummary('b', { kernaussagen: ['Licht wird gebrochen'] });
    expect(searchNotes([m], 'gebrochen', name)[0].snippet).toEqual({ label: 'Aussage', text: 'Licht wird gebrochen' });
    expect(searchNotes([note({ id: 't', title: 'Optik' })], 'optik', name)[0].snippet).toBeNull();
  });

  it('Notizen ohne Zusammenfassung sind über Titel und Fach auffindbar', () => {
    const n = note({ id: 'ohne', title: 'Notiz', summary: null });
    expect(searchNotes([n], 'notiz', name)).toHaveLength(1);
    expect(searchNotes([n], 'begriff', name)).toHaveLength(0);
  });
});
