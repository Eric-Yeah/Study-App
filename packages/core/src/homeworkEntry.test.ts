import { describe, expect, it } from 'vitest';
import { dueOptions, isOwnHomework, ownKey, parseHomeworkEntry } from './homeworkEntry';
import type { Timetable } from './lanisPlans';

const subjects = [
  { id: 'ma', name: 'Mathematik' },
  { id: 'en', name: 'Englisch' },
  { id: 'bio', name: 'Biologie' },
  { id: 'sport', name: 'Sport' },
];
// Mittwoch, 28.10.2026
const today = '2026-10-28';
const parse = (t: string) => parseHomeworkEntry(t, subjects, today);

describe('Hausaufgabe aus einer Zeile lesen', () => {
  it('erkennt Fach am Anfang und entfernt es aus dem Text', () => {
    expect(parse('Englisch Vokabeln Unit 5')).toEqual({ title: 'Vokabeln Unit 5', subjectId: 'en', due: null });
    expect(parse('Mathe S. 45 Nr. 3')).toMatchObject({ title: 'S. 45 Nr. 3', subjectId: 'ma' });
  });

  it('kennt Kürzel und Namensanfänge, aber keine beliebigen Wörter', () => {
    expect(parse('Bio Protokoll schreiben').subjectId).toBe('bio');
    expect(parse('Spo Bericht').subjectId).toBe('sport');
    expect(parse('Aufgaben machen').subjectId).toBeNull();
    expect(parse('Ma').subjectId).toBe('ma');
  });

  it('liest Fristen mit Einleitungswort', () => {
    expect(parse('Mathe S. 45 bis Freitag').due).toBe('2026-10-30');
    expect(parse('Mathe S. 45 bis morgen').due).toBe('2026-10-29');
    expect(parse('Mathe S. 45 für übermorgen').due).toBe('2026-10-30');
    expect(parse('Mathe S. 45 bis Mi').due).toBe('2026-11-04'); // heute ist Mittwoch: der nächste
    expect(parse('Mathe S. 45 bis heute').due).toBe(today);
  });

  it('liest Fristen am Ende und Datumsangaben', () => {
    expect(parse('Englisch Text lesen morgen').due).toBe('2026-10-29');
    expect(parse('Englisch Essay bis 12.11.').due).toBe('2026-11-12');
    expect(parse('Englisch Essay 12.11.').due).toBe('2026-11-12');
    expect(parse('Englisch Essay bis 3.1.').due).toBe('2027-01-03'); // schon vorbei: nächstes Jahr
    expect(parse('Englisch Essay bis 12.11.2026').due).toBe('2026-11-12');
    expect(parse('Englisch Essay bis 31.2.').due).toBeNull();
  });

  it('entfernt Fach und Frist aus dem Titel', () => {
    expect(parse('Mathe S. 45 Nr. 3 bis Freitag')).toEqual({ title: 'S. 45 Nr. 3', subjectId: 'ma', due: '2026-10-30' });
  });

  it('"nächste Stunde" lässt die Frist offen', () => {
    expect(parse('Bio Protokoll bis nächste Stunde')).toEqual({ title: 'Protokoll', subjectId: 'bio', due: null });
  });

  it('lässt einen Text, der sonst leer wäre, vollständig', () => {
    expect(parse('morgen').title).toBe('morgen');
    expect(parse('bis Freitag').title).toBe('bis Freitag');
    expect(parse('').title).toBe('');
  });

  it('eine Zahl mit Punkt am Textende ist kein Datum, wenn sie keines ist', () => {
    expect(parse('Mathe Aufgabe 45.').due).toBeNull();
    expect(parse('Mathe Aufgabe 99.99.').due).toBeNull();
  });
});

describe('Vorschläge für den Abgabetag', () => {
  // Biologie dienstags (weekday 1)
  const tt: Timetable = {
    validFrom: null,
    periods: [],
    lessons: [{ weekday: 1, period: 5, span: 1, start: '11:00', end: '11:45', course: 'Q1BIO01', abbr: 'bio', isAdvanced: false, room: '', teacher: '' }],
  };

  it('nächste Stunde des Fachs aus dem Stundenplan', () => {
    expect(dueOptions('bio', today, tt, subjects)).toEqual({ next: '2026-11-03', fromTimetable: true, tomorrow: '2026-10-29' });
  });

  it('ohne Fach oder Stundenplan der nächste Schultag', () => {
    expect(dueOptions(null, today, tt, subjects)).toMatchObject({ next: '2026-10-29', fromTimetable: false });
    expect(dueOptions('bio', today, null, subjects)).toMatchObject({ next: '2026-10-29', fromTimetable: false });
    expect(dueOptions('bio', '2026-10-30', null, subjects).next).toBe('2026-11-02'); // Freitag -> Montag
  });
});

describe('eigene Hausaufgaben erkennen', () => {
  it('am Schlüssel own:', () => {
    expect(isOwnHomework({ externalId: ownKey('abc') })).toBe(true);
    expect(isOwnHomework({ externalId: '6829:15' })).toBe(false);
    expect(isOwnHomework({ externalId: null })).toBe(false);
    expect(isOwnHomework({})).toBe(false);
  });
});
