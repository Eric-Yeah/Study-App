import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { defaultRubric } from './examGrading';
import {
  LEVELS,
  afbShares,
  applySolutions,
  compileExpr,
  diagramText,
  niceTicks,
  readDiagram,
  sampleFn,
  hasSolutions,
  parseSolutions,
  solutionsPrompt,
  afbTarget,
  defaultsFor,
  difficultyShift,
  examProfile,
  horizonPlainText,
  isLevel,
  layoutFor,
  parsePractice,
  practicePlainText,
  practicePrompt,
  taskOverview,
  type PracticeContent,
  type PracticeOutcome,
  type PracticePromptInput,
} from './practiceExam';

const cfg = CONFIG.practice;

describe('Stufen und Aufbau', () => {
  it('drei Stufen', () => {
    expect([...LEVELS]).toEqual(['leicht', 'mittel', 'schwer']);
    expect(isLevel('schwer')).toBe(true);
    expect(isLevel('extrem')).toBe(false);
    expect(isLevel(3)).toBe(false);
  });

  it('jede Fachgruppe hat einen Aufbau, unbekannte bekommen den allgemeinen', () => {
    for (const f of ['deutsch', 'fremdsprache', 'latein', 'mathe', 'naturwiss', 'gesellschaft', 'religion_ethik', 'kunst_musik', 'informatik', 'sport', 'allgemein']) {
      expect(layoutFor(f).structure.length, f).toBeGreaterThan(0);
    }
    expect(layoutFor('quatsch')).toBe(layoutFor('allgemein'));
    expect(layoutFor('mathe').structure.join(' ')).toMatch(/Teil A.*Teil B/s);
    expect(layoutFor('fremdsprache').structure.join(' ')).toMatch(/Sprachmittlung/);
    expect(layoutFor('deutsch').structure.join(' ')).toMatch(/Textvorlage/);
  });

  it('Grundkurs und Leistungskurs', () => {
    expect(defaultsFor(false, cfg)).toEqual({ durationMin: 90, totalBe: 60 });
    expect(defaultsFor(true, cfg)).toEqual({ durationMin: 135, totalBe: 90 });
  });
});

describe('Profil aus echten Klausuren', () => {
  const exam = (aufgaben: [string, number | null, number, number][]) => ({ aufgaben: aufgaben.map(([operator, afb, max, punkte]) => ({ operator, afb, max, punkte })) });

  it('ohne Klausuren kein Profil', () => {
    expect(examProfile([])).toBeNull();
    expect(examProfile([{ aufgaben: [] }])).toBeNull();
  });

  it('Aufgaben, Punkte, Mischung, Operatoren und Ergebnis', () => {
    const p = examProfile([
      exam([['Beschreiben', 1, 10, 8], ['analysieren', 2, 30, 20], ['Beurteilen', 3, 20, 10]]),
      exam([['beschreiben', 1, 10, 9], ['Analysieren', 2, 20, 12]]),
    ])!;
    expect(p.n).toBe(2);
    expect(p.avgTasks).toBe(2.5);
    expect(p.avgPoints).toBe(45); // (60 + 30) / 2
    expect(p.afb).toEqual([22, 56, 22]); // 20 : 50 : 20 von 90
    expect(p.operators).toEqual([
      { operator: 'analysieren', count: 2 },
      { operator: 'beschreiben', count: 2 },
      { operator: 'beurteilen', count: 1 },
    ]);
    expect(p.avgPercent).toBe(round1((38 / 60 + 21 / 30) / 2 * 100)); // 66,7 und 70
  });

  it('ohne Anforderungsbereiche keine Mischung', () => {
    expect(examProfile([exam([['x', null, 10, 5]])])!.afb).toBeNull();
  });
});

const round1 = (n: number) => Math.round(n * 10) / 10;

describe('Zielmischung der Anforderungsbereiche', () => {
  const sum = (a: number[]) => a[0] + a[1] + a[2];

  it('mittel bleibt die Basis', () => {
    expect(afbTarget([25, 50, 25], 0, 9)).toEqual([25, 50, 25]);
  });

  it('schwer verschiebt nach III, leicht zurück', () => {
    const hard = afbTarget([25, 50, 25], 1, 9);
    expect(hard).toEqual([16, 50, 34]);
    const easy = afbTarget([25, 50, 25], -1, 9);
    expect(easy[2]).toBe(16);
    expect(easy[0]).toBeGreaterThan(25);
    expect(sum(hard)).toBe(100);
    expect(sum(easy)).toBe(100);
  });

  it('jeder Bereich behält einen Mindestanteil', () => {
    const extreme = afbTarget([25, 50, 25], 5, 9);
    expect(extreme[0]).toBeGreaterThanOrEqual(5);
    expect(extreme[1]).toBeGreaterThanOrEqual(15);
    expect(sum(extreme)).toBe(100);
    expect(afbTarget([25, 50, 25], -5, 9)[2]).toBeGreaterThanOrEqual(5);
  });

  it('Basis aus echten Klausuren wird auf 100 gebracht', () => {
    expect(afbTarget([2, 5, 3], 0, 9)).toEqual([20, 50, 30]);
  });
});

describe('Rückmeldung und Ergebnisse', () => {
  const rate = (rating: number | null, percent: number | null = null, difficulty: PracticeOutcome['difficulty'] = 'mittel'): PracticeOutcome => ({ difficulty, rating, percent });
  const shift = (o: PracticeOutcome[], level: PracticeOutcome['difficulty'] = 'mittel', real: number | null = null) => difficultyShift(o, level, real, cfg);

  it('ohne Daten keine Verschiebung', () => {
    expect(shift([])).toBe(0);
    expect(shift([rate(null)])).toBe(0);
    expect(shift([rate(0), rate(0)])).toBe(0);
  });

  it('"zu leicht" macht die nächste schwerer, "zu schwer" leichter', () => {
    expect(shift([rate(-1)])).toBe(1);
    expect(shift([rate(1)])).toBe(-1);
    expect(shift([rate(-1), rate(-1), rate(-1)])).toBe(2);
    expect(shift([rate(-1), rate(1)])).toBe(0);
  });

  it('höchstens maxShift Schritte', () => {
    expect(shift(Array.from({ length: 10 }, () => rate(-1)))).toBe(2);
    expect(shift(Array.from({ length: 10 }, () => rate(1)))).toBe(-2);
  });

  it('nur die Stufe zählt, und nur die letzten Werte', () => {
    expect(shift([rate(-1, null, 'schwer'), rate(-1, null, 'schwer')], 'mittel')).toBe(0);
    const many = [...Array.from({ length: 5 }, () => rate(-1)), ...Array.from({ length: 5 }, () => rate(1))];
    expect(shift(many)).toBe(-2); // nur die letzten fünf zählen
  });

  it('Ergebnis weit über echten Klausuren heißt zu leicht', () => {
    // mittel soll so ausfallen wie echte Klausuren (Ziel 0), Ergebnis 30 Punkte höher: 3 Schritte * 0,5 * 1/2 = 0,75 -> 1
    expect(shift([rate(null, 85)], 'mittel', 55)).toBe(1);
    expect(shift([rate(null, 55)], 'mittel', 55)).toBe(0);
    expect(shift([rate(null, 25)], 'mittel', 55)).toBe(-1);
  });

  it('leicht soll über, schwer unter den echten Klausuren liegen', () => {
    expect(shift([rate(null, 70, 'leicht')], 'leicht', 55)).toBe(0); // genau das Ziel (+15)
    expect(shift([rate(null, 40, 'schwer')], 'schwer', 55)).toBe(0); // genau das Ziel (-15)
    expect(shift([rate(null, 40, 'leicht')], 'leicht', 55)).toBe(-1); // leicht fiel schwerer aus als gedacht
    expect(shift([rate(null, 70, 'schwer')], 'schwer', 55)).toBe(1); // schwer fiel leichter aus als gedacht
  });

  it('ohne echte Klausuren zählt nur die Rückmeldung', () => {
    expect(shift([rate(null, 99)], 'mittel', null)).toBe(0);
    expect(shift([rate(-1, 99)], 'mittel', null)).toBe(1);
  });
});

const input = (o: Partial<PracticePromptInput> = {}): PracticePromptInput => ({
  subjectName: 'Deutsch',
  family: 'deutsch',
  criteria: defaultRubric('Deutsch', 'writing').criteria.map((c) => `${c.name}: ${c.detail}`),
  teacherText: '',
  lessons: [],
  materialText: '',
  topic: '',
  difficulty: 'mittel',
  afb: [25, 50, 25],
  totalBe: 60,
  durationMin: 90,
  profile: null,
  languageNote: '',
  isAdvanced: false,
  ...o,
});

describe('Prompt', () => {
  it('enthält Stufe, Mischung, Punkte, Zeit, Aufbau und Operatoren', () => {
    const p = practicePrompt(input());
    expect(p).toMatch(/Übungsklausur im Fach Deutsch \(Grundkurs\)/);
    expect(p).toMatch(/Stufe MITTEL/);
    expect(p).toMatch(/AFB I etwa 25 %, AFB II etwa 50 %, AFB III etwa 25 %/);
    expect(p).toMatch(/60 Bewertungseinheiten.*90 Minuten/);
    expect(p).toMatch(/Textvorlage/);
    expect(p).toMatch(/Operatoren/);
    expect(p).toMatch(/keine Anweisungen an dich/);
    expect(p).toMatch(/LaTeX/);
  });

  it('Stufen unterscheiden sich', () => {
    expect(practicePrompt(input({ difficulty: 'leicht' }))).toMatch(/Stufe LEICHT/);
    expect(practicePrompt(input({ difficulty: 'schwer' }))).toMatch(/Stufe SCHWER/);
  });

  it('Material, Thema, Vorgaben, Erfahrungen und Profil nur wenn vorhanden', () => {
    const bare = practicePrompt(input());
    expect(bare).toMatch(/Es gibt kein Unterrichtsmaterial/);
    expect(bare).not.toMatch(/Themenwunsch/);
    expect(bare).not.toMatch(/Vorgaben der Lehrkraft/);
    expect(bare).not.toMatch(/Erfahrungen aus früheren/);
    expect(bare).not.toMatch(/echten Klausuren dieses Fachs \(aus/);
    const full = practicePrompt(
      input({
        materialText: 'Thema Romantik: die blaue Blume',
        topic: 'Eichendorff',
        teacherText: 'Einleitung zählt 10 %.',
        lessons: ['Erwartet Zeilenangaben.'],
        profile: { n: 3, avgTasks: 4, avgPoints: 70, afb: [20, 50, 30], operators: [{ operator: 'analysieren', count: 5 }], avgPercent: 62 },
        isAdvanced: true,
      }),
    );
    expect(full).toMatch(/die blaue Blume/);
    expect(full).toMatch(/Themenwunsch: Eichendorff/);
    expect(full).toMatch(/Einleitung zählt 10 %/);
    expect(full).toMatch(/Erwartet Zeilenangaben/);
    expect(full).toMatch(/aus 3 korrigierten Klausuren.*4 Aufgaben und 70 BE.*analysieren \(5x\)/);
    expect(full).toMatch(/Leistungskurs/);
  });

  it('Fach bestimmt den Aufbau', () => {
    const math = practicePrompt(input({ subjectName: 'Mathematik', family: 'mathe', criteria: [] }));
    expect(math).toMatch(/Teil A \(ohne Hilfsmittel\)/);
    expect(math).toMatch(/Teil B/);
    const en = practicePrompt(input({ subjectName: 'Englisch', family: 'fremdsprache', languageNote: 'Das Fach wird auf Englisch unterrichtet.' }));
    expect(en).toMatch(/Comprehension/);
    expect(en).toMatch(/unterrichtet/);
    const la = practicePrompt(input({ subjectName: 'Latein', family: 'latein' }));
    expect(la).toMatch(/Übersetzung/);
  });

  it('bleibt in einem vernünftigen Rahmen (Tokens kosten)', () => {
    for (const f of ['deutsch', 'fremdsprache', 'latein', 'mathe', 'naturwiss', 'gesellschaft']) {
      expect(practicePrompt(input({ family: f })).length, f).toBeLessThan(9000);
    }
  });
});

const good = {
  titel: 'Übungsklausur Deutsch',
  dauer_min: 90,
  hilfsmittel: 'Wörterbuch',
  hinweise: ['Arbeite sauber.', ' '],
  teile: [
    {
      name: 'Teil A',
      hinweis: 'Lies den Text.',
      materialien: [
        { id: 'M1', typ: 'text', titel: 'Der Text', quelle: 'Für diese Übung verfasst', text: 'Absatz eins.\n\nAbsatz zwei.' },
        { typ: 'tabelle', titel: 'Werte', kopf: ['Jahr', 'Wert'], zeilen: [['2020', '5'], ['2021'], 'kaputt'] },
        { typ: 'text', text: '' },
      ],
      aufgaben: [
        { nr: '1', operator: 'Fasse', afb: 1, text: 'Fasse den Text zusammen.', be: '12', erwartung: ['Thema nennen (4 BE)'], loesung: 'Der Text handelt von ...' },
        {
          nr: '2',
          operator: 'Analysiere',
          afb: '2',
          text: 'Analysiere die Sprache.',
          be: 99,
          teilaufgaben: [
            { nr: 'a', text: 'Nenne Mittel.', be: 6, loesung: 'Metapher' },
            { nr: 'b', text: 'Deute sie.', be: 8.5, loesung: 'Sie zeigt ...' },
            { nr: 'c', text: 'ohne Punkte', be: 0 },
          ],
        },
        { nr: '3', text: 'ohne Punkte', be: 0 },
        'Unsinn',
      ],
    },
    { name: 'leer', aufgaben: [] },
  ],
  gesamt_be: 5,
};

describe('Antwort der KI lesen', () => {
  it('prüft Form, begrenzt Längen und rechnet die Punkte selbst', () => {
    const c = parsePractice(`Hier:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\``, cfg.limits)!;
    expect(c.teile).toHaveLength(1);
    expect(c.hinweise).toEqual(['Arbeite sauber.']);
    const part = c.teile[0];
    expect(part.materialien).toHaveLength(2);
    expect(part.materialien[0].text).toBe('Absatz eins.\n\nAbsatz zwei.');
    expect(part.materialien[1].typ).toBe('tabelle');
    expect(part.materialien[1].id).toBe('M2');
    expect(part.materialien[1].zeilen).toEqual([['2020', '5'], ['2021', '']]);
    expect(part.aufgaben).toHaveLength(2);
    expect(part.aufgaben[0].be).toBe(12);
    expect(part.aufgaben[1].be).toBe(14.5); // Summe der Teilaufgaben, nicht die 99 der KI
    expect(part.aufgaben[1].afb).toBe(2);
    expect(part.aufgaben[1].teilaufgaben).toHaveLength(2);
    expect(c.gesamt_be).toBe(26.5); // nicht die 5 der KI
  });

  it('dauer nur zwischen 20 und 300 Minuten, sonst 90', () => {
    expect(parsePractice(JSON.stringify({ ...good, dauer_min: 400 }), cfg.limits)!.dauer_min).toBe(90);
    expect(parsePractice(JSON.stringify({ ...good, dauer_min: 135 }), cfg.limits)!.dauer_min).toBe(135);
  });

  it('Grenzen für Teile, Aufgaben und Texte', () => {
    const many = { ...good, teile: [{ name: 'T', aufgaben: Array.from({ length: 30 }, (_, i) => ({ nr: String(i + 1), text: 'x', be: 1 })) }] };
    expect(parsePractice(JSON.stringify(many), cfg.limits)!.teile[0].aufgaben).toHaveLength(cfg.limits.tasks);
    const longText = { ...good, teile: [{ name: 'T', materialien: [{ typ: 'text', text: 'a'.repeat(20000) }], aufgaben: [{ nr: '1', text: 'x', be: 1 }] }] };
    expect(parsePractice(JSON.stringify(longText), cfg.limits)!.teile[0].materialien[0].text).toHaveLength(cfg.limits.textChars);
  });

  it('ohne Aufgabe oder ohne JSON null', () => {
    expect(parsePractice('kein JSON', cfg.limits)).toBeNull();
    expect(parsePractice('{"teile": []}', cfg.limits)).toBeNull();
    expect(parsePractice('{"teile": [{"aufgaben": []}]}', cfg.limits)).toBeNull();
    expect(parsePractice('{"teile": "x"}', cfg.limits)).toBeNull();
    expect(parsePractice('{kaputt', cfg.limits)).toBeNull();
  });
});

describe('Textfassungen und Übersicht', () => {
  const c = parsePractice(JSON.stringify(good), cfg.limits) as PracticeContent;

  it('die Klausur als Text für die Korrektur', () => {
    const pages = practicePlainText(c);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatch(/Gesamt: 26,5 BE/);
    expect(pages[0]).toMatch(/M1: Der Text \(Für diese Übung verfasst\)\nAbsatz eins/);
    expect(pages[0]).toMatch(/Jahr \| Wert\n2020 \| 5/);
    expect(pages[0]).toMatch(/Aufgabe 2 \(14,5 BE\): Analysiere die Sprache\.\n {2}a\) Nenne Mittel\. \(6 BE\)/);
  });

  it('lange Klausuren werden in Stücke geteilt', () => {
    const big = { ...c, teile: [{ ...c.teile[0], materialien: [{ ...c.teile[0].materialien[0], text: 'x'.repeat(5000) }, { ...c.teile[0].materialien[0], id: 'M2', text: 'y'.repeat(5000) }] , aufgaben: c.teile[0].aufgaben }] };
    const pages = practicePlainText(big, 6000);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((p) => p.length <= 6000)).toBe(true);
  });

  it('Erwartungshorizont als Text, bei Platzmangel gekürzt', () => {
    const full = horizonPlainText(c, 5000);
    expect(full).toMatch(/Aufgabe 1 \(12 BE\):\n- Thema nennen \(4 BE\)\nMusterlösung: Der Text handelt von/);
    expect(full).toMatch(/a\) \(6 BE\) Lösung: Metapher/);
    const medium = horizonPlainText(c, full.length - 5);
    expect(medium).not.toMatch(/Lösung: Metapher/);
    expect(medium).toMatch(/Musterlösung: Der Text/);
    const tiny = horizonPlainText(c, 60);
    expect(tiny.length).toBeLessThanOrEqual(60);
    expect(horizonPlainText(c, medium.length - 5)).not.toMatch(/Musterlösung/);
    expect(horizonPlainText(c, medium.length - 5)).toMatch(/Thema nennen \(4 BE\)/);
  });

  it('Übersicht und Anteile der Anforderungsbereiche', () => {
    expect(taskOverview(c).map((t) => [t.nr, t.operator, t.afb, t.be])).toEqual([
      ['1', 'Fasse', 1, 12],
      ['2', 'Analysiere', 2, 14.5],
    ]);
    expect(afbShares(c)).toEqual([45, 55, 0]);
    expect(afbShares({ ...c, teile: [{ ...c.teile[0], aufgaben: [{ ...c.teile[0].aufgaben[0], afb: null }] }] })).toBeNull();
  });
});

describe('Erwartungshorizont und Musterlösung (zweiter Schritt)', () => {
  const exam = parsePractice(JSON.stringify({ ...good, teile: [{ ...good.teile[0], aufgaben: good.teile[0].aufgaben.map((a) => (typeof a === 'object' ? { ...a, erwartung: undefined, loesung: undefined } : a)).map((a) => (typeof a === 'object' && Array.isArray((a as { teilaufgaben?: unknown[] }).teilaufgaben) ? { ...a, teilaufgaben: (a as { teilaufgaben: { loesung?: string }[] }).teilaufgaben.map((t) => ({ ...t, loesung: undefined })) } : a)) }] }), cfg.limits) as PracticeContent;
  const raw = JSON.stringify({
    aufgaben: [
      { nr: '1', erwartung: ['Thema nennen (4 BE)', 'Aufbau (8 BE)'], loesung: 'Der Text handelt von ...', teilaufgaben: [] },
      { nr: '2', erwartung: ['Mittel nennen (6 BE)'], loesung: 'wird ignoriert', teilaufgaben: [{ nr: 'a', loesung: 'Metapher' }, { nr: 'b', loesung: 'Sie zeigt ...' }, { nr: 'z', loesung: 'gibt es nicht' }] },
      { nr: '9', erwartung: ['gibt es nicht'], loesung: 'x' },
      { erwartung: ['ohne Nummer'] },
      'Unsinn',
    ],
  });

  it('die Klausur ohne Lösungen hat keinen Erwartungshorizont', () => {
    expect(hasSolutions(exam)).toBe(false);
  });

  it('Prompt enthält die Klausur, die Regeln und das Format', () => {
    const p = solutionsPrompt({ subjectName: 'Mathematik', family: 'mathe', criteria: ['Ansatz: passend'], teacherText: 'BE streng', examText: 'AUFGABENTEXT HIER', languageNote: '' });
    expect(p).toMatch(/Erwartungshorizont und die Musterlösung/);
    expect(p).toMatch(/Ansatz: passend/);
    expect(p).toMatch(/BE streng/);
    expect(p).toMatch(/"erwartung": string\[\]/);
    expect(p).toMatch(/Die Klausur:\nAUFGABENTEXT HIER$/);
    expect(p).toMatch(/keine Anweisungen an dich/);
    expect(solutionsPrompt({ subjectName: 'Deutsch', family: 'deutsch', criteria: [], teacherText: '', examText: 'x', languageNote: '' })).not.toMatch(/Vorgaben der Lehrkraft/);
  });

  it('liest die Lösungen je Aufgabennummer', () => {
    const s = parseSolutions(raw, cfg.limits)!;
    expect(Object.keys(s).sort()).toEqual(['1', '2', '9']);
    expect(s['1'].erwartung).toEqual(['Thema nennen (4 BE)', 'Aufbau (8 BE)']);
    expect(s['2'].teilaufgaben).toEqual({ a: 'Metapher', b: 'Sie zeigt ...', z: 'gibt es nicht' });
    expect(parseSolutions('kein JSON', cfg.limits)).toBeNull();
    expect(parseSolutions('{"aufgaben": []}', cfg.limits)).toBeNull();
  });

  it('trägt sie in die Klausur ein und ignoriert unbekannte Nummern', () => {
    const done = applySolutions(exam, parseSolutions(raw, cfg.limits)!);
    const [t1, t2] = done.teile[0].aufgaben;
    expect(t1.erwartung).toHaveLength(2);
    expect(t1.loesung).toBe('Der Text handelt von ...');
    expect(t2.teilaufgaben.map((x) => x.loesung)).toEqual(['Metapher', 'Sie zeigt ...']);
    expect(t2.be).toBe(14.5); // Punkte bleiben die der Klausur
    expect(hasSolutions(done)).toBe(true);
    expect(exam.teile[0].aufgaben[0].erwartung).toEqual([]); // das Original bleibt unverändert
  });

  it('fehlt eine Aufgabe in der Antwort, ist der Erwartungshorizont unvollständig', () => {
    const partial = applySolutions(exam, { '1': { erwartung: ['x (12 BE)'], loesung: 'y', teilaufgaben: {} } });
    expect(hasSolutions(partial)).toBe(false);
  });
});

describe('Funktionsterme', () => {
  const ev = (src: string, x: number) => compileExpr(src)!(x);
  it('rechnet Punkt vor Strich, Potenzen und Klammern', () => {
    expect(ev('2+3*x', 2)).toBe(8);
    expect(ev('(2+3)*x', 2)).toBe(10);
    expect(ev('x^2', 3)).toBe(9);
    expect(ev('-x^2', 3)).toBe(-9);
    expect(ev('2^3^2', 0)).toBe(512);
    expect(ev('x^-1', 4)).toBe(0.25);
    expect(ev('10/4', 0)).toBe(2.5);
  });
  it('versteht Schreibweisen aus Schulbüchern', () => {
    expect(ev('0.5x^3 - 2x', 3)).toBeCloseTo(7.5);
    expect(ev('f(x) = 2x + 1', 3)).toBe(7);
    expect(ev('y = x²', 4)).toBe(16);
    expect(ev('2(x+1)', 2)).toBe(6);
    expect(ev('0,5*x', 4)).toBe(2);
    expect(ev('3·x − 1', 2)).toBe(5);
  });
  it('kennt Funktionen und Konstanten', () => {
    expect(ev('sin(pi/2)', 0)).toBeCloseTo(1);
    expect(ev('exp(x)', 0)).toBe(1);
    expect(ev('ln(e)', 0)).toBeCloseTo(1);
    expect(ev('sqrt(x)', 9)).toBe(3);
    expect(ev('abs(x)', -3)).toBe(3);
    expect(ev('log(100)', 0)).toBeCloseTo(2);
  });
  it('lehnt alles andere ab', () => {
    for (const bad of ['', 'x^', '(x', 'x)', 'evil(x)', 'x; alert(1)', 'process.exit()', 'x y z(', 'sin x', '1+', 'a*x', '__proto__', 'constructor(x)']) expect(compileExpr(bad)).toBeNull();
    expect(compileExpr('x'.repeat(200))).toBeNull();
    expect(compileExpr('('.repeat(40) + 'x' + ')'.repeat(40))).toBeNull();
  });
});

describe('Kurven und Achsen', () => {
  it('trennt die Kurve an einem Pol', () => {
    const pts = sampleFn((x) => 1 / x, -2, 2, -5, 5, 40);
    expect(pts.some((p) => p === null)).toBe(true);
    expect(pts.filter((p) => p !== null).every((p) => Math.abs(p!.y) < 25)).toBe(true);
  });
  it('wählt eine schöne Teilung', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(-1, 1, 4)).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(niceTicks(3, 3)).toEqual([3]);
    expect(niceTicks(0, 0.3, 3)).toEqual([0, 0.1, 0.2, 0.3]);
  });
});

describe('Diagramme lesen', () => {
  const l = cfg.limits;
  it('liest einen Funktionsgraphen mit Markierung', () => {
    const d = readDiagram({ art: 'graph', titel: 'Graph von f', xlabel: 'x', ylabel: 'y', xmin: -3, xmax: 3, ymin: -5, ymax: 5, reihen: [{ name: 'f', stil: 'linie', fn: '0.5*x^3-2*x' }], markierungen: [{ x: 2, y: 0, text: 'Nullstelle' }] }, l)!;
    expect(d.art).toBe('graph');
    expect([d.xmin, d.xmax, d.ymin, d.ymax]).toEqual([-3, 3, -5, 5]);
    expect(d.reihen[0]).toMatchObject({ fn: '0.5*x^3-2*x', punkte: [] });
    expect(d.markierungen).toHaveLength(1);
  });
  it('lässt Reihen mit unlesbarem Term weg, ein leeres Koordinatensystem bleibt', () => {
    const d = readDiagram({ art: 'graph', xmin: 0, xmax: 4, ymin: 0, ymax: 4, reihen: [{ fn: 'system(x)' }] }, l)!;
    expect(d.reihen).toEqual([]);
    expect(diagramText(d)).toContain('leeres Koordinatensystem');
  });
  it('rechnet den Bereich selbst aus Punkten und Funktion', () => {
    const p = readDiagram({ art: 'graph', reihen: [{ name: 'Messung', stil: 'punkte', punkte: [[0, 2], [5, 12], ['x', 3], [10, 'a']] }] }, l)!;
    expect(p.reihen[0]!.punkte).toHaveLength(2);
    expect(p.xmin).toBeLessThan(0);
    expect(p.xmax).toBeGreaterThan(5);
    expect(p.ymax).toBeGreaterThan(12);
    const f = readDiagram({ art: 'graph', xmin: 0, xmax: 4, reihen: [{ fn: 'x^2' }] }, l)!;
    expect(f.ymin).toBeLessThan(0.5);
    expect(f.ymax).toBeGreaterThan(16);
    expect(readDiagram({ art: 'graph', reihen: [{ fn: 'x^2' }] }, l)).toBeNull(); // ohne x-Bereich und ohne Punkte
  });
  it('liest Säulen, Linien und Kreis', () => {
    const s = readDiagram({ art: 'saeulen', kategorien: ['Jan', 'Feb'], ylabel: 'mm', reihen: [{ name: '2025', werte: [10, '12,5', 'x'] }] }, l)!;
    expect(s.reihen[0]!.werte).toEqual([10, 12.5]);
    expect(readDiagram({ art: 'saeulen', kategorien: [], reihen: [{ werte: [1] }] }, l)).toBeNull();
    const k = readDiagram({ art: 'kreis', kategorien: ['A', 'B'], reihen: [{ werte: [30, 70] }, { werte: [1, 2] }] }, l)!;
    expect(k.reihen).toHaveLength(1);
    expect(readDiagram({ art: 'kreis', kategorien: ['A'], reihen: [{ werte: [-1] }] }, l)).toBeNull();
    expect(readDiagram({ art: 'balken', kategorien: ['A'], reihen: [{ werte: [1] }] }, l)).toBeNull();
    expect(readDiagram('x', l)).toBeNull();
  });
  it('begrenzt Reihen, Punkte und Kategorien', () => {
    const many = readDiagram({ art: 'linie', kategorien: Array.from({ length: 30 }, (_, i) => `k${i}`), reihen: Array.from({ length: 9 }, () => ({ werte: Array.from({ length: 30 }, (_, i) => i) })) }, l)!;
    expect(many.kategorien).toHaveLength(l.diagramCategories);
    expect(many.reihen).toHaveLength(l.diagramSeries);
    expect(many.reihen[0]!.werte).toHaveLength(l.diagramCategories);
  });
  it('beschreibt ein Diagramm als Text', () => {
    const d = readDiagram({ art: 'saeulen', titel: 'Niederschlag', kategorien: ['Jan', 'Feb'], ylabel: 'mm', reihen: [{ name: 'Ort A', werte: [10, 12.5] }] }, l)!;
    const t = diagramText(d);
    expect(t).toContain('(Säulendiagramm): Niederschlag');
    expect(t).toContain('Ort A: 10, 12,5');
  });
});

describe('Diagramme in Klausur und Erwartungshorizont', () => {
  const exam = {
    titel: 'Mathe',
    teile: [
      {
        name: 'Teil B',
        materialien: [
          { id: 'M1', typ: 'diagramm', titel: 'Der Graph', diagramm: { art: 'graph', xmin: -2, xmax: 2, ymin: -3, ymax: 3, reihen: [{ name: 'f', fn: 'x^2-1' }] } },
          { id: 'M2', typ: 'diagramm', diagramm: { art: 'kaputt' } },
        ],
        aufgaben: [{ nr: '1', text: 'Bestimme die Nullstellen.', be: 4, teilaufgaben: [{ nr: 'a', text: 'Lies ab.', be: 2 }, { nr: 'b', text: 'Berechne.', be: 2 }] }],
      },
    ],
  };
  it('liest Diagramm-Material und überspringt kaputtes', () => {
    const c = parsePractice(JSON.stringify(exam), cfg.limits)!;
    expect(c.teile[0].materialien).toHaveLength(1);
    expect(c.teile[0].materialien[0]).toMatchObject({ typ: 'diagramm', titel: 'Der Graph', text: '' });
    expect(c.teile[0].materialien[0].diagramm?.reihen[0]?.fn).toBe('x^2-1');
  });
  it('nimmt das Diagramm in die Textfassung auf', () => {
    const c = parsePractice(JSON.stringify(exam), cfg.limits)!;
    expect(practicePlainText(c).join('\n')).toContain('y = x^2-1');
  });
  it('trägt gezeichnete Lösungen in Aufgabe und Teilaufgabe ein', () => {
    const c = parsePractice(JSON.stringify(exam), cfg.limits)!;
    const sol = parseSolutions(
      JSON.stringify({
        aufgaben: [
          {
            nr: '1',
            erwartung: ['Nullstellen (4 BE)'],
            loesung: '',
            diagramm: { art: 'graph', xmin: -2, xmax: 2, ymin: -3, ymax: 3, reihen: [{ fn: 'x^2-1' }], markierungen: [{ x: 1, y: 0, text: 'N1' }] },
            teilaufgaben: [{ nr: 'a', loesung: 'x = ±1', diagramm: { art: 'graph', xmin: -2, xmax: 2, ymin: -3, ymax: 3, reihen: [] } }, { nr: 'b', loesung: 'x² = 1' }],
          },
        ],
      }),
      cfg.limits,
    )!;
    const full = applySolutions(c, sol);
    const t = full.teile[0].aufgaben[0];
    expect(t.diagramm?.markierungen).toHaveLength(1);
    expect(t.teilaufgaben[0].diagramm?.reihen).toEqual([]);
    expect(t.teilaufgaben[1].diagramm).toBeNull();
    expect(hasSolutions(full)).toBe(true);
  });
  it('fragt nur Mathe und Naturwissenschaft nach Diagrammen', () => {
    expect(practicePrompt(input({ family: 'mathe' }))).toContain('typ "diagramm"');
    expect(practicePrompt(input({ family: 'naturwiss' }))).toContain('"fn"');
    expect(practicePrompt(input({ family: 'deutsch' }))).not.toContain('typ "diagramm"');
  });
});

describe('Stil der Aufgabenblätter im Prompt', () => {
  it('nimmt den gelernten Stil auf, sonst nichts', () => {
    const with_ = practicePrompt(input({ styleLines: ['- Aufbau: Drei Aufgaben'] }));
    expect(with_).toContain('Stil der echten Aufgabenblätter dieser Lehrkraft');
    expect(with_).toContain('- Aufbau: Drei Aufgaben');
    expect(practicePrompt(input())).not.toContain('Stil der echten Aufgabenblätter');
    expect(practicePrompt(input({ styleLines: [] }))).not.toContain('Stil der echten Aufgabenblätter');
  });
});
