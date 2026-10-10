import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { inkShare, isBlankPage, skippedSummary, splitKnownFiles, textKey } from './worksheetPrep';

const white = (n: number) => new Array<number>(n).fill(255);
const opts = { delta: CONFIG.ai.blankInkDelta, maxInkShare: CONFIG.ai.blankInkShare };

/** Weiße Seite mit `dots` schwarzen Pixeln. */
const withInk = (n: number, dots: number) => {
  const g = white(n);
  for (let i = 0; i < dots; i++) g[i * 3] = 0;
  return g;
};

describe('isBlankPage', () => {
  const N = 200 * 140;

  it('eine weiße Seite ist leer, auch ohne Daten oder mit Rauschen im Papier', () => {
    expect(isBlankPage(white(N), opts)).toBe(true);
    expect(isBlankPage(white(N).map((_, i) => 250 + (i % 5)), opts)).toBe(true); // leichtes Papierrauschen
    expect(isBlankPage([], opts)).toBe(false); // nichts zu prüfen: nicht aussortieren
  });

  it('eine Seite mit Text ist nicht leer', () => {
    expect(isBlankPage(withInk(N, Math.round(N * 0.02)), opts)).toBe(false);
    expect(isBlankPage(withInk(N, Math.round(N * 0.005)), opts)).toBe(false);
  });

  it('ein einzelner Fleck oder eine Seitenzahl ist so gut wie leer', () => {
    expect(isBlankPage(withInk(N, 5), opts)).toBe(true);
    expect(inkShare(withInk(N, 5), opts.delta)).toBeLessThan(opts.maxInkShare);
  });

  it('eine Titelzeile reicht, damit die Seite bleibt', () => {
    // Zeile von 120 x 3 Pixeln auf 200 x 140
    const g = white(N);
    for (let y = 20; y < 23; y++) for (let x = 40; x < 160; x++) g[y * 200 + x] = 30;
    expect(isBlankPage(g, opts)).toBe(false);
  });

  it('der Hintergrund wird mitgerechnet: graues Papier ist leer, Schrift darauf nicht', () => {
    const grey = new Array<number>(N).fill(170);
    expect(isBlankPage(grey, opts)).toBe(true);
    const written = grey.slice();
    for (let i = 0; i < N * 0.02; i++) written[i] = 60;
    expect(isBlankPage(written, opts)).toBe(false);
  });

  it('ein feiner Verlauf (Schatten im Foto) zählt nicht als Tinte', () => {
    const gradient = Array.from({ length: N }, (_, i) => 255 - (i / N) * 20);
    expect(isBlankPage(gradient, opts)).toBe(true);
  });
});

describe('splitKnownFiles', () => {
  const f = (name: string, hash: string | null) => ({ name, hash });

  it('lässt neue Dateien durch und sortiert bekannte aus', () => {
    const r = splitKnownFiles([f('a.pdf', 'h1'), f('b.pdf', 'h2'), f('c.pdf', 'h3')], ['h2']);
    expect(r.fresh.map((x) => x.name)).toEqual(['a.pdf', 'c.pdf']);
    expect(r.skipped.map((x) => x.name)).toEqual(['b.pdf']);
  });

  it('dieselbe Datei zweimal in einer Auswahl zählt einmal', () => {
    const r = splitKnownFiles([f('a.pdf', 'h1'), f('kopie.pdf', 'h1')], []);
    expect(r.fresh.map((x) => x.name)).toEqual(['a.pdf']);
    expect(r.skipped.map((x) => x.name)).toEqual(['kopie.pdf']);
  });

  it('ohne Hash wird immer verarbeitet', () => {
    const r = splitKnownFiles([f('a', null), f('b', null)], ['h1']);
    expect(r.fresh).toHaveLength(2);
    expect(r.skipped).toHaveLength(0);
  });

  it('nimmt auch eine Menge als Quelle der bekannten Hashes', () => {
    expect(splitKnownFiles([f('a', 'h1')], new Set(['h1'])).fresh).toHaveLength(0);
  });
});

describe('textKey und skippedSummary', () => {
  it('Groß- und Kleinschreibung und Leerraum sind egal', () => {
    expect(textKey('  Das ist\n ein  Text ')).toBe(textKey('das ist ein text'));
    expect(textKey('Text A')).not.toBe(textKey('Text B'));
  });

  it('fasst Aussortiertes in einem Satz zusammen', () => {
    expect(skippedSummary({ files: 0, blank: 0, duplicate: 0 })).toBe('');
    expect(skippedSummary({ files: 1, blank: 2, duplicate: 1 })).toBe(
      'Aussortiert, damit nichts doppelt bezahlt wird: 1 Datei war schon hochgeladen, 2 leere Seiten, 1 doppelte Seite.',
    );
    expect(skippedSummary({ files: 3, blank: 1, duplicate: 0 })).toContain('3 Dateien waren schon hochgeladen');
  });
});
