import { describe, expect, it } from 'vitest';
import { initialPages, isUnchanged, movePage, normalizeRotation, removePage, rotatePage } from './pageEdit';

const sources = (l: { source: number }[]) => l.map((p) => p.source);

describe('pageEdit', () => {
  it('initialPages: Originalreihenfolge, ungedreht', () => {
    expect(initialPages(3)).toEqual([{ source: 0, rotation: 0 }, { source: 1, rotation: 0 }, { source: 2, rotation: 0 }]);
    expect(initialPages(0)).toEqual([]);
    expect(initialPages(-2)).toEqual([]);
  });

  it('normalizeRotation bringt jede Gradzahl auf 0 bis 270', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-450)).toBe(270);
    expect(normalizeRotation(100)).toBe(90); // auf 90 gerundet
  });

  it('rotatePage dreht nur diese Seite, viermal ist wieder 0', () => {
    let l = initialPages(2);
    l = rotatePage(l, 1);
    expect(l.map((p) => p.rotation)).toEqual([0, 90]);
    l = rotatePage(rotatePage(rotatePage(l, 1), 1), 1);
    expect(l.map((p) => p.rotation)).toEqual([0, 0]);
  });

  it('movePage verschiebt und bleibt am Rand stehen', () => {
    const l = initialPages(4);
    expect(sources(movePage(l, 1, -1))).toEqual([1, 0, 2, 3]);
    expect(sources(movePage(l, 1, 1))).toEqual([0, 2, 1, 3]);
    expect(sources(movePage(l, 0, -1))).toEqual([0, 1, 2, 3]);
    expect(sources(movePage(l, 3, 1))).toEqual([0, 1, 2, 3]);
    expect(sources(movePage(l, 0, 3))).toEqual([1, 2, 3, 0]);
    expect(sources(movePage(l, 9, 1))).toEqual([0, 1, 2, 3]);
  });

  it('removePage entfernt eine Seite', () => {
    expect(sources(removePage(initialPages(3), 1))).toEqual([0, 2]);
    expect(removePage(initialPages(1), 0)).toEqual([]);
  });

  it('ändert die Eingabe nicht', () => {
    const l = initialPages(3);
    rotatePage(l, 0);
    movePage(l, 0, 2);
    removePage(l, 0);
    expect(l).toEqual(initialPages(3));
  });

  it('isUnchanged erkennt Änderungen jeder Art', () => {
    expect(isUnchanged(initialPages(3), 3)).toBe(true);
    expect(isUnchanged(rotatePage(initialPages(3), 0), 3)).toBe(false);
    expect(isUnchanged(movePage(initialPages(3), 0, 1), 3)).toBe(false);
    expect(isUnchanged(removePage(initialPages(3), 2), 3)).toBe(false);
    expect(isUnchanged([], 0)).toBe(true);
  });
});
