import { describe, expect, it } from 'vitest';
import {
  dateProblem,
  diagnoseDsb,
  dropConflicts,
  dsbForStudent,
  dsbNextStep,
  mergeSubstitutions,
  parseDsbStamp,
  readDsbPlans,
  substitutionsStale,
  titleWeekday,
} from './dsbCheck';
import { forStudent, parseUntisTables, strictPeriods, untisStand, type DsbEntry } from './dsbPlan';
import type { Timetable } from './lanisPlans';

// Alle Pläne sind erfunden, im Aufbau des echten Plans (Spalten Art, Stunde, Vertreter, Fach, Raum, Text; Zwischenzeile mit der Stufe).
const NOW = new Date(2026, 9, 22, 12, 0); // Donnerstag, 22.10.2026
const cell = (inner: string) => `<td class="list" align="center">${inner}</td>`;
const row = (art: string, periods: string, teacher: string, subject: string, room = '---') =>
  `<tr class="list odd">${cell(art)}${cell(periods)}${cell(teacher)}${cell(subject)}${cell(room)}${cell('&nbsp;')}</tr>`;
const ENTFALL = 'Eigenverantwortliches Arbeiten';
const HEAD = '<tr class="list"><th>Art</th><th>Stunde</th><th>Vertreter</th><th>Fach</th><th>Raum</th><th>Text</th></tr>';
const group = (name: string) => `<tr class="list"><td class="list inline_header" colspan="6">${name}  ${name}</td></tr>`;
const page = (title: string, body: string, opts: { stand?: string; head?: boolean } = {}) =>
  `<table class="mon_head"><tr><td><p>Gymnasium Test<br />Stand: ${opts.stand ?? '22.10.2026 14:25'}</p></td></tr></table>` +
  `<div class="mon_title">${title}</div><table class="mon_list">${opts.head === false ? '' : HEAD}${body}</table>`;
const G5 = row(ENTFALL, '5', '<s>Lmn</s>', '<s>G</s>');
const q1 = (...rows: string[]) => group('Q1') + rows.join('');

describe('DSB-Prüfung: Datum', () => {
  it('liest den Wochentag aus dem Titel', () => {
    expect(titleWeekday('22.10.2026 Donnerstag (Seite 1 / 3)')).toBe(4);
    expect(titleWeekday('22.10. Do')).toBe(4);
    expect(titleWeekday('22.10.2026, Sonntag')).toBe(0);
    expect(titleWeekday('22.10.2026 Woche B')).toBeNull();
    expect(titleWeekday('Donnerstag')).toBeNull();
  });

  it('gültiger Tag, falscher Wochentag, Wochenende, zu alt, zu weit voraus, fehlendes Datum', () => {
    const today = '2026-10-22';
    expect(dateProblem('2026-10-22', '22.10.2026 Donnerstag', today)).toBeNull();
    expect(dateProblem('2026-10-23', '23.10.2026 Freitag', today)).toBeNull();
    expect(dateProblem('2026-10-21', '21.10.2026 Mittwoch', today)).toBeNull(); // gestern ist noch in Ordnung
    expect(dateProblem('2026-10-22', '22.10.2026 Freitag', today)).toBe('date_weekday');
    expect(dateProblem('2026-10-24', '24.10.2026 Samstag', today)).toBe('date_weekend');
    expect(dateProblem('2026-10-25', '25.10.2026', today)).toBe('date_weekend');
    expect(dateProblem('2026-10-20', '20.10.2026 Dienstag', today)).toBe('date_past');
    expect(dateProblem('2026-11-12', '12.11.2026 Donnerstag', today)).toBeNull(); // 21 Tage voraus
    expect(dateProblem('2026-11-13', '13.11.2026 Freitag', today)).toBe('date_future');
    expect(dateProblem(null, 'Vertretungen', today)).toBe('date_missing');
  });

  it('Seiten mit unplausiblem Datum werden verworfen und gezählt, die anderen bleiben', () => {
    const pages = [
      page('22.10.2026 Donnerstag', q1(G5)),
      page('22.10.2026 Freitag', q1(G5)), // Wochentag passt nicht
      page('24.10.2026 Samstag', q1(G5)),
      page('10.10.2026 Samstag', q1(G5, G5)), // zu alt und Wochenende
      page('31.04.2026 Donnerstag', q1(G5)), // gibt es nicht
      page('Vertretungsplan', q1(G5)), // kein Datum
      page('01.12.2026 Dienstag', q1(G5)), // zu weit voraus
    ];
    const r = readDsbPlans(pages, NOW);
    expect(r.entries).toHaveLength(1);
    expect(r.dates).toEqual(['2026-10-22']);
    expect(r.problems).toMatchObject({ date_weekday: 1, date_weekend: 2, date_missing: 2, date_future: 1 });
    expect(r.rejected.date).toBe(7); // Zeilen der sechs verworfenen Seiten (eine hat zwei)
    expect(r.usable).toBe(true);
  });

  it('Jahreswechsel: Titel ohne Jahr nehmen das Jahr, das am nächsten an heute liegt', () => {
    const dec = new Date(2026, 11, 30, 9, 0); // Mittwoch, 30.12.2026
    const jan = readDsbPlans([page('04.01. Montag', q1(G5), { stand: '30.12.2026 14:00' })], dec);
    expect(jan.dates).toEqual(['2027-01-04']);
    expect(jan.problems.date_weekday).toBe(0);
    const back = readDsbPlans([page('31.12. Donnerstag', q1(G5))], new Date(2027, 0, 1, 8, 0));
    expect(back.dates).toEqual(['2026-12-31']); // gestern, Jahr zurück
    expect(readDsbPlans([page('31.12. Donnerstag', q1(G5))], new Date(2027, 0, 6, 8, 0)).problems.date_past).toBe(1);
  });
});

describe('DSB-Prüfung: Zeilen', () => {
  it('Stunden: 0, über das Raster, rückwärts, zu lang, Jahreszahl und Text werden verworfen', () => {
    expect(strictPeriods('3 - 4')).toEqual({ periods: [3, 4], status: 'ok' });
    expect(strictPeriods('3, 4')).toEqual({ periods: [3, 4], status: 'ok' });
    expect(strictPeriods('0').status).toBe('bad');
    expect(strictPeriods('15').status).toBe('bad');
    expect(strictPeriods('5 - 3').status).toBe('bad');
    expect(strictPeriods('1 - 12').status).toBe('bad'); // länger als 8 Stunden
    expect(strictPeriods('2026').status).toBe('bad');
    expect(strictPeriods('ab 3').status).toBe('bad');
    expect(strictPeriods('Stunde').status).toBe('none');
    expect(strictPeriods('').status).toBe('none');
    const r = readDsbPlans(
      [
        page(
          '22.10.2026 Donnerstag',
          q1(G5, row(ENTFALL, '0', '<s>Lmn</s>', '<s>G</s>'), row(ENTFALL, '15', '<s>Lmn</s>', '<s>G</s>'), row(ENTFALL, '5 - 3', '<s>Lmn</s>', '<s>G</s>'), row(ENTFALL, '1 - 12', '<s>Lmn</s>', '<s>G</s>')),
        ),
      ],
      NOW,
    );
    expect(r.entries).toHaveLength(1);
    expect(r.rejected.periods).toBe(4);
  });

  it('Kopfzeilen als Daten, Fußzeilen, Hinweise und "Keine Vertretungen" sind keine Einträge', () => {
    const junk = [
      row('Art', 'Stunde', 'Vertreter', 'Fach', 'Raum'), // wiederholte Kopfzeile als Daten
      row('Keine Vertretungen', '', '', ''),
      `<tr class="list">${cell('Seite 1 / 3')}${cell('')}${cell('')}</tr>`, // Fußzeile
      row('Keine Vertretungen', '5', '', ''), // Hinweis mit Stunde
    ].join('');
    const r = readDsbPlans([page('22.10.2026 Donnerstag', q1(G5) + junk)], NOW);
    expect(r.entries).toHaveLength(1);
    expect(r.rejected.junk).toBeGreaterThanOrEqual(3);
  });

  it('leere Einträge ohne Art, Fach, Lehrkraft, Raum und Text werden verworfen', () => {
    const r = readDsbPlans([page('22.10.2026 Donnerstag', q1(G5, row('', '3', '', ''), row('&nbsp;', '4', '---', '---')))], NOW);
    expect(r.entries).toHaveLength(1);
    expect(r.rejected.empty).toBe(2);
  });

  it('doppelte Einträge (auch über mehrere Seiten) zählen einmal', () => {
    const r = readDsbPlans([page('22.10.2026 Donnerstag (Seite 1 / 2)', q1(G5, G5)), page('22.10.2026 Donnerstag (Seite 2 / 2)', q1(G5))], NOW);
    expect(r.entries).toHaveLength(1);
    expect(r.rejected.duplicate).toBe(2);
    expect(r.complete).toEqual(['2026-10-22']);
  });

  it('Widerspruch: Entfall und Vertretung desselben Kurses zur selben Zeit werden beide verworfen', () => {
    const sub = row('Vertretung', '4 - 6', '<s>Lmn</s>?Def', 'G');
    const other = row('Vertretung', '5', '<s>Xyz</s>?Def', 'G'); // anderer Kurs (andere Lehrkraft): kein Widerspruch
    const r = readDsbPlans([page('22.10.2026 Donnerstag', q1(G5, sub, other))], NOW);
    expect(r.entries.map((e) => [e.teacher, e.kind])).toEqual([['Xyz', 'substitute']]);
    expect(r.rejected.conflict).toBe(2);
    // andere Stunde: kein Widerspruch
    const fine = readDsbPlans([page('22.10.2026 Donnerstag', q1(G5, row('Vertretung', '3', '<s>Lmn</s>?Def', 'G')))], NOW);
    expect(fine.entries).toHaveLength(2);
    expect(dropConflicts([]).removed).toBe(0);
  });
});

describe('DSB-Prüfung: Aufbau und Stand', () => {
  it('Seite ohne Tabelle, mit anderem Aufbau oder ohne Titel: nichts lesbar, nichts speichern', () => {
    expect(readDsbPlans(['<html>Wartung</html>', ''], NOW)).toMatchObject({ usable: false, problems: { no_table: 2 } });
    // Tabelle mit Zeilen, aber ohne Spalte "Stunde": Format geändert
    const changed = '<div class="mon_title">22.10.2026 Donnerstag</div><table class="mon_list"><tr><th>Kurs</th><th>Info</th></tr><tr><td>Q1</td><td>irgendwas</td></tr><tr><td>Q1</td><td>mehr</td></tr></table>';
    const r = readDsbPlans([changed], NOW);
    expect(r.usable).toBe(false);
    expect(r.problems.unreadable).toBe(1);
    expect(readDsbPlans([], NOW).usable).toBe(false);
  });

  it('eine unlesbare Seite neben einer guten stört nicht', () => {
    const r = readDsbPlans([page('22.10.2026 Donnerstag', q1(G5)), '<p>Fehler 500</p>'], NOW);
    expect(r.usable).toBe(true);
    expect(r.entries).toHaveLength(1);
    expect(r.problems.no_table).toBe(1);
  });

  it('eine Seite, die ausdrücklich nichts meldet, ist lesbar und leer', () => {
    const none = '<div class="mon_title">23.10.2026 Freitag</div><p>Keine Vertretungen</p>';
    const r = readDsbPlans([none], NOW);
    expect(r.usable).toBe(true);
    expect(r.entries).toEqual([]);
    expect(r.tables[0]).toMatchObject({ readable: true, empty: true });
    const emptyTable = '<div class="mon_title">23.10.2026 Freitag</div><table class="mon_list"><tr><th>Art</th><th>Stunde</th></tr></table>';
    expect(readDsbPlans([emptyTable], NOW)).toMatchObject({ usable: true, complete: ['2026-10-23'] });
    // "Keine Vertretungen" als Zwischenzeile in der Tabelle
    const inTable = page('23.10.2026 Freitag', `<tr class="list"><td colspan="6" class="list inline_header">Keine Vertretungen</td></tr>`);
    expect(readDsbPlans([inTable], NOW)).toMatchObject({ usable: true, entries: [] });
  });

  it('nur Pläne von gestern: nichts übernehmen', () => {
    const r = readDsbPlans([page('21.10.2026 Mittwoch', q1(G5))], NOW);
    expect(r.entries).toHaveLength(1);
    expect(r.usable).toBe(false);
  });

  it('liest den Stand aus dem Plankopf', () => {
    expect(untisStand('<p>Stand: 22.10.2026 06:51</p>')).toBe('2026-10-22T06:51');
    expect(untisStand('<p>Stand: 22.10.2026 6:05</p>')).toBe('2026-10-22T06:05');
    expect(untisStand('<p>Stand: 31.04.2026 06:51</p>')).toBeNull();
    expect(untisStand('<p>Stand: 22.10.2026 25:00</p>')).toBeNull();
    expect(untisStand('<p>kein Stand</p>')).toBeNull();
    const r = readDsbPlans([page('22.10.2026 Donnerstag', q1(G5), { stand: '22.10.2026 06:51' }), page('23.10.2026 Freitag', q1(G5), { stand: '22.10.2026 11:30' })], NOW);
    expect(r.stand).toBe('2026-10-22T11:30');
    // Stand weit in der Zukunft wird ignoriert
    expect(readDsbPlans([page('22.10.2026 Donnerstag', q1(G5), { stand: '01.01.2027 06:51' })], NOW).stand).toBeNull();
  });

  it('Seitenzahl aus dem Titel: fehlt eine Seite, ist der Tag unvollständig', () => {
    const r = readDsbPlans([page('22.10.2026 Donnerstag (Seite 1 / 3)', q1(G5)), page('22.10.2026 Donnerstag (Seite 3 / 3)', q1()), page('23.10.2026 Freitag (Seite 1 / 1)', q1(G5))], NOW);
    expect(r.incomplete).toEqual(['2026-10-22']);
    expect(r.complete).toEqual(['2026-10-23']);
    expect(parseUntisTables(page('22.10.2026 Donnerstag (Seite 2 / 3)', ''), 2026)[0].page).toEqual({ n: 2, of: 3 });
  });

  it('parseDsbStamp', () => {
    expect(parseDsbStamp('22.10.2026 18:35')).toBe('2026-10-22T18:35');
    expect(parseDsbStamp('2.1.2027 7:05')).toBe('2027-01-02T07:05');
    expect(parseDsbStamp('31.04.2026 10:00')).toBeNull();
    expect(parseDsbStamp('')).toBeNull();
    expect(parseDsbStamp(null)).toBeNull();
  });
});

describe('DSB-Prüfung: gespeicherten Stand schützen', () => {
  const e = (date: string, p: number, extra: Partial<DsbEntry> = {}): DsbEntry => ({
    date,
    periods: [p],
    kind: 'cancelled',
    art: ENTFALL,
    subject: null,
    subjectOld: 'G',
    room: null,
    roomOld: null,
    substitute: null,
    teacher: 'Lmn',
    note: null,
    group: null,
    klass: 'Q1',
    source: 'dsb',
    ...extra,
  });
  const today = '2026-10-22';
  const old = [e('2026-10-21', 2), e('2026-10-22', 5), e('2026-10-23', 3)];

  it('vollständige Tage ersetzen den alten Stand, auch durch nichts', () => {
    expect(mergeSubstitutions(old, [], { dates: ['2026-10-22', '2026-10-23'], complete: ['2026-10-22', '2026-10-23'], incomplete: [] }, false, today)).toEqual([]);
    const next = mergeSubstitutions(old, [e('2026-10-22', 6)], { dates: ['2026-10-22', '2026-10-23'], complete: ['2026-10-22', '2026-10-23'], incomplete: [] }, false, today);
    expect(next.map((x) => [x.date, x.periods[0]])).toEqual([['2026-10-22', 6]]);
  });

  it('Tage mit fehlenden Seiten behalten den alten Stand und bekommen die frischen Einträge dazu', () => {
    const next = mergeSubstitutions(old, [e('2026-10-22', 6), e('2026-10-23', 3)], { dates: ['2026-10-22', '2026-10-23'], complete: ['2026-10-23'], incomplete: ['2026-10-22'] }, true, today);
    expect(next.map((x) => [x.date, x.periods[0]])).toEqual([['2026-10-22', 5], ['2026-10-22', 6], ['2026-10-23', 3]]);
  });

  it('Tage, die im Abruf fehlen: bei unvollständigem Abruf bleiben sie, sonst hat die Schule sie entfernt', () => {
    const read = { dates: ['2026-10-22'], complete: ['2026-10-22'], incomplete: [] as string[] };
    expect(mergeSubstitutions(old, [e('2026-10-22', 5)], read, true, today).map((x) => x.date)).toEqual(['2026-10-22', '2026-10-23']);
    expect(mergeSubstitutions(old, [e('2026-10-22', 5)], read, false, today).map((x) => x.date)).toEqual(['2026-10-22']);
  });

  it('Tage vor heute fallen immer weg', () => {
    expect(mergeSubstitutions(old, [], { dates: [], complete: [], incomplete: [] }, true, '2026-10-23').map((x) => x.date)).toEqual(['2026-10-23']);
  });
});

describe('DSB-Prüfung: veraltet und nächster Schritt', () => {
  it('veraltet nach 18 Stunden oder wenn der Abruf von gestern ist und heute angezeigt wird', () => {
    const now = new Date(2026, 9, 22, 12, 0);
    expect(substitutionsStale(new Date(2026, 9, 22, 9, 0).toISOString(), now, '2026-10-22')).toBe(false);
    expect(substitutionsStale(new Date(2026, 9, 21, 20, 0).toISOString(), now, '2026-10-22')).toBe(true); // gestern Abend, heute früh kann es neu sein
    expect(substitutionsStale(new Date(2026, 9, 21, 20, 0).toISOString(), now, '2026-10-23')).toBe(false); // zeigt morgen: der Plan von gestern Abend gilt noch
    expect(substitutionsStale(new Date(2026, 9, 20, 12, 0).toISOString(), now, '2026-10-23')).toBe(true);
    expect(substitutionsStale(null, now, '2026-10-22')).toBe(true);
    expect(substitutionsStale('kaputt', now, '2026-10-22')).toBe(true);
  });

  it('Zeitplan: überspringen, leichte Prüfung, voller Abruf', () => {
    const min = 60_000;
    const now = Date.now();
    const base = { version: 'abc', ok: true, tryAt: now - 10 * min };
    const fresh = now - 30 * min;
    expect(dsbNextStep({ ...base, tryAt: now - 2 * min }, fresh, now, false)).toBe('skip'); // zu früh
    expect(dsbNextStep(base, fresh, now, false)).toBe('check');
    expect(dsbNextStep({ ...base, version: null }, fresh, now, false)).toBe('full'); // noch nie geladen
    expect(dsbNextStep(base, null, now, false)).toBe('full'); // noch nichts gespeichert
    expect(dsbNextStep(base, now - 4 * 3_600_000, now, false)).toBe('full'); // spätestens nach 3 Stunden
    expect(dsbNextStep({ ...base, ok: false, tryAt: now - 5 * min }, fresh, now, false)).toBe('skip');
    expect(dsbNextStep({ ...base, ok: false, tryAt: now - 11 * min }, fresh, now, false)).toBe('full'); // nicht übernommen: bald nochmal
    expect(dsbNextStep(base, fresh, now, true)).toBe('full');
    expect(dsbNextStep({ ...base, tryAt: now - 3_000 }, fresh, now, true)).toBe('skip'); // Doppelklick
  });
});

describe('DSB-Prüfung: Zuordnung mit Unsicherheit', () => {
  const lesson = (period: number, span: number, course: string, abbr: string, teacher: string) => ({ weekday: 3, period, span, start: '08:00', end: '09:35', course, abbr, isAdvanced: false, room: 'R1', teacher });
  const tt: Timetable = {
    validFrom: '2026-10-02',
    periods: [],
    lessons: [lesson(1, 2, 'Q1POWI_LK01', 'POWI', 'Abc'), lesson(3, 1, 'Q1M03', 'M', 'Xyz'), lesson(4, 1, 'Q1M04', 'M', 'Uvw')],
  };
  const mine = (body: string) => dsbForStudent(readDsbPlans([page('22.10.2026 Donnerstag', q1(body))], NOW), tt);

  it('Lehrkraft oder Kurscode bestätigen: sicher. Nur das Fach: unsicher, aber da', () => {
    const sure = mine(row(ENTFALL, '1 - 2', '<s>Abc</s>', '<s>POWI</s>'));
    expect(sure.mine.map((x) => x.uncertain)).toEqual([undefined]);
    const code = mine(row(ENTFALL, '3', '<s>Qrs</s>', '<s>Q1M03</s>'));
    expect(code.mine.map((x) => x.uncertain)).toEqual([undefined]);
    const unknown = mine(row('Vertretung', '3', 'Def', 'M')); // nur der Vertreter genannt
    expect(unknown.mine.map((x) => x.uncertain)).toEqual([true]);
    expect(unknown.uncertain).toBe(1);
  });

  it('Eintrag passt zu zwei eigenen Stunden desselben Fachs bei verschiedenen Lehrkräften: unsicher, nie still zugeordnet', () => {
    const two = mine(row('Vertretung', '3 - 4', 'Def', 'M'));
    expect(two.mine).toHaveLength(1);
    expect(two.mine[0].uncertain).toBe(true);
    // entscheidet die Lehrkraft, ist es sicher
    const decided = mine(row(ENTFALL, '3 - 4', '<s>Uvw</s>', '<s>M</s>'));
    expect(decided.mine[0].uncertain).toBeUndefined();
    // andere Lehrkraft und anderes Fach: verworfen
    expect(mine(row(ENTFALL, '3 - 4', '<s>Ghi</s>', '<s>M</s>')).mine).toEqual([]);
  });

  it('forStudent ohne Stundenplan lässt alles, mit Stundenplan nur Passendes', () => {
    const list = readDsbPlans([page('22.10.2026 Donnerstag', q1(row(ENTFALL, '1 - 2', '<s>Reu</s>', '<s>POWI</s>')))], NOW).entries;
    expect(forStudent(list, null)).toHaveLength(1);
    expect(forStudent(list, tt)).toEqual([]);
  });

  it('Diagnose zählt Verworfenes mit Grund', () => {
    const d = diagnoseDsb(
      [page('22.10.2026 Donnerstag', q1(row(ENTFALL, '1 - 2', '<s>Abc</s>', '<s>POWI</s>'), row(ENTFALL, '0', '<s>Abc</s>', '<s>POWI</s>'))), page('22.10.2026 Freitag', q1(G5))],
      tt,
      NOW,
    );
    expect(d).toMatchObject({ pages: 2, recognized: 1, total: 1, mine: 1, rejected: { periods: 1, date: 1 }, problems: { date_weekday: 1 }, stand: '2026-10-22T14:25' });
  });
});
