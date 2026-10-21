import { describe, expect, it } from 'vitest';
import {
  courseAbbr,
  dayView,
  extractPersonalTimetable,
  freePeriodsOn,
  lessonsOn,
  parsePeriods,
  parseSubstitutions,
  parseTimetable,
  recentLesson,
  splitFreePeriods,
  substitutionKind,
  weekdayIndex,
} from './lanisPlans';

// Erfundener Stundenplan im Aufbau der Lanis-Seite (Gesamtplan zuerst, dann der persönliche Plan).
const lesson = (course: string, room: string, teacher: string) =>
  `<div class="stunde " data-mix="x" title="${course} im Raum ${room}"> <b>${course}</b>\n   ${room}\n <br /><small>\n ${teacher}\n </small> </div>`;
const label = (n: number, word: string, from: string, to: string) =>
  `<td> <span class="hidden-xs print-show"> <b>${word} Stunde</b><br /> <span class="VonBis"> <small>${from} - ${to}</small></span> </span> <span class="hidden-sm hidden-lg hidden-md hidden-print" title="${word} Stunde"> ${n}. </span> </td>`;
const empty = '<td >&nbsp;</td>';
const head =
  '<table class="table"><thead><tr><th>Stunde</th><th>Montag</th><th>Dienstag</th><th>Mittwoch</th><th>Donnerstag</th><th>Freitag</th></tr></thead><tbody>';

const personal = `<h2>Persönlicher Stundenplan für Muster, Max (Q2_Test)</h2> Hinweistext <span> Stundenplan gültig&nbsp; ab 02.10.2026 </span>
${head}
<tr><td> </td>${empty.repeat(5)}</tr>
<tr>${label(1, 'erste', '08:00', '08:45')}
  <td rowspan="2">${lesson('Q2G05', 'C103', 'Abc')}</td>${empty}<td rowspan="2">${lesson('Q2M03', 'C010', 'Xyz')}</td>${empty}${empty}</tr>
<tr>${label(2, 'zweite', '08:50', '09:35')}${empty}${empty}${empty}</tr>
<tr>${label(3, 'dritte', '09:55', '10:40')}
  ${empty}${empty}${empty}${empty}${empty}</tr>
<tr>${label(4, 'vierte', '10:45', '11:30')}
  <td>${lesson('Q2POWI_LK01', 'C005', 'Web')}${lesson('Q2ETHI03', 'C011', 'Max')}</td>${empty}${empty}${empty}${empty}</tr>
</tbody></table>`;

const page = `<h2>Gesamtplan der Q2_Test</h2><table class="table"><tbody><tr>${label(1, 'erste', '08:00', '08:45')}<td>${lesson('Q2XX99', 'A1', 'Nop')}</td></tr></tbody></table>
${personal}<div>Fußzeile</div>`;

describe('courseAbbr', () => {
  it('liest das Fachkürzel aus dem Kurscode', () => {
    expect(courseAbbr('Q1POWI_LK01')).toBe('POWI');
    expect(courseAbbr('Q1G05')).toBe('G');
    expect(courseAbbr('Q1E_LK01')).toBe('E');
    expect(courseAbbr('Q2BIO_Bili01')).toBe('BIO');
    expect(courseAbbr('Q1ETHI03')).toBe('ETHI');
  });
});

describe('Stundenplan', () => {
  it('schneidet den persönlichen Plan aus der Seite', () => {
    const section = extractPersonalTimetable(page)!;
    expect(section.startsWith('Persönlicher Stundenplan')).toBe(true);
    expect(section).not.toContain('Q2XX99'); // Gesamtplan bleibt draußen
    expect(section).not.toContain('Fußzeile');
    expect(extractPersonalTimetable('<h2>Gesamtplan</h2>')).toBeNull();
  });

  const tt = parseTimetable(extractPersonalTimetable(page)!);

  it('liest Gültigkeit und Stundenzeiten', () => {
    expect(tt.validFrom).toBe('2026-10-02');
    expect(tt.periods.map((p) => [p.period, p.start, p.end])).toEqual([
      [1, '08:00', '08:45'],
      [2, '08:50', '09:35'],
      [3, '09:55', '10:40'],
      [4, '10:45', '11:30'],
    ]);
  });

  it('liest Kurse mit Raum und Lehrkraft, auch Doppelstunden über rowspan', () => {
    const mo = tt.lessons.filter((l) => l.weekday === 0);
    expect(mo.map((l) => l.course)).toEqual(['Q2G05', 'Q2ETHI03', 'Q2POWI_LK01']);
    const g = mo.find((l) => l.course === 'Q2G05')!;
    expect(g).toMatchObject({ period: 1, span: 2, start: '08:00', end: '09:35', room: 'C103', teacher: 'Abc', abbr: 'G', isAdvanced: false });
    const m = tt.lessons.find((l) => l.course === 'Q2M03')!;
    expect(m).toMatchObject({ weekday: 2, period: 1, span: 2 }); // Mittwoch, die Zelle darunter wurde übersprungen
    expect(tt.lessons.find((l) => l.course === 'Q2POWI_LK01')?.isAdvanced).toBe(true);
  });

  it('zwei Kurse in einer Zelle bleiben beide erhalten', () => {
    const p4 = tt.lessons.filter((l) => l.period === 4 && l.weekday === 0);
    expect(p4.map((l) => l.course).sort()).toEqual(['Q2ETHI03', 'Q2POWI_LK01']);
  });

  it('Tagesansicht, Wochenende und Gültigkeitsbeginn', () => {
    expect(weekdayIndex('2026-10-05')).toBe(0); // Montag
    expect(lessonsOn(tt, '2026-10-05').length).toBe(3);
    expect(lessonsOn(tt, '2026-10-10')).toEqual([]); // Samstag
    expect(lessonsOn(tt, '2026-09-28')).toEqual([]); // vor Gültigkeit
  });

  it('Freistunden liegen zwischen der ersten und letzten Stunde', () => {
    // Montag: 1-2 (G), 4 (zwei Kurse) -> Stunde 3 ist frei
    expect(freePeriodsOn(tt, '2026-10-05').map((p) => p.period)).toEqual([3]);
    // Mittwoch: nur 1-2 -> keine Freistunde
    expect(freePeriodsOn(tt, '2026-10-07')).toEqual([]);
  });
});

describe('Vertretungsplan', () => {
  it('liest Stunden, Bereiche und Datumsformate', () => {
    expect(parsePeriods('3')).toEqual([3]);
    expect(parsePeriods('3 - 5')).toEqual([3, 4, 5]);
    expect(parsePeriods('1 - 99999999999').length).toBe(21);
    expect(parsePeriods('3, 4')).toEqual([3, 4]);
    expect(parsePeriods(undefined)).toEqual([]);
  });

  it('erkennt Entfall, Raumwechsel und Vertretung', () => {
    expect(substitutionKind({ art: 'Entfall', note: null, substitute: null, room: null, roomOld: null })).toBe('cancelled');
    expect(substitutionKind({ art: 'Raumvertretung', note: null, substitute: null, room: 'C1', roomOld: 'C2' })).toBe('room');
    expect(substitutionKind({ art: null, note: null, substitute: 'Abc', room: 'C1', roomOld: 'C1' })).toBe('substitute');
    expect(substitutionKind({ art: 'Sonstiges', note: null, substitute: null, room: null, roomOld: null })).toBe('other');
  });

  it('wandelt Einträge um, ist tolerant und sortiert nach Stunde', () => {
    const list = parseSubstitutions('07.10.2026', [
      { Stunde: '4', Art: 'Vertretung', Fach: 'M', Vertreter: 'Abc', Raum: 'C1', Raum_alt: 'C2', Hinweis: 'Aufgaben im Moodle' },
      { Stunde: '1 - 2', Art: 'Entfall', Fach: 'G', Lerngruppe: 'Q2G05' },
    ]);
    expect(list.map((e) => e.periods)).toEqual([[1, 2], [4]]);
    expect(list[0]).toMatchObject({ date: '2026-10-07', kind: 'cancelled', subject: 'G', group: 'Q2G05' });
    expect(list[1]).toMatchObject({ kind: 'substitute', substitute: 'Abc', note: 'Aufgaben im Moodle' });
    expect(parseSubstitutions('07.10.2026', -1)).toEqual([]);
    expect(parseSubstitutions('kaputt', [{}])).toEqual([]);
  });

  it('ordnet Vertretungen den Stunden des Tages zu', () => {
    const tt = parseTimetable(extractPersonalTimetable(page)!);
    const subs = parseSubstitutions('05.10.2026', [
      { Stunde: '1 - 2', Art: 'Entfall', Fach: 'G', Lerngruppe: 'Q2G05' },
      { Stunde: '9', Art: 'Vertretung', Fach: 'X' },
    ]);
    const view = dayView(tt, subs, [{ id: 'g', name: 'Geschichte' }, { id: 'p', name: 'Politik und Wirtschaft' }], '2026-10-05');
    const g = view.lessons.find((l) => l.lesson.course === 'Q2G05')!;
    expect(g.subjectId).toBe('g');
    expect(g.substitutions.length).toBe(1);
    expect(view.lessons.find((l) => l.lesson.course === 'Q2POWI_LK01')?.substitutions).toEqual([]);
    expect(view.unmatched.length).toBe(1); // Stunde 9 passt zu keiner Stunde
  });
});

describe('Mittagspause', () => {
  const mk = (lessons: [number, number][], n = 9) => ({
    validFrom: null,
    periods: Array.from({ length: n }, (_, i) => ({ period: i + 1, start: `${8 + i}:00`.padStart(5, '0'), end: `${8 + i}:45`.padStart(5, '0') })),
    lessons: lessons.map(([period, span]) => ({
      weekday: 0, period, span, start: '', end: '', course: 'Q1M01', abbr: 'M', isAdvanced: false, room: 'A1', teacher: 'Abc',
    })),
  });
  const monday = '2026-10-05';

  it('die Freistunde zwischen 6. und 8. Stunde ist Mittagspause', () => {
    const tt = mk([[1, 2], [6, 1], [8, 1]]); // Stunden 3-5 und 7 sind frei
    const { study, lunch } = splitFreePeriods(tt, monday);
    expect(lunch.map((p) => p.period)).toEqual([7]);
    expect(study.map((p) => p.period)).toEqual([3, 4, 5]);
  });

  it('andere Freistunden bleiben Lernzeit, auch am Nachmittag ohne Unterricht danach', () => {
    const tt = mk([[1, 1], [4, 1]]); // 2 und 3 frei
    expect(splitFreePeriods(tt, monday)).toEqual({ study: expect.any(Array), lunch: [] });
    expect(splitFreePeriods(tt, monday).study.map((p) => p.period)).toEqual([2, 3]);
    // 7. Stunde frei, aber nach der 6. endet der Tag: keine Freistunde, keine Mittagspause
    expect(splitFreePeriods(mk([[1, 6]]), monday)).toEqual({ study: [], lunch: [] });
  });

  it('die Grenzen sind einstellbar', () => {
    const tt = mk([[1, 1], [5, 1]]); // 2-4 frei
    const { study, lunch } = splitFreePeriods(tt, monday, { lunchAfterPeriod: 2, lunchBeforePeriod: 5 });
    expect(lunch.map((p) => p.period)).toEqual([3, 4]);
    expect(study.map((p) => p.period)).toEqual([2]);
  });
});

describe('recentLesson (Fachvorauswahl)', () => {
  const tt = parseTimetable(extractPersonalTimetable(page)!);
  // Montag 2026-10-05: G 08:00-09:35 (Stunden 1-2), Freistunde 3, POWI+ETHI 10:45-11:30 (Stunde 4)
  const monday = '2026-10-05';

  it('mitten im Unterricht die laufende Stunde', () => {
    expect(recentLesson(tt, monday, '08:30')?.abbr).toBe('G');
  });

  it('danach die zuletzt beendete Stunde', () => {
    expect(recentLesson(tt, monday, '10:00')?.abbr).toBe('G'); // Freistunde, davor Geschichte
    expect(['POWI', 'ETHI']).toContain(recentLesson(tt, monday, '12:00')?.abbr);
  });

  it('vor dem ersten Unterricht die erste Stunde, ohne Unterricht null', () => {
    expect(recentLesson(tt, monday, '07:00')?.abbr).toBe('G');
    expect(recentLesson(tt, '2026-10-10', '10:00')).toBeNull(); // Samstag
  });
});
