import { describe, expect, it } from 'vitest';
import { groupNotesByWeek, isoWeek, weekStart } from './notesView';

const n = (id: string, lessonDate: string, createdAt = '') => ({ id, lessonDate, createdAt });

describe('weekStart und isoWeek', () => {
  it('Montag bis Sonntag gehören zur selben Woche', () => {
    // 5. bis 11. Oktober 2026 (Montag bis Sonntag)
    for (const d of ['2026-10-05', '2026-10-07', '2026-10-11']) expect(weekStart(d)).toBe('2026-10-05');
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
  });

  it('kommt mit Monats- und Jahreswechsel zurecht', () => {
    expect(weekStart('2026-03-01')).toBe('2026-02-23'); // Sonntag
    expect(weekStart('2027-01-01')).toBe('2026-12-28'); // Freitag
  });

  it('Kalenderwoche nach ISO 8601', () => {
    expect(isoWeek('2026-10-07')).toBe(41);
    expect(isoWeek('2026-01-01')).toBe(1); // Donnerstag
    expect(isoWeek('2027-01-01')).toBe(53); // Freitag, 2026 hat 53 Wochen
    expect(isoWeek('2024-12-30')).toBe(1); // Montag, gehört zur KW 1 von 2025
  });

  it('Sommerzeit verschiebt nichts', () => {
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Umstellung in der Nacht auf den 25.
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
  });
});

describe('groupNotesByWeek', () => {
  const today = '2026-10-07'; // Mittwoch

  it('ordnet nach Woche und Tag, neu zuerst', () => {
    const weeks = groupNotesByWeek(
      [n('a', '2026-09-30'), n('b', '2026-10-07'), n('c', '2026-10-05'), n('d', '2026-10-07', '2026-10-07T12:00'), n('e', '2026-09-20')],
      today,
    );
    expect(weeks.map((w) => [w.start, w.weeksAgo, w.count])).toEqual([
      ['2026-10-05', 0, 3],
      ['2026-09-28', 1, 1],
      ['2026-09-14', 3, 1],
    ]);
    expect(weeks[0].days.map((d) => d.date)).toEqual(['2026-10-07', '2026-10-05']);
    expect(weeks[0].days[0].notes.map((x) => x.id)).toEqual(['d', 'b']); // später angelegt zuerst
    expect(weeks[0].end).toBe('2026-10-11');
    expect(weeks[0].kw).toBe(41);
  });

  it('leere Liste und fehlendes createdAt', () => {
    expect(groupNotesByWeek([], today)).toEqual([]);
    expect(groupNotesByWeek([{ lessonDate: '2026-10-07' }, { lessonDate: '2026-10-07', createdAt: undefined }], today)[0].count).toBe(2);
  });

  it('ein Datum in der Zukunft zählt als diese Woche und gibt nie eine negative Zahl', () => {
    expect(groupNotesByWeek([n('x', '2026-10-20')], today)[0].weeksAgo).toBe(0);
  });

  it('ändert die Eingabe nicht', () => {
    const input = [n('a', '2026-10-01'), n('b', '2026-10-07')];
    groupNotesByWeek(input, today);
    expect(input.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
