import { describe, expect, it } from 'vitest';
import { decodeIcs, guessKind, importKey, parseIcs, planIcsImport } from './ics';
import { eventsOn, type StudyEvent } from './events';

const wrap = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n');
const vevent = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');

describe('Kalenderdatei lesen', () => {
  it('wöchentliche Vorlesung mit Zeitzone, Ort und Ende', () => {
    const r = parseIcs(
      wrap(
        vevent(
          'UID:a1@uni',
          'SUMMARY:Vorlesung Analysis I',
          'LOCATION:Hörsaal 3\\, Gebäude A',
          'DTSTART;TZID=Europe/Berlin:20261019T101500',
          'DTEND;TZID=Europe/Berlin:20261019T114500',
          'RRULE:FREQ=WEEKLY;UNTIL=20270205T000000Z',
        ),
      ),
    );
    expect(r.valid).toBe(true);
    expect(r.events).toHaveLength(1);
    const e = r.events[0];
    expect(e.title).toBe('Vorlesung Analysis I');
    expect(e.room).toBe('Hörsaal 3, Gebäude A');
    expect(e.kind).toBe('lecture');
    expect(e.weekday).toBe(1);
    expect(e.startMin).toBe(10 * 60 + 15);
    expect(e.endMin).toBe(11 * 60 + 45);
    expect(e.every).toBe(1);
    expect(e.validFrom).toBe('2026-10-19');
    expect(e.validTo).toBe('2027-02-05');
  });

  it('BYDAY mit mehreren Tagen ergibt je Tag einen Termin', () => {
    const r = parseIcs(
      wrap(
        vevent('UID:b', 'SUMMARY:Übung', 'DTSTART:20261020T080000', 'DTEND:20261020T094500', 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261231T000000'),
      ),
    );
    expect(r.events.map((e) => e.weekday).sort()).toEqual([2, 4]);
    expect(r.events[0].kind).toBe('exercise');
  });

  it('alle zwei Wochen und Ausnahmedaten (EXDATE)', () => {
    const r = parseIcs(
      wrap(
        vevent(
          'UID:c',
          'SUMMARY:Seminar',
          'DTSTART:20261019T140000',
          'DTEND:20261019T160000',
          'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4',
          'EXDATE:20261102T140000',
        ),
      ),
    );
    const e = r.events[0];
    expect(e.every).toBe(2);
    expect(e.validTo).toBe('2026-11-30'); // 19.10., 2.11., 16.11., 30.11.
    expect(e.skipped).toEqual(['2026-11-02']);
    const full = { ...e, id: 'x', subjectId: null };
    expect(eventsOn([full], '2026-10-19')).toHaveLength(1);
    expect(eventsOn([full], '2026-10-26')).toHaveLength(0);
    expect(eventsOn([full], '2026-11-02')).toHaveLength(0);
    expect(eventsOn([full], '2026-11-16')).toHaveLength(1);
    expect(eventsOn([full], '2026-12-14')).toHaveLength(0);
  });

  it('COUNT bei wöchentlicher Serie mit zwei Tagen', () => {
    const r = parseIcs(wrap(vevent('UID:d', 'SUMMARY:X', 'DTSTART:20261019T080000', 'DTEND:20261019T100000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5')));
    // Mo 19.10., Mi 21.10., Mo 26.10., Mi 28.10., Mo 2.11.
    expect(r.events.map((e) => e.validTo)).toEqual(['2026-11-02', '2026-11-02']);
  });

  it('ohne Ende gilt die Standarddauer', () => {
    const r = parseIcs(wrap(vevent('UID:e', 'SUMMARY:X', 'DTSTART:20261019T080000', 'DTEND:20261019T100000', 'RRULE:FREQ=WEEKLY')));
    expect(r.events[0].validTo).toBe('2027-04-19'); // 26 Wochen
  });

  it('Einzeltermin und abweichender Einzeltermin (RECURRENCE-ID)', () => {
    const r = parseIcs(
      wrap(
        vevent('UID:f', 'SUMMARY:VL', 'DTSTART:20261019T100000', 'DTEND:20261019T120000', 'RRULE:FREQ=WEEKLY;COUNT=3'),
        vevent('UID:f', 'SUMMARY:VL', 'RECURRENCE-ID:20261026T100000', 'DTSTART:20261026T140000', 'DTEND:20261026T160000'),
      ),
    );
    const series = r.events.find((e) => e.weekday === 1);
    const single = r.events.find((e) => e.date === '2026-10-26');
    expect(series?.skipped).toContain('2026-10-26');
    expect(single?.startMin).toBe(14 * 60);
  });

  it('UTC-Zeit wird in die Ortszeit umgerechnet', () => {
    const r = parseIcs(wrap(vevent('UID:g', 'SUMMARY:X', 'DTSTART:20261019T080000Z', 'DTEND:20261019T093000Z')));
    const local = new Date(Date.UTC(2026, 9, 19, 8, 0));
    expect(r.events[0].startMin).toBe(local.getHours() * 60 + local.getMinutes());
    expect(r.events[0].endMin - r.events[0].startMin).toBe(90);
  });

  it('Zeilenumbruch mitten im Text und maskierte Zeichen', () => {
    const r = parseIcs(wrap(vevent('UID:h', 'SUMMARY:Lange\r\n  Zeile\; mit Semikolon', 'DTSTART:20261019T080000', 'DTEND:20261019T090000')));
    expect(r.events[0].title).toBe('Lange Zeile; mit Semikolon');
  });

  it('ganztägige, mehrtägige und abgesagte Termine werden ausgelassen', () => {
    const r = parseIcs(
      wrap(
        vevent('UID:i', 'SUMMARY:Feiertag', 'DTSTART;VALUE=DATE:20261103', 'DTEND;VALUE=DATE:20261104'),
        vevent('UID:j', 'SUMMARY:Blockwoche', 'DTSTART:20261103T080000', 'DTEND:20261105T180000'),
        vevent('UID:k', 'SUMMARY:Abgesagt', 'STATUS:CANCELLED', 'DTSTART:20261103T080000', 'DTEND:20261103T090000'),
        vevent('UID:l', 'SUMMARY:Gut', 'DTSTART:20261103T080000', 'DTEND:20261103T090000'),
      ),
    );
    expect(r.events).toHaveLength(1);
    expect(r.ignored).toBe(3);
  });

  it('täglich wird zu einzelnen Terminen, begrenzt', () => {
    const r = parseIcs(wrap(vevent('UID:m', 'SUMMARY:Täglich', 'DTSTART:20261019T080000', 'DTEND:20261019T090000', 'RRULE:FREQ=DAILY;COUNT=3')));
    expect(r.events.map((e) => e.date)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
  });

  it('keine Kalenderdatei', () => {
    expect(parseIcs('hallo').valid).toBe(false);
    expect(parseIcs('').events).toEqual([]);
  });

  it('Art aus dem Titel', () => {
    expect(guessKind('Tutorium Lineare Algebra')).toBe('tutorial');
    expect(guessKind('Praktikum Physik')).toBe('lab');
    expect(guessKind('Übungsgruppe 3')).toBe('exercise');
    expect(guessKind('Irgendwas')).toBe('other');
  });
});

describe('Kodierung', () => {
  const text = 'BEGIN:VCALENDAR\r\nSUMMARY:Übung\r\nEND:VCALENDAR';
  it('UTF-8, mit BOM, UTF-16 mit und ohne BOM', () => {
    expect(decodeIcs(new TextEncoder().encode(text))).toBe(text);
    expect(decodeIcs(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]))).toBe(text);
    const u16 = new Uint8Array(text.length * 2);
    [...text].forEach((c, i) => {
      u16[i * 2] = c.charCodeAt(0) & 0xff;
      u16[i * 2 + 1] = c.charCodeAt(0) >> 8;
    });
    expect(decodeIcs(new Uint8Array([0xff, 0xfe, ...u16]))).toBe(text);
    expect(decodeIcs(u16)).toBe(text);
  });
});

describe('Import verbinden', () => {
  const subjects = [{ id: 's1', name: 'Analysis' }];
  let n = 0;
  const makeId = () => `id${(n += 1)}`;
  const file = parseIcs(wrap(vevent('UID:z', 'SUMMARY:Vorlesung Analysis', 'DTSTART:20261019T100000', 'DTEND:20261019T120000', 'RRULE:FREQ=WEEKLY;COUNT=10')));

  it('legt neue Termine an und ordnet das Fach zu', () => {
    const plan = planIcsImport([], file.events, subjects, makeId);
    expect(plan.added).toBe(1);
    expect(plan.write[0].subjectId).toBe('s1');
    expect(plan.write[0].id).toBeTruthy();
  });

  it('ein zweiter Import ändert nichts und legt nichts doppelt an', () => {
    const first = planIcsImport([], file.events, subjects, makeId);
    const again = planIcsImport(first.write, file.events, subjects, makeId);
    expect(again.added).toBe(0);
    expect(again.unchanged).toBe(1);
    expect(again.write).toEqual([]);
  });

  it('geänderte Zeit wird übernommen, Fach und Ausfälle bleiben', () => {
    const first = planIcsImport([], file.events, subjects, makeId).write;
    const mine: StudyEvent[] = [{ ...first[0], subjectId: 's9', skipped: ['2026-11-02'] }];
    const moved = file.events.map((e) => ({ ...e, endMin: e.endMin + 30, room: 'Neu' }));
    const plan = planIcsImport(mine, moved, subjects, makeId);
    expect(plan.updated).toBe(1);
    expect(plan.write[0].endMin).toBe(12 * 60 + 30);
    expect(plan.write[0].subjectId).toBe('s9');
    expect(plan.write[0].skipped).toEqual(['2026-11-02']);
  });

  it('Obergrenze', () => {
    const plan = planIcsImport([], file.events, subjects, makeId, 0);
    expect(plan.skippedForLimit).toBe(1);
    expect(plan.write).toEqual([]);
  });

  it('Schlüssel unterscheidet Wochentag und Beginn', () => {
    const a = importKey({ uid: 'u', weekday: 1, date: null, startMin: 600, title: 't' });
    const b = importKey({ uid: 'u', weekday: 2, date: null, startMin: 600, title: 't' });
    expect(a).not.toBe(b);
  });
});
