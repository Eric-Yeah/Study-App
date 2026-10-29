import { describe, expect, it } from 'vitest';
import { blockedMinutesOn, dayStatus, eventsOn, formatClock, gapsOn, matchSubjectId, mondayOf, occursOn, parseClock, weekOf, type StudyEvent } from './events';

const ev = (extra: Partial<StudyEvent>): StudyEvent => ({
  id: 'e',
  subjectId: null,
  kind: 'lecture',
  title: 'Analysis',
  room: '',
  lecturer: '',
  weekday: 1, // Montag
  date: null,
  startMin: 10 * 60,
  endMin: 12 * 60,
  every: 1,
  validFrom: null,
  validTo: null,
  skipped: [],
  uid: null,
  ...extra,
});

// 2026-03-02 ist ein Montag
describe('Termine', () => {
  it('wöchentlich am Wochentag, mit Gültigkeit und Ausfall', () => {
    const e = ev({ validFrom: '2026-03-02', validTo: '2026-03-23', skipped: ['2026-03-16'] });
    expect(occursOn(e, '2026-03-02')).toBe(true);
    expect(occursOn(e, '2026-03-03')).toBe(false);
    expect(occursOn(e, '2026-02-23')).toBe(false);
    expect(occursOn(e, '2026-03-16')).toBe(false);
    expect(occursOn(e, '2026-03-23')).toBe(true);
    expect(occursOn(e, '2026-03-30')).toBe(false);
  });

  it('alle zwei Wochen, die Woche des Anfangs ist die erste', () => {
    const e = ev({ every: 2, validFrom: '2026-03-02' });
    expect(occursOn(e, '2026-03-02')).toBe(true);
    expect(occursOn(e, '2026-03-09')).toBe(false);
    expect(occursOn(e, '2026-03-16')).toBe(true);
  });

  it('Einzeltermin', () => {
    const e = ev({ weekday: null, date: '2026-03-05' });
    expect(occursOn(e, '2026-03-05')).toBe(true);
    expect(occursOn(e, '2026-03-12')).toBe(false);
  });

  it('sortiert nach Beginn', () => {
    const list = [ev({ id: 'b', startMin: 14 * 60, endMin: 15 * 60 }), ev({ id: 'a', startMin: 8 * 60, endMin: 9 * 60 })];
    expect(eventsOn(list, '2026-03-02').map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('Woche ab Montag', () => {
    expect(mondayOf('2026-03-04')).toBe('2026-03-02');
    expect(mondayOf('2026-03-08')).toBe('2026-03-02'); // Sonntag gehört zur Woche davor
    const week = weekOf([ev({})], '2026-03-04');
    expect(week).toHaveLength(7);
    expect(week[0].date).toBe('2026-03-02');
    expect(week[0].events).toHaveLength(1);
    expect(week[1].events).toHaveLength(0);
  });
});

describe('Lücken und Sperrzeiten', () => {
  it('Lücken zwischen den Terminen im Tagesfenster', () => {
    const list = [ev({ startMin: 9 * 60, endMin: 10 * 60 }), ev({ id: 'x', startMin: 12 * 60, endMin: 14 * 60 })];
    const gaps = gapsOn(list, '2026-03-02', { startMin: 8 * 60, endMin: 18 * 60 });
    expect(gaps).toEqual([
      { startMin: 8 * 60, endMin: 9 * 60 },
      { startMin: 10 * 60, endMin: 12 * 60 },
      { startMin: 14 * 60, endMin: 18 * 60 },
    ]);
  });

  it('zu kurze Lücken fallen weg', () => {
    const list = [ev({ startMin: 9 * 60, endMin: 10 * 60 }), ev({ id: 'x', startMin: 10 * 60 + 10, endMin: 11 * 60 })];
    expect(gapsOn(list, '2026-03-02', { startMin: 9 * 60, endMin: 11 * 60 })).toEqual([]);
  });

  it('gesperrte Minuten zählen einmal, auch bei Überschneidung', () => {
    const list = [
      ev({ kind: 'blocked', startMin: 8 * 60, endMin: 12 * 60 }),
      ev({ id: 'b', kind: 'blocked', startMin: 11 * 60, endMin: 13 * 60 }),
      ev({ id: 'c', kind: 'lecture', startMin: 14 * 60, endMin: 16 * 60 }),
    ];
    expect(blockedMinutesOn(list, '2026-03-02')).toBe(5 * 60);
    expect(blockedMinutesOn(list, '2026-03-03')).toBe(0);
  });
});

describe('Jetzt', () => {
  const list = [ev({ id: 'a', startMin: 10 * 60, endMin: 12 * 60 }), ev({ id: 'b', startMin: 14 * 60, endMin: 16 * 60 })];
  it('läuft gerade eine Veranstaltung', () => {
    const s = dayStatus(list, new Date(2026, 2, 2, 10, 30));
    expect(s.current?.id).toBe('a');
    expect(s.next?.id).toBe('b');
    expect(s.freeMin).toBeNull();
  });
  it('Lücke bis zur nächsten Veranstaltung', () => {
    const s = dayStatus(list, new Date(2026, 2, 2, 12, 15));
    expect(s.current).toBeNull();
    expect(s.freeMin).toBe(105);
  });
  it('ohne Termine ist der Rest des Tages frei', () => {
    const s = dayStatus(list, new Date(2026, 2, 3, 9, 0));
    expect(s.freeMin).toBe(11 * 60);
  });
  it('kurz vor Beginn zählt nicht als Lücke', () => {
    const s = dayStatus(list, new Date(2026, 2, 2, 13, 50));
    expect(s.freeMin).toBeNull();
  });
});

describe('Hilfen', () => {
  it('Uhrzeit lesen und schreiben', () => {
    expect(formatClock(9 * 60 + 5)).toBe('09:05');
    expect(parseClock('9:15')).toBe(555);
    expect(parseClock('09.15')).toBe(555);
    expect(parseClock('1015')).toBe(615);
    expect(parseClock('9')).toBe(540);
    expect(parseClock('25:00')).toBeNull();
    expect(parseClock('abc')).toBeNull();
  });

  it('Fach aus dem Titel, der längste Name gewinnt', () => {
    const subjects = [
      { id: 'a', name: 'Analysis' },
      { id: 'b', name: 'Analysis II' },
      { id: 'c', name: 'Lineare Algebra' },
    ];
    expect(matchSubjectId('Vorlesung Analysis II', subjects)).toBe('b');
    expect(matchSubjectId('Übung zu Analysis', subjects)).toBe('a');
    expect(matchSubjectId('lineare algebra (Tutorium)', subjects)).toBe('c');
    expect(matchSubjectId('Sport', subjects)).toBeNull();
  });
});

import { eventFreeSlot, eventSubjectId } from './events';

describe('Lücke zum Lernen und Fach aus dem Termin', () => {
  const lecture = (id: string, startMin: number, endMin: number, subjectId: string | null = null) =>
    ev({ id, startMin, endMin, subjectId, weekday: 1 });
  const list = [lecture('a', 10 * 60, 12 * 60, 'm1'), lecture('b', 14 * 60, 16 * 60, 'm2')];
  // 2026-03-02 ist ein Montag

  it('zwischen zwei Terminen', () => {
    const slot = eventFreeSlot(list, new Date(2026, 2, 2, 12, 30));
    expect(slot).toEqual({ start: '12:30', end: '14:00', minutes: 90, running: true });
  });
  it('die laufende Veranstaltung endet gleich, danach ist Platz', () => {
    const slot = eventFreeSlot(list, new Date(2026, 2, 2, 11, 50));
    expect(slot).toEqual({ start: '12:00', end: '14:00', minutes: 120, running: false });
  });
  it('mitten in der Veranstaltung keine Lücke', () => {
    expect(eventFreeSlot(list, new Date(2026, 2, 2, 10, 30))).toBeNull();
  });
  it('nach dem letzten Termin keine Lücke', () => {
    expect(eventFreeSlot(list, new Date(2026, 2, 2, 17, 0))).toBeNull();
  });
  it('zu kurz', () => {
    expect(eventFreeSlot(list, new Date(2026, 2, 2, 13, 55))).toBeNull();
  });
  it('Fach der laufenden oder gerade beendeten Veranstaltung', () => {
    expect(eventSubjectId(list, new Date(2026, 2, 2, 10, 30))).toBe('m1');
    expect(eventSubjectId(list, new Date(2026, 2, 2, 12, 30))).toBe('m1');
    expect(eventSubjectId(list, new Date(2026, 2, 2, 13, 55))).toBeNull(); // länger als 90 Minuten her
    expect(eventSubjectId(list, new Date(2026, 2, 3, 12, 30))).toBeNull();
  });
});

import { nextEventDay } from './events';
describe('Nächster Termin eines Moduls', () => {
  it('findet den nächsten Tag mit einem Termin des Moduls', () => {
    const list = [ev({ subjectId: 'm1', weekday: 1 }), ev({ id: 'o', subjectId: 'm2', weekday: 3 })];
    expect(nextEventDay(list, 'm1', '2026-03-02')).toBe('2026-03-09'); // Montag nach Montag
    expect(nextEventDay(list, 'm2', '2026-03-02')).toBe('2026-03-04');
    expect(nextEventDay(list, 'm3', '2026-03-02')).toBeNull();
    expect(nextEventDay(list, null, '2026-03-02')).toBeNull();
  });
});
