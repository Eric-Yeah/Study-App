import { describe, expect, it } from 'vitest';
import { buildHomework, courseBase, readHomework, diagnoseBooks, dueDateFor, fileKey, importableType, newFiles, parseCourseBook, planHomework, subjectForCourse } from './homework';
import type { Timetable } from './lanisPlans';

// Erfundene Kursseite im Aufbau der echten Seiten von "Mein Unterricht" (meinunterricht.php?a=sus_view&id=…)
const hw = (state: 'done' | 'undone', text: string) => `<i class="fas fa-home" title="Hausaufgaben"></i> <span class="homework">
  <span class="done${state === 'done' ? ' ' : ' hidden'}"><span class="label label-success">Hausaufgabe erledigt</span> <a href="" class="btn"><i class="fa fa-undo"></i></a></span>
  <span class="undone${state === 'undone' ? ' ' : ' hidden'}"><span class="label label-danger">Hausaufgabe unerledigt</span> <a href="" class="btn"><i class="fa fa-check-square-o"></i></a></span>
 </span><br/> <span class="markup">${text}</span><br>`;

const files = (entry: string, list: [string, string, string][]) => `<div class="alert alert-info"><b><i class="fa fa-paperclip fa-fw"></i> Anhänge:</b>
 <a class="btn btn-default btn-sm" href="meinunterricht.php?a=downloadFile&b=zip&id=6829&e=${entry}" target="_blank">alle downloaden</a>
 <div class="files">${list
   .map(([ext, name, size]) => `<div class="file" data-extension="${ext}" data-file="${name}"><a href="#" target="_blank"><span class="fa"></span> ${name} <small>(${size})</small></a></div>`)
   .join('')}</div></div>`;

const row = (id: string, date: string, slot: string, topic: string, extra: string) => `<tr data-entry="${id}"><td><a id="eintrag${date}"></a>${date}<br/><small>${slot}</small></td>
 <td><b>${topic}</b><br/>${extra}</td><td><encoded></encoded></td></tr>`;

const page = (rows: string) => `<html><body><h1 data-book="6829" data-usertype="Teilnehmer"> Biologie GK 12 a <small><span class="label label-info">1. Halbjahr</span></small></h1>
<div class="btn-group"><button type="button" class="btn dropdown-toggle" title="Stauch, Saskia Katharina (Stc)"><i class="fa fa-user"></i> Stc</button></div>
<div class="tab-pane" id="history"><div id="old"><table><thead><tr><th>Datum</th><th>Thema</th><th>Anwesenheit</th></tr></thead><tbody>${rows}</tbody></table></div></div></body></html>`;

const html = page(
  [
    row('16', '02.10.2026', '5. - 6. Stunde', 'Entfall (Ferienbeginn)', ''),
    row('15', '29.09.2026', '5. Stunde', 'Protein biosynthesis', hw('undone', 'Links for revision:<br />Mitosis<br />https://example.org/a?x=1&amp;t=4<br /><br />Protein Synthesis')),
    row('14', '25.09.2026', '5. - 6. Stunde', 'Protein biosynthesis / Noten', files('14', [['pptx', 'Protein biosynthesis.pptx', '1,74 MB'], ['pdf', 'Arbeitsblatt &amp; Lösung.pdf', '241,62 KB']])),
    row('13', '22.09.2026', '5. Stunde', 'Genetik', hw('done', 'Aufgabe 3 lösen') + files('13', [['jpg', 'foto.JPG', '2 MB']])),
    row('2', '01.03.2026', '1. Stunde', 'Uralt', hw('undone', 'sehr alt')),
  ].join('\n'),
);

describe('Kursseite aus Lanis lesen', () => {
  const book = parseCourseBook(html)!;

  it('liest Kurs, Halbjahr und Lehrkraft', () => {
    expect(book.book).toBe('6829');
    expect(book.name).toBe('Biologie GK 12 a');
    expect(book.halfYear).toBe('1. Halbjahr');
    expect(book.teacher).toBe('Stauch, Saskia Katharina');
    expect(book.teacherShort).toBe('Stc');
    expect(book.entries.map((e) => e.id)).toEqual(['16', '15', '14', '13', '2']);
  });

  it('liest Datum, Stunden und Thema', () => {
    const e = book.entries[2];
    expect(e).toMatchObject({ date: '2026-09-25', slot: '5. - 6. Stunde', topic: 'Protein biosynthesis / Noten', homework: null, done: null });
  });

  it('liest die Hausaufgabe mit Zeilenumbrüchen, Entities und Erledigt-Zustand', () => {
    const e = book.entries[1];
    expect(e.homework).toBe('Links for revision:\nMitosis\nhttps://example.org/a?x=1&t=4\n\nProtein Synthesis');
    expect(e.done).toBe(false);
    expect(book.entries[3]).toMatchObject({ homework: 'Aufgabe 3 lösen', done: true });
  });

  it('liest Anhänge mit Endung, Größe und entschlüsseltem Namen, ohne den Sammel-Link', () => {
    const e = book.entries[2];
    expect(e.files).toEqual([
      { name: 'Protein biosynthesis.pptx', ext: 'pptx', size: Math.round(1.74 * 1024 * 1024) },
      { name: 'Arbeitsblatt & Lösung.pdf', ext: 'pdf', size: Math.round(241.62 * 1024) },
    ]);
    expect(book.entries[3].files[0]).toMatchObject({ name: 'foto.JPG', ext: 'jpg' });
  });

  it('Eintrag ohne Hausaufgabe und ohne Anhang bleibt leer', () => {
    expect(book.entries[0]).toMatchObject({ homework: null, done: null, files: [] });
  });

  it('ohne Kursmappe oder Datum gibt es nichts', () => {
    expect(parseCourseBook('<html>nichts</html>')).toBeNull();
    expect(parseCourseBook(page('<tr data-entry="1"><td>kein Datum</td><td><b>x</b></td></tr>'))!.entries).toEqual([]);
  });
});

describe('Einträge für die App', () => {
  const items = buildHomework([html, html], '2026-10-02');

  it('nimmt nur Einträge mit Hausaufgabe oder Anhang, neueste zuerst, ohne Doppelte und ohne zu alte', () => {
    expect(items.map((i) => i.key)).toEqual(['6829:15', '6829:14', '6829:13']);
    expect(items[0]).toMatchObject({ course: 'Biologie GK 12 a', teacherShort: 'Stc', text: expect.stringContaining('Mitosis'), done: false });
  });

  it('zählt, was erkannt wurde', () => {
    expect(diagnoseBooks([html, '<p>kaputt</p>'])).toEqual({ courses: 1, entries: 5, withHomework: 3, withFiles: 2, unreadable: 1 });
  });
});

describe('Fach und Abgabetag', () => {
  const subjects = [
    { id: 'bio', name: 'Biologie' },
    { id: 'en', name: 'Englisch' },
    { id: 'pw', name: 'Politik und Wirtschaft' },
  ];

  it('kürzt Kursnamen auf das Fach', () => {
    expect(courseBase('Englisch LK 12 (Q1E_LK01-GYM)')).toBe('Englisch');
    expect(courseBase('Biologie GK 12 a')).toBe('Biologie');
    expect(courseBase('Kunst GK Q1')).toBe('Kunst');
    expect(subjectForCourse('Biologie GK 12 a', subjects)).toBe('bio');
    expect(subjectForCourse('Englisch LK 12 (Q1E_LK01-GYM)', subjects)).toBe('en');
    expect(subjectForCourse('Kunst GK Q1', subjects)).toBeNull();
  });

  // Biologie dienstags (weekday 1)
  const tt: Timetable = {
    validFrom: null,
    periods: [],
    lessons: [{ weekday: 1, period: 5, span: 1, start: '11:00', end: '11:45', course: 'Q1BIO01', abbr: 'bio', isAdvanced: false, room: '', teacher: '' }],
  };

  it('Abgabe ist die nächste Stunde des Fachs, sonst der nächste Schultag', () => {
    expect(dueDateFor('2026-09-29', 'bio', tt, subjects)).toBe('2026-10-06'); // Dienstag auf Dienstag
    expect(dueDateFor('2026-09-29', null, tt, subjects)).toBe('2026-09-30');
    expect(dueDateFor('2026-10-02', null, null, subjects)).toBe('2026-10-05'); // Freitag -> Montag
  });
});

describe('Aufgaben aus Hausaufgaben', () => {
  const subjects = [{ id: 'bio', name: 'Biologie' }];
  const items = buildHomework([html], '2026-10-02');
  const base = { imported: [] as string[], tasks: [] as { id: string; done: boolean; externalId?: string | null }[], subjects, timetable: null, today: '2026-10-02' };

  it('legt für offene, neue Hausaufgaben der letzten Tage Aufgaben an, nicht für erledigte', () => {
    const plan = planHomework(items, base);
    expect(plan.add).toHaveLength(1);
    expect(plan.add[0]).toMatchObject({ externalId: '6829:15', subjectId: 'bio', date: '2026-09-30' });
    expect(plan.add[0].title.startsWith('Links for revision: Mitosis')).toBe(true);
    expect(plan.imported).toEqual(['6829:15']);
  });

  it('hängt den Kurs an den Titel, wenn das Fach nicht zugeordnet ist', () => {
    const plan = planHomework(items, { ...base, subjects: [] });
    expect(plan.add[0].subjectId).toBeNull();
    expect(plan.add[0].title.startsWith('Biologie: Links')).toBe(true);
  });

  it('legt nichts doppelt an, auch nicht nach dem Löschen der Aufgabe', () => {
    expect(planHomework(items, { ...base, imported: ['6829:15'] }).add).toEqual([]);
  });

  it('ältere Einträge als taskDays werden keine Aufgaben', () => {
    expect(planHomework(items, { ...base, today: '2026-10-20' }).add).toEqual([]);
  });

  it('in Lanis erledigte Hausaufgaben schließen die offene Aufgabe', () => {
    const plan = planHomework(items, { ...base, imported: ['6829:13'], tasks: [{ id: 't1', done: false, externalId: '6829:13' }, { id: 't2', done: true, externalId: '6829:13' }, { id: 't3', done: false, externalId: null }] });
    expect(plan.complete).toEqual(['t1']);
  });
});

describe('Dateien übernehmen', () => {
  const item = buildHomework([html], '2026-10-02').find((i) => i.key === '6829:14')!;

  it('erkennt, was sich in eine Notiz übernehmen lässt (PDF und Bilder)', () => {
    expect(importableType({ name: 'a.pdf', ext: 'pdf' })).toBe('application/pdf');
    expect(importableType({ name: 'a.JPG', ext: '' })).toBe('image/jpeg');
    expect(importableType({ name: 'a.pptx', ext: 'pptx' })).toBeNull();
  });

  it('zeigt nur neue, übernehmbare Dateien', () => {
    expect(newFiles(item, new Set()).map((f) => f.name)).toEqual(['Arbeitsblatt & Lösung.pdf']);
    expect(newFiles(item, new Set([fileKey(item, { name: 'Arbeitsblatt & Lösung.pdf' })]))).toEqual([]);
  });
});

describe('Gespeicherten Stand lesen', () => {
  it('übernimmt Gültiges, überspringt Kaputtes und füllt Fehlendes auf', () => {
    const snap = readHomework({
      items: [{ key: '1:2', book: '1', entry: '2', date: '2026-10-01', text: 'x', files: [{ name: 'a.pdf' }, { nope: 1 }] }, { key: 'x' }, null, { key: '1:3', book: '1', entry: '3', date: 'gestern' }],
      imported: ['1:2', 5, '1:9'],
    })!;
    expect(snap.items).toHaveLength(1);
    expect(snap.items[0]).toMatchObject({ key: '1:2', course: '', done: false, files: [{ name: 'a.pdf', ext: '', size: 0 }] });
    expect(snap.imported).toEqual(['1:2', '1:9']);
  });

  it('gibt bei fremder Form null', () => {
    expect(readHomework(null)).toBeNull();
    expect(readHomework({ items: 'x' })).toBeNull();
    expect(readHomework([])).toBeNull();
  });
});
