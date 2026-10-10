import { describe, expect, it } from 'vitest';
import { isLanisExam, matchSubject, parseLanisExam, planImport, type LanisEvent } from './lanis';
import type { Exam } from './types';

const ev = (Id: string, title: string, start: string, code = 'Q1M03-GYM'): LanisEvent => ({
  Id,
  title,
  description: `Klausur in ${title.split(' ').slice(0, 2).join(' ')} (${code})`,
  start,
});

const subjects = [
  { id: 'm', name: 'Mathematik' },
  { id: 'p', name: 'Politik und Wirtschaft' },
  { id: 'e', name: 'Englisch' },
];

const exam = (over: Partial<Exam>): Exam => ({
  id: 'x',
  subjectId: 'm',
  title: 'Klausur Mathematik',
  date: '2026-12-08',
  priorityManual: null,
  totalHoursManual: null,
  startDaysManual: null,
  ...over,
});

describe('parseLanisExam', () => {
  it('liest Fach, Stufe, Kurscode und Datum', () => {
    const r = parseLanisExam(ev('1', 'M Q1 Klausur', '2026-12-08T09:55:00+01:00'));
    expect(r).toMatchObject({ externalId: '1', date: '2026-12-08', abbr: 'M', stage: 'Q1', courseCode: 'Q1M03-GYM', isAdvanced: false });
  });

  it('erkennt Leistungskurse am Kurscode', () => {
    const r = parseLanisExam(ev('2', 'POWI Q1 Klausur', '2026-12-14T09:55:00+01:00', 'Q1POWI_LK01-GYM'));
    expect(r?.isAdvanced).toBe(true);
  });

  it('nimmt das Datum aus dem Eintrag, nicht in UTC umgerechnet', () => {
    expect(parseLanisExam(ev('3', 'E Q1 Klausur', '2026-12-18T00:30:00+01:00'))?.date).toBe('2026-12-18');
  });

  it('ignoriert andere Termine und unvollständige Einträge', () => {
    expect(isLanisExam({ title: 'Elternsprechtag' })).toBe(false);
    expect(parseLanisExam(ev('4', 'Klausur', '2026-12-18T08:00:00+01:00'))).toBeNull();
    expect(parseLanisExam({ Id: '', title: 'M Q1 Klausur', start: '2026-12-18T08:00:00+01:00' })).toBeNull();
    expect(parseLanisExam({ Id: '5', title: 'M Q1 Klausur', start: 'bald' })).toBeNull();
  });
});

describe('matchSubject', () => {
  it('ordnet Kürzel den Fächern zu', () => {
    expect(matchSubject('M', subjects)).toBe('m');
    expect(matchSubject('POWI', subjects)).toBe('p');
    expect(matchSubject('e', subjects)).toBe('e');
  });

  it('gibt null zurück, wenn das Fach fehlt', () => {
    expect(matchSubject('ETHI', subjects)).toBeNull();
    expect(matchSubject('XYZ', subjects)).toBeNull();
  });

  it('erkennt auch Fächer, die so heißen wie das Kürzel', () => {
    expect(matchSubject('BIO', [{ id: 'b', name: 'Bio' }])).toBe('b');
  });
});

describe('planImport', () => {
  const events = [
    ev('b', 'E Q1 Klausur', '2026-12-18T08:00:00+01:00'),
    ev('a', 'M Q1 Klausur', '2026-12-08T09:55:00+01:00'),
    ev('old', 'M Q1 Klausur', '2026-01-08T09:55:00+01:00'),
    ev('a', 'M Q1 Klausur', '2026-12-08T09:55:00+01:00'),
  ];

  it('sortiert nach Datum, lässt Vergangenes und Doppelte weg', () => {
    const items = planImport(events, subjects, [], '2026-10-06');
    expect(items.map((i) => i.lanis.externalId)).toEqual(['a', 'b']);
    expect(items.every((i) => i.status === 'new')).toBe(true);
  });

  it('erkennt schon importierte und verschobene Klausuren', () => {
    const items = planImport(
      events,
      subjects,
      [exam({ externalId: 'a' }), exam({ id: 'y', externalId: 'b', subjectId: 'e', date: '2026-12-17' })],
      '2026-10-06',
    );
    expect(items.map((i) => i.status)).toEqual(['known', 'changed']);
  });

  it('behält das Fach einer schon importierten Klausur', () => {
    const items = planImport([events[1]], subjects, [exam({ externalId: 'a', subjectId: 'e' })], '2026-10-06');
    expect(items[0].subjectId).toBe('e');
  });
});
