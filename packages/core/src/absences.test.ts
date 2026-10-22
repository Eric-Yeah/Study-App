import { describe, expect, it } from 'vitest';
import { absenceKind, coursesWithAbsences, extractAbsenceTable, hasAbsences, parseAbsences, totalOfKind } from './absences';

// Erfundene Tabelle im Aufbau von "Mein Unterricht" (id="anwesend"), Zellen ohne Wert sind leer.
const table = `<div id="anwesend"><h3>Anwesenheiten</h3>
<table class="table"><thead><tr><th>Kurs</th><th>Lehrkraft</th><th>fehlend</th><th>entschuldigt</th><th>unentschuldigt</th><th>verspätet</th></tr></thead><tbody>
<tr><td><a href="meinunterricht.php?a=sus_view&id=1">Q1M03</a></td><td>Xyz<div class="hidden hidden_encoded">abc==</div></td><td>4</td><td>4</td><td></td><td>1</td></tr>
<tr><td><a href="meinunterricht.php?a=sus_view&id=2">Q1D02</a></td><td>Abc</td><td>2</td><td>1</td><td>1</td><td></td></tr>
<tr><td><a href="meinunterricht.php?a=sus_view&id=3">Q1E01</a></td><td>Def</td><td></td><td></td><td></td><td></td></tr>
</tbody></table></div><p>danach</p>`;

describe('Fehlstunden aus Lanis', () => {
  it('schneidet die Tabelle aus der Seite', () => {
    const cut = extractAbsenceTable(`<html><body>vorher ${table} nachher</body></html>`);
    expect(cut).toContain('<table');
    expect(cut!.endsWith('</table>')).toBe(true);
    expect(cut).not.toContain('danach');
    expect(extractAbsenceTable('<html>nichts</html>')).toBeNull();
  });

  it('liest Kurse und Spalten, leere Zellen sind 0', () => {
    const r = parseAbsences(extractAbsenceTable(table)!)!;
    expect(r.courses.map((c) => c.course)).toEqual(['Q1M03', 'Q1D02', 'Q1E01']);
    expect(r.courses[0].counts).toEqual({ fehlend: 4, entschuldigt: 4, unentschuldigt: 0, verspätet: 1 });
    expect(r.totals).toEqual({ fehlend: 6, entschuldigt: 5, unentschuldigt: 1, verspätet: 1 });
  });

  it('kodierter Text in versteckten Feldern zählt nicht', () => {
    const r = parseAbsences(extractAbsenceTable(table)!)!;
    expect(JSON.stringify(r)).not.toContain('abc==');
  });

  it('meldet nichts bei fremden oder fehlenden Tabellen', () => {
    expect(parseAbsences('<p>keine Tabelle</p>')).toBeNull();
    expect(parseAbsences('<table><tr><th>Eins</th></tr></table>')).toBeNull();
    const none = parseAbsences('<table><thead><tr><th>Kurs</th><th>fehlend</th></tr></thead><tbody></tbody></table>')!;
    expect(none.courses).toEqual([]);
    expect(hasAbsences(none)).toBe(false);
    expect(hasAbsences(null)).toBe(false);
  });

  it('erkennt die Art einer Spalte und summiert sie', () => {
    expect(absenceKind('unentschuldigt')).toBe('unexcused');
    expect(absenceKind('entschuldigt')).toBe('excused');
    expect(absenceKind('verspätet')).toBe('late');
    expect(absenceKind('fehlend')).toBe('missing');
    expect(absenceKind('Sonstiges')).toBe('other');
    const r = parseAbsences(extractAbsenceTable(table)!)!;
    expect(hasAbsences(r)).toBe(true);
    expect(totalOfKind(r, 'unexcused')).toBe(1);
    expect(totalOfKind(r, 'excused')).toBe(5);
  });

  it('sortiert Kurse mit den meisten Fehlzeiten zuerst und lässt Kurse ohne weg', () => {
    const r = parseAbsences(extractAbsenceTable(table)!)!;
    expect(coursesWithAbsences(r).map((c) => c.course)).toEqual(['Q1M03', 'Q1D02']);
  });
});
