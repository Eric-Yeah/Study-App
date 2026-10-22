import { describe, expect, it } from 'vitest';
import { classMatches, dsbField, dsbTitleDate, forStudent, ownLevels, parseUntisPlan, splitStruck } from './dsbPlan';
import { dayView, parseTimetable, subjectMatchesAbbr, type Timetable } from './lanisPlans';

// Erfundener Plan im Aufbau von Untis (subst_001.htm), zwei Tage und eine Seite zweimal.
const rows = (day: string) =>
  `<div class="mon_title">${day}</div>
<table class="mon_head"><tr><td><p><span>Stand: </span>22.10.2026 06:51</p></td></tr></table>
<table class="mon_list">
<tr class="list"><th class="list">Klasse(n)</th><th class="list">Stunde</th><th class="list">Fach</th><th class="list">(Fach)</th><th class="list">Raum</th><th class="list">Vertreter</th><th class="list">(Lehrer)</th><th class="list">Art</th><th class="list">Vertretungs-Text</th></tr>
<tr class="list odd"><td class="list"><b>Q1</b></td><td class="list">3 - 4</td><td class="list">M</td><td class="list">M</td><td class="list">C010</td><td class="list">Abc</td><td class="list">Xyz</td><td class="list">Vertretung</td><td class="list">Aufgaben im Heft</td></tr>
<tr class="list even"><td class="list">Q1, Q2</td><td class="list">5</td><td class="list">---</td><td class="list">E</td><td class="list">&nbsp;</td><td class="list">&nbsp;</td><td class="list">Def</td><td class="list">Entfall</td><td class="list">&nbsp;</td></tr>
<tr class="list odd"><td class="list">8b</td><td class="list">3</td><td class="list">M</td><td class="list">M</td><td class="list">A1</td><td class="list">Abc</td><td class="list">Xyz</td><td class="list">Vertretung</td><td class="list">&nbsp;</td></tr>
</table>`;
const page = rows('22.10.2026 Donnerstag') + rows('23.10.2026 Freitag, Woche B');

describe('DSBmobile: Untis-Plan lesen', () => {
  it('liest das Datum aus dem Titel', () => {
    expect(dsbTitleDate('22.10.2026 Donnerstag', 2026)).toBe('2026-10-22');
    expect(dsbTitleDate('2.3. Montag', 2027)).toBe('2027-03-02');
    expect(dsbTitleDate('Montag', 2026)).toBeNull();
  });

  it('erkennt Spalten an der Überschrift, eingeklammerte sind die alten Werte', () => {
    expect(dsbField('Klasse(n)')).toBe('klass');
    expect(dsbField('Fach')).toBe('subject');
    expect(dsbField('(Fach)')).toBe('subjectOld');
    expect(dsbField('(Raum)')).toBe('roomOld');
    expect(dsbField('Vertreter')).toBe('substitute');
    expect(dsbField('(Lehrer)')).toBe('teacher');
    expect(dsbField('Vertretungs-Text')).toBe('note');
    expect(dsbField('Irgendwas')).toBeNull();
  });

  it('liest Einträge beider Tage, gleiche Zeilen nur einmal', () => {
    const list = parseUntisPlan(page + rows('22.10.2026 Donnerstag'), 2026);
    expect(list).toHaveLength(6);
    const first = list[0];
    expect(first).toMatchObject({
      date: '2026-10-22',
      periods: [3, 4],
      kind: 'substitute',
      subject: 'M',
      room: 'C010',
      substitute: 'Abc',
      teacher: 'Xyz',
      klass: 'Q1',
      note: 'Aufgaben im Heft',
      source: 'dsb',
    });
    const gone = list.find((e) => e.periods[0] === 5)!;
    expect(gone).toMatchObject({ kind: 'cancelled', subject: null, subjectOld: 'E', klass: 'Q1, Q2', room: null });
    expect(list.filter((e) => e.date === '2026-10-23')).toHaveLength(3);
  });

  it('übersteht Seiten ohne Tabelle und ohne Datum', () => {
    expect(parseUntisPlan('<html>Keine Vertretungen</html>')).toEqual([]);
    expect(parseUntisPlan('<table class="mon_list"><tr><th>Stunde</th></tr><tr><td>1</td><td>x</td></tr></table>')).toEqual([]);
  });
});

describe('DSBmobile: nur die eigenen Stunden', () => {
  // Eigener Plan: Donnerstag 3. und 4. Stunde Mathe (Q1M03, Lehrkraft Xyz), 5. Stunde Deutsch
  const cell = (course: string, teacher: string) => `<div class="stunde"><b>${course}</b> R1 <br /><small>${teacher}</small></div>`;
  const label = (n: number, from: string, to: string) => `<td><span><small>${from} - ${to}</small></span><span> ${n}. </span></td>`;
  const none = '<td>&nbsp;</td>';
  const tt = parseTimetable(
    `<h2>Persönlicher Stundenplan</h2> gültig ab 01.08.2026 <table><thead><tr><th>Stunde</th><th>Mo</th><th>Di</th><th>Mi</th><th>Do</th><th>Fr</th></tr></thead><tbody>
<tr>${label(3, '09:55', '10:40')}${none}${none}${none}<td rowspan="2">${cell('Q1M03', 'Xyz')}</td>${none}</tr>
<tr>${label(4, '10:40', '11:25')}${none}${none}${none}${none}</tr>
<tr>${label(5, '11:45', '12:30')}${none}${none}${none}<td>${cell('Q1D02', 'Abc')}</td>${none}</tr></tbody></table>`,
  );

  it('erkennt die Stufe aus den Kurscodes', () => {
    expect(ownLevels(tt)).toEqual(['Q1']);
    expect(classMatches('Q1, Q2', ['Q1'])).toBe(true);
    expect(classMatches('Q1', ['Q1'])).toBe(true);
    expect(classMatches('8b', ['Q1'])).toBe(false);
    expect(classMatches(null, ['Q1'])).toBe(true);
    expect(classMatches('8b', [])).toBe(true);
  });

  it('ordnet Fächer zu', () => {
    expect(subjectMatchesAbbr('M', 'M')).toBe(true);
    expect(subjectMatchesAbbr('Mathe', 'M')).toBe(true);
    expect(subjectMatchesAbbr('M-GK1', 'M')).toBe(true);
    expect(subjectMatchesAbbr('Ethik', 'E')).toBe(false);
    expect(subjectMatchesAbbr('Englisch', 'E')).toBe(true);
    expect(subjectMatchesAbbr('D', 'M')).toBe(false);
  });

  it('behält nur Einträge der eigenen Stufe, die zu einer eigenen Stunde passen', () => {
    const list = parseUntisPlan(rows('22.10.2026 Donnerstag'), 2026); // Donnerstag
    const mine = forStudent(list, tt);
    expect(mine.map((e) => [e.periods[0], e.klass])).toEqual([[3, 'Q1']]); // 8b raus, Englisch in der 5. nicht mein Fach
    expect(forStudent(list, null)).toHaveLength(3);
  });

  it('nimmt Einträge zu eigenen Stunden auch über die Lehrkraft, wenn das Fach anders heißt', () => {
    const list = parseUntisPlan(rows('22.10.2026 Donnerstag').replace(/<td class="list">M<\/td><td class="list">M<\/td>/, '<td class="list">GK1</td><td class="list">GK1</td>'), 2026);
    expect(forStudent(list, tt).map((e) => e.periods[0])).toEqual([3]);
  });
});

describe('DSBmobile: Fehlersuche', () => {
  const tt = parseTimetable(
    `<h2>Persönlicher Stundenplan</h2> gültig ab 01.08.2026 <table><thead><tr><th>Stunde</th><th>Mo</th><th>Di</th><th>Mi</th><th>Do</th><th>Fr</th></tr></thead><tbody>
<tr><td><span><small>09:55 - 10:40</small></span><span> 3. </span></td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td><div class="stunde"><b>Q1M03</b> R1 <br /><small>Xyz</small></div></td><td>&nbsp;</td></tr></tbody></table>`,
  );
  it('zählt, was im Plan stand und warum etwas nicht passt', async () => {
    const { diagnoseDsb, dsbSample } = await import('./dsbPlan');
    const html = `<div class="mon_title">22.10.2026 Donnerstag</div><table class="mon_list"><tr><th>Klasse(n)</th><th>Stunde</th><th>Fach</th></tr>
<tr><td>Q1</td><td>3</td><td>M</td></tr><tr><td>Q1</td><td>6</td><td>M</td></tr><tr><td>Q1</td><td>3</td><td>G</td></tr><tr><td>8b</td><td>3</td><td>M</td></tr></table>`;
    const d = diagnoseDsb([html, '<p>fremd</p>'], tt, 2026);
    expect(d).toMatchObject({ pages: 2, recognized: 1, total: 4, levels: ['Q1'], ofLevel: 3, mine: 1, dropped: { klass: 1, lesson: 1, subject: 1 } });
    expect(d.headers).toEqual(['Klasse(n)', 'Stunde', 'Fach']);
    expect(dsbSample([html])).toContain('mon_list');
    expect(dsbSample(['<p>nichts</p>'])).toBe('');
  });
});

describe('DSBmobile: nach Klassen gruppierter Plan mit durchgestrichenen Werten', () => {
  const cell = (c: string, t: string) => `<div class="stunde"><b>${c}</b> R1 <br /><small>${t}</small></div>`;
  const label = (n: number, from: string, to: string) => `<td><span><small>${from} - ${to}</small></span><span> ${n}. </span></td>`;
  const none = '<td>&nbsp;</td>';
  // Donnerstag: 5. Stunde Geschichte bei Lor, 3. und 4. Stunde Mathe bei Xyz
  const tt = parseTimetable(
    `<h2>Persönlicher Stundenplan</h2> gültig ab 01.08.2026 <table><thead><tr><th>Stunde</th><th>Mo</th><th>Di</th><th>Mi</th><th>Do</th><th>Fr</th></tr></thead><tbody>
<tr>${label(3, '09:55', '10:40')}${none}${none}${none}<td rowspan="2">${cell('Q1M03', 'Xyz')}</td>${none}</tr>
<tr>${label(4, '10:40', '11:25')}${none}${none}${none}${none}</tr>
<tr>${label(5, '11:45', '12:30')}${none}${none}${none}<td>${cell('Q1G05', 'Lor')}</td>${none}</tr></tbody></table>`,
  );
  const st = (x: string) => `<td class="list"><s>${x}</s></td>`;
  const row = (art: string, periods: string, teacher: string, subject: string) =>
    `<tr class="list odd"><td class="list">${art}</td><td class="list">${periods}</td>${st(teacher)}${st(subject)}<td class="list">---</td><td class="list">&nbsp;</td></tr>`;
  const body = `<tr class="list"><td class="list inline_header" colspan="6">Q1 Q1</td></tr>
${row('Eigenverantwortliches Arbeiten', '1 - 2', 'Reu', 'POWI')}${row('Eigenverantwortliches Arbeiten', '5', 'Lor', 'G')}${row('Eigenverantwortliches Arbeiten', '6', 'Saa', 'Q1INFO_LK01')}
<tr class="list"><td class="list inline_header" colspan="6">Q3 Q3</td></tr>
${row('Eigenverantwortliches Arbeiten', '3 - 4', 'Nör', 'D')}`;
  const head = '<tr class="list"><th>Art</th><th>Stunde</th><th>(Lehrer)</th><th>(Fach)</th><th>Raum</th><th>Text</th></tr>';
  const page = (withHead: boolean) => `<div class="mon_title">22.10.2026 Donnerstag</div><table class="mon_list">${withHead ? head : ''}${body}</table>`;

  for (const withHead of [true, false]) {
    it(`liest Klasse aus der Zwischenzeile und alte Werte (${withHead ? 'mit' : 'ohne'} Kopfzeile)`, () => {
      const list = parseUntisPlan(page(withHead), 2026);
      expect(list).toHaveLength(4);
      expect(list[0]).toMatchObject({ periods: [1, 2], klass: 'Q1', kind: 'cancelled', subject: null, subjectOld: 'POWI', teacher: 'Reu', room: null });
      expect(list.find((e) => e.periods[0] === 3)).toMatchObject({ klass: 'Q3', subjectOld: 'D' });
    });

    it(`zeigt dir nur den Entfall in Geschichte bei Lor (${withHead ? 'mit' : 'ohne'} Kopfzeile)`, () => {
      const mine = forStudent(parseUntisPlan(page(withHead), 2026), tt);
      expect(mine.map((e) => [e.periods[0], e.subjectOld, e.kind])).toEqual([[5, 'G', 'cancelled']]);
    });
  }

  it('Kurscode als Fach passt zum Fachkürzel', () => {
    expect(subjectMatchesAbbr('Q1INFO_LK01', 'INFO')).toBe(true);
    expect(subjectMatchesAbbr('Q1INFO_LK01', 'M')).toBe(false);
  });
});

describe('DSBmobile: Lehrkraft und Kurscode abgleichen (Aufbau wie im echten Plan, Namen erfunden)', () => {
  const lesson = (weekday: number, period: number, span: number, course: string, abbr: string, teacher: string) => ({
    weekday,
    period,
    span,
    start: '08:00',
    end: '09:35',
    course,
    abbr,
    isAdvanced: false,
    room: 'R1',
    teacher,
  });
  // Donnerstag (weekday 3): 1.-2. POWI bei Abc (Doppelstunde), 3. Mathe bei Xyz, 5. Geschichte bei Lmn, 6. Info bei Qrs
  const tt: Timetable = {
    validFrom: '2026-10-02',
    periods: [],
    lessons: [
      lesson(3, 1, 2, 'Q1POWI_LK01', 'POWI', 'Abc'),
      lesson(3, 3, 1, 'Q1M03', 'M', 'Xyz'),
      lesson(3, 5, 1, 'Q1G05', 'G', 'Lmn'),
      lesson(3, 6, 1, 'Q1INFO_LK01', 'INFO', 'Qrs'),
    ],
  };
  const cell = (inner: string) => `<td class="list" align="center">${inner}</td>`;
  const row = (art: string, periods: string, teacher: string, subject: string, room = '---') =>
    `<tr class="list odd">${cell(art)}${cell(periods)}${cell(teacher)}${cell(subject)}${cell(room)}${cell('&nbsp;')}</tr>`;
  const plan = (rowsHtml: string, klass = 'Q1') =>
    `<div class="mon_title">22.10.2026 Donnerstag (Seite 1 / 3)</div><table class="mon_list"><tr class="list"><th>Art</th><th>Stunde</th><th>Vertreter</th><th>Fach</th><th>Raum</th><th>Text</th></tr>` +
    `<tr class="list"><td class="list inline_header" colspan="6">${klass}  ${klass}</td></tr>${rowsHtml}</table>`;
  const keep = (rowsHtml: string, klass?: string) => forStudent(parseUntisPlan(plan(rowsHtml, klass), 2026), tt);
  const ENTFALL = 'Eigenverantwortliches Arbeiten';

  it('liest die alte Lehrkraft aus der durchgestrichenen Spalte "Vertreter" und den Vertreter dahinter', () => {
    expect(splitStruck('<s>Ker</s>?maa')).toEqual({ old: 'Ker', now: 'maa' });
    expect(splitStruck('<span style="color: #000080"><s>C104</s>→C008</span>')).toEqual({ old: 'C104', now: 'C008' });
    expect(splitStruck('<s>Pet</s>')).toEqual({ old: 'Pet', now: '' });
    expect(splitStruck('Cyb')).toEqual({ old: '', now: 'Cyb' });
    const [e] = parseUntisPlan(plan(row('Vertretung', '3', '<s>Xyz</s>?Def', 'M', '<s>C010</s>?A107')), 2026);
    expect(e).toMatchObject({ kind: 'substitute', teacher: 'Xyz', substitute: 'Def', subject: 'M', subjectOld: null, room: 'A107', roomOld: 'C010' });
    const [gone] = parseUntisPlan(plan(row(ENTFALL, '5', '<s>Lmn</s>', '<s>G</s>')), 2026);
    expect(gone).toMatchObject({ kind: 'cancelled', teacher: 'Lmn', substitute: null, subject: null, subjectOld: 'G' });
    const [moved] = parseUntisPlan(plan(row('Raum-Vtr.', '3', 'Xyz', 'M', '<s>C010</s>?A107')), 2026);
    expect(moved).toMatchObject({ kind: 'room', teacher: 'Xyz', substitute: null, room: 'A107', roomOld: 'C010' });
    const [swap] = parseUntisPlan(plan(row('Tausch', '3', '<s>Xyz</s>?Def', '<s>M</s>?E')), 2026);
    expect(swap).toMatchObject({ subject: 'E', subjectOld: 'M', teacher: 'Xyz', substitute: 'Def' });
  });

  it('gleiches Fach, andere Lehrkraft: verworfen', () => {
    // POWI von Reu fällt aus, aber mein POWI-Kurs hat Abc
    expect(keep(row(ENTFALL, '1 - 2', '<s>Reu</s>', '<s>POWI</s>'))).toEqual([]);
    expect(keep(row('Vertretung', '1 - 2', '<s>Reu</s>?Def', 'POWI'))).toEqual([]);
  });

  it('gleiches Fach, gleiche Lehrkraft: behalten (auch ohne Groß- und Kleinschreibung)', () => {
    expect(keep(row(ENTFALL, '5', '<s>Lmn</s>', '<s>G</s>')).map((e) => e.periods)).toEqual([[5]]);
    expect(keep(row(ENTFALL, '5', '<s>LMN</s>', '<s>G</s>')).map((e) => e.periods)).toEqual([[5]]);
    expect(keep(row('Vertretung', '3', '<s>xyz</s>?Def', 'M')).map((e) => e.substitute)).toEqual(['Def']);
  });

  it('Kurscode im Plan gleich meinem Kurscode: behalten, anderer Kurscode desselben Fachs: verworfen', () => {
    expect(keep(row(ENTFALL, '6', '<s>Nop</s>', '<s>Q1INFO_LK01</s>')).map((e) => e.periods)).toEqual([[6]]); // Kurs gleich, Lehrkraft egal
    expect(keep(row(ENTFALL, '6', '<s>Nop</s>', '<s>Q1INFO_LK02</s>'))).toEqual([]);
    expect(keep(row(ENTFALL, '6', '<s>Qrs</s>', '<s>Q1INFO_LK02</s>')).map((e) => e.periods)).toEqual([[6]]); // gleiche Lehrkraft zur gleichen Zeit
    expect(keep(row(ENTFALL, '6', '', '<s>INFO</s>')).map((e) => e.periods)).toEqual([[6]]);
  });

  it('Lehrkraft unbekannt: das Fach entscheidet', () => {
    expect(keep(row('Vertretung', '3', 'Def', 'M')).map((e) => e.periods)).toEqual([[3]]); // nur der Vertreter genannt
    expect(keep(row('Vertretung', '3', 'Def', 'G'))).toEqual([]); // anderes Fach
    expect(keep(row(ENTFALL, '5', '', '<s>G</s>')).map((e) => e.periods)).toEqual([[5]]);
  });

  it('Raumwechsel: die Lehrkraft in der Spalte "Vertreter" ist die bekannte', () => {
    expect(keep(row('Raum-Vtr.', '3', 'Xyz', 'M', '<s>C010</s>?A107')).map((e) => [e.periods, e.room])).toEqual([[[3], 'A107']]);
    expect(keep(row('Raum-Vtr.', '3', 'Def', 'M', '<s>C010</s>?A107'))).toEqual([]);
  });

  it('Doppelstunde: Stunde 1 - 2 trifft die Doppelstunde, auch wenn nur eine Stunde im Plan steht', () => {
    expect(keep(row(ENTFALL, '1 - 2', '<s>Abc</s>', '<s>POWI</s>')).map((e) => e.periods)).toEqual([[1, 2]]);
    expect(keep(row(ENTFALL, '2', '<s>Abc</s>', '<s>POWI</s>')).map((e) => e.periods)).toEqual([[2]]);
    expect(keep(row(ENTFALL, '2 - 3', '<s>Abc</s>', '<s>POWI</s>')).map((e) => e.periods)).toEqual([[2, 3]]);
  });

  it('Eintrag ohne Fach: die Lehrkraft entscheidet, ohne beides die Zeit', () => {
    expect(keep(row(ENTFALL, '3', '<s>Xyz</s>', '')).map((e) => e.periods)).toEqual([[3]]);
    expect(keep(row(ENTFALL, '3', '<s>Def</s>', ''))).toEqual([]);
    expect(keep(row(ENTFALL, '3', '', '')).map((e) => e.periods)).toEqual([[3]]);
  });

  it('Stunden ohne eigenen Kurs, andere Stufe und mehrere Klassen', () => {
    expect(keep(row(ENTFALL, '4', '<s>Xyz</s>', '<s>M</s>'))).toEqual([]); // 4. Stunde habe ich frei
    expect(keep(row(ENTFALL, '3', '<s>Xyz</s>', '<s>M</s>'), 'Q3')).toEqual([]);
    expect(keep(row(ENTFALL, '3', '<s>Xyz</s>', '<s>M</s>'), 'Q1, Q2').map((e) => e.periods)).toEqual([[3]]);
  });

  it('Tausch: es reicht, wenn das alte oder das neue Fach zu meinem Kurs passt', () => {
    expect(keep(row('Tausch', '3', '<s>Xyz</s>?Def', '<s>M</s>?E')).map((e) => e.subjectOld)).toEqual(['M']);
    expect(keep(row('Tausch', '3', '<s>Ghi</s>?Def', '<s>M</s>?E'))).toEqual([]);
  });

  it('die Tagesansicht ordnet nach Kurs und Lehrkraft zu, nichts Fremdes bleibt unter "Weitere Änderungen"', () => {
    const entries = parseUntisPlan(
      plan(
        row(ENTFALL, '1 - 2', '<s>Reu</s>', '<s>POWI</s>') +
          row(ENTFALL, '5', '<s>Lmn</s>', '<s>G</s>') +
          row(ENTFALL, '6', '<s>Nop</s>', '<s>Q1INFO_LK02</s>'),
      ),
      2026,
    );
    // alle drei ungefiltert: nur Geschichte gehört zu einer Stunde, POWI (Reu) und Info LK02 bleiben übrig
    const raw = dayView(tt, entries, [], '2026-10-22');
    expect(raw.lessons.filter((l) => l.substitutions.length > 0).map((l) => l.lesson.abbr)).toEqual(['G']);
    expect(raw.unmatched.map((e) => e.subjectOld)).toEqual(['POWI', 'Q1INFO_LK02']);
    // gefiltert (so ruft die App es auf): nichts bleibt übrig
    const mine = dayView(tt, forStudent(entries, tt), [], '2026-10-22');
    expect(mine.lessons.flatMap((l) => l.substitutions).map((e) => e.subjectOld)).toEqual(['G']);
    expect(mine.unmatched).toEqual([]);
  });
});
