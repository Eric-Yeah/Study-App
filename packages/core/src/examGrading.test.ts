import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import {
  addLessons,
  calibratedPoints,
  calibration,
  deductionStep,
  defaultRubric,
  errorIndex,
  examLanguageNote,
  examPrompt,
  familyFor,
  gradeExam,
  latinPoints,
  learnPrompt,
  lessonsFor,
  modelAccuracy,
  parseExamResult,
  parseLearn,
  percentToPoints,
  resultDigest,
  roundGrade,
  type ExamResult,
  type ExamTask,
  type Lesson,
} from './examGrading';

const rules = CONFIG.exam;

const task = (punkte: number, max: number, extra: Partial<ExamTask> = {}): ExamTask => ({
  nr: '1',
  titel: '',
  operator: '',
  afb: null,
  max,
  max_geschaetzt: false,
  punkte,
  richtig: [],
  fehlt: [],
  tipp: '',
  unsicher: false,
  ...extra,
});

const result = (aufgaben: ExamTask[], extra: Partial<ExamResult> = {}): ExamResult => ({
  aufgaben,
  teile: { darstellung: null, richtigkeit: null, ausdruck: null, uebersetzung_fehler: null, uebersetzung_woerter: null },
  sprache: { fehler: null, woerter: null, anteil: null },
  staerken: [],
  schwaechen: [],
  naechste_schritte: [],
  lesbarkeit: 'sicher',
  erwartung_genutzt: false,
  ...extra,
});

describe('Fachgruppe und Korrekturmuster', () => {
  it('erkennt die Fachgruppe am Namen', () => {
    expect(familyFor('Deutsch', 'writing')).toBe('deutsch');
    expect(familyFor('Englisch LK', 'knowledge')).toBe('fremdsprache');
    expect(familyFor('Französisch', 'knowledge')).toBe('fremdsprache');
    expect(familyFor('Latein', 'knowledge')).toBe('latein');
    expect(familyFor('Mathematik', 'problems')).toBe('mathe');
    expect(familyFor('Bio Bili', 'knowledge')).toBe('naturwiss');
    expect(familyFor('Biologie bilingual', 'knowledge')).toBe('naturwiss');
    expect(familyFor('Physik', 'problems')).toBe('naturwiss');
    expect(familyFor('Politik und Wirtschaft', 'writing')).toBe('gesellschaft');
    expect(familyFor('PoWi', 'writing')).toBe('gesellschaft');
    expect(familyFor('Geschichte (englisch)', 'knowledge')).toBe('gesellschaft');
    expect(familyFor('Ev. Religion', 'writing')).toBe('religion_ethik');
    expect(familyFor('Ethik', 'writing')).toBe('religion_ethik');
    expect(familyFor('Musik', 'knowledge')).toBe('kunst_musik');
    expect(familyFor('Informatik', 'problems')).toBe('informatik');
    expect(familyFor('Sport', 'knowledge')).toBe('sport');
  });

  it('unbekannte Fächer nach dem Fachtyp', () => {
    expect(familyFor('Astronomie', 'problems')).toBe('mathe');
    expect(familyFor('Astronomie', 'knowledge')).toBe('allgemein');
  });

  it('Rechenregeln je Fachgruppe', () => {
    expect(defaultRubric('Deutsch', 'writing').scheme).toBe('deutsch');
    expect(defaultRubric('Spanisch', 'knowledge').scheme).toBe('fremdsprache');
    expect(defaultRubric('Latein', 'knowledge').scheme).toBe('latein');
    expect(defaultRubric('Chemie', 'problems').scheme).toBe('standard');
  });

  it('jedes Muster hat Kriterien, Grundsätze mit Operatoren und eine Grundlage', () => {
    for (const name of ['Deutsch', 'Englisch', 'Latein', 'Mathematik', 'Biologie', 'Geschichte', 'Ethik', 'Kunst', 'Informatik', 'Sport', 'Astronomie']) {
      const r = defaultRubric(name, 'knowledge');
      expect(r.criteria.length, name).toBeGreaterThanOrEqual(3);
      expect(r.basis.length, name).toBeGreaterThanOrEqual(1);
      expect(r.rules.some((x) => x.includes('Operator')), name).toBe(true);
    }
  });

  it('fachspezifische Hinweise', () => {
    expect(defaultRubric('Biologie', 'knowledge').hints.join(' ')).toMatch(/Basiskonzepte/);
    expect(defaultRubric('Chemie', 'problems').hints.join(' ')).toMatch(/Reaktionsgleichungen/);
    expect(defaultRubric('Physik', 'problems').hints.join(' ')).toMatch(/Einheiten/);
    expect(defaultRubric('Geschichte', 'knowledge').hints.join(' ')).toMatch(/Quelle/);
    expect(defaultRubric('Mathematik', 'problems').hints).toEqual([]);
    expect(defaultRubric('Biologie', 'knowledge').label).toBe('Biologie (Naturwissenschaft)');
  });
});

describe('Anlage 9a und Rundung', () => {
  it('Prozent in Notenpunkte, ohne Runden der Prozent', () => {
    const t = rules.percentThresholds;
    expect(percentToPoints(100, t)).toBe(15);
    expect(percentToPoints(96, t)).toBe(15);
    expect(percentToPoints(95.9, t)).toBe(14);
    expect(percentToPoints(81, t)).toBe(12);
    expect(percentToPoints(80.9, t)).toBe(11);
    expect(percentToPoints(51, t)).toBe(6);
    expect(percentToPoints(34, t)).toBe(3);
    expect(percentToPoints(33.9, t)).toBe(2);
    expect(percentToPoints(20, t)).toBe(1);
    expect(percentToPoints(19.9, t)).toBe(0);
    expect(percentToPoints(0, t)).toBe(0);
  });

  it('Rundung: erste Nachkommastelle 1 bis 4 ab, 5 bis 9 auf', () => {
    expect(roundGrade(8.45)).toBe(8);
    expect(roundGrade(8.49)).toBe(8);
    expect(roundGrade(8.5)).toBe(9);
    expect(roundGrade(8.96)).toBe(9);
    expect(roundGrade(9.9)).toBe(10);
    expect(roundGrade(0.4)).toBe(0);
  });

  it('Fehlerindex und Abzugsstufe (ganzzahlig, nicht gerundet)', () => {
    expect(errorIndex(9, 300)).toBe(3);
    expect(errorIndex(null, 300)).toBeNull();
    expect(errorIndex(5, 0)).toBeNull();
    expect(deductionStep(2.99, rules.languageDeduction)).toBeNull();
    expect(deductionStep(3, rules.languageDeduction)?.points).toBe(1);
    expect(deductionStep(5.99, rules.languageDeduction)?.points).toBe(1);
    expect(deductionStep(6, rules.languageDeduction)?.points).toBe(2);
    expect(deductionStep(null, rules.languageDeduction)).toBeNull();
  });

  it('Anlage 9c: Latein nach Fehlerindex', () => {
    const m = rules.latinIndexMax;
    expect(latinPoints(0, m)).toBe(15);
    expect(latinPoints(1, m)).toBe(15);
    expect(latinPoints(1.01, m)).toBe(14);
    expect(latinPoints(7.5, m)).toBe(8); // "bis 8" ergibt 8 Punkte
    expect(latinPoints(12, m)).toBe(4);
    expect(latinPoints(13.5, m)).toBe(3);
    expect(latinPoints(13.6, m)).toBe(2);
    expect(latinPoints(16.5, m)).toBe(1);
    expect(latinPoints(16.6, m)).toBe(0);
  });
});

describe('Note nach den hessischen Regeln', () => {
  it('Standard: Prozent nach Anlage 9a', () => {
    const g = gradeExam(result([task(41, 50), task(40, 50)]), 'standard', rules);
    expect(g.achieved).toBe(81);
    expect(g.max).toBe(100);
    expect(g.points).toBe(12);
    expect(g.deduction).toBe(0);
    expect(g.steps[0]).toMatch(/81 %/);
  });

  it('Standard: ab Fehlerindex 3 ein Punkt Abzug, ab 6 zwei', () => {
    const base = [task(81, 100)];
    expect(gradeExam(result(base, { sprache: { fehler: 12, woerter: 300, anteil: 0.8 } }), 'standard', rules).points).toBe(11);
    expect(gradeExam(result(base, { sprache: { fehler: 20, woerter: 300, anteil: 0.8 } }), 'standard', rules).points).toBe(10);
    expect(gradeExam(result(base, { sprache: { fehler: 5, woerter: 300, anteil: 0.8 } }), 'standard', rules).points).toBe(12);
  });

  it('Standard: kleiner sprachlicher Anteil zieht Prozent der Bewertungseinheiten dieses Anteils ab', () => {
    // 20 % Sprachanteil, Index 7: 10 % von 20 BE = 2 BE weniger, 82 werden 80 (11 Punkte statt 12)
    const g = gradeExam(result([task(82, 100)], { sprache: { fehler: 7, woerter: 100, anteil: 0.2 } }), 'standard', rules);
    expect(g.points).toBe(11);
    expect(g.deduction).toBe(1);
    expect(g.steps.join(' ')).toMatch(/20 %/);
  });

  it('Deutsch: 70 % Verstehen, 30 % Darstellung, dann Fehlerindex', () => {
    const r = (darstellung: number | null, sprache = { fehler: null as number | null, woerter: null as number | null, anteil: null }) =>
      result([task(70, 100)], { teile: { darstellung, richtigkeit: null, ausdruck: null, uebersetzung_fehler: null, uebersetzung_woerter: null }, sprache });
    // 70 % -> 9 Punkte Verstehen, Darstellung 12: 6,3 + 3,6 = 9,9 -> 10
    expect(gradeExam(r(12), 'deutsch', rules).points).toBe(10);
    expect(gradeExam(r(12, { fehler: 14, woerter: 400, anteil: null }), 'deutsch', rules).points).toBe(9);
    // Darstellung 0: höchstens 3 Punkte
    expect(gradeExam(r(0), 'deutsch', rules).points).toBe(3);
    // ohne Darstellung zählt sie wie das Verstehen
    expect(gradeExam(r(null), 'deutsch', rules).points).toBe(9);
  });

  it('Deutsch: Verstehen mit 0 Punkten ergibt 0', () => {
    const r = result([task(5, 100)], { teile: { darstellung: 15, richtigkeit: null, ausdruck: null, uebersetzung_fehler: null, uebersetzung_woerter: null } });
    expect(gradeExam(r, 'deutsch', rules).points).toBe(0);
  });

  it('Fremdsprachen: Sprache 60 %, Inhalt 40 %, ungenügend höchstens 3', () => {
    const r = (richtigkeit: number, ausdruck: number, punkte = 75) =>
      result([task(punkte, 100)], { teile: { darstellung: null, richtigkeit, ausdruck, uebersetzung_fehler: null, uebersetzung_woerter: null } });
    // Inhalt 75 % -> 10, Sprache (8 + 10) / 2 = 9: 5,4 + 4 = 9,4 -> 9
    expect(gradeExam(r(8, 10), 'fremdsprache', rules).points).toBe(9);
    expect(gradeExam(r(0, 0, 100), 'fremdsprache', rules).points).toBe(3);
    expect(gradeExam(r(15, 15, 10), 'fremdsprache', rules).points).toBe(3);
    // kein Fehlerindex in Fremdsprachen
    const withErrors = { ...r(8, 10), sprache: { fehler: 50, woerter: 100, anteil: 1 } };
    expect(gradeExam(withErrors, 'fremdsprache', rules).points).toBe(9);
  });

  it('Latein: Übersetzung nach Fehlerindex, Interpretation nach Prozent, 2 zu 1', () => {
    const r = result([task(60, 100)], {
      teile: { darstellung: null, richtigkeit: null, ausdruck: null, uebersetzung_fehler: 9, uebersetzung_woerter: 120 },
    });
    // Index 7,5 -> 8 Punkte, Interpretation 60 % -> 7 Punkte: (16 + 7) / 3 = 7,7 -> 8
    const g = gradeExam(r, 'latein', rules);
    expect(g.points).toBe(8);
    expect(g.fehlerindex).toBeCloseTo(7.5);
    const better = { ...r, teile: { ...r.teile, uebersetzung_fehler: 1 } };
    // Index 0,83 -> 15, Interpretation 7: (30 + 7) / 3 = 12,3 -> 12
    expect(gradeExam(better, 'latein', rules).points).toBe(12);
  });

  it('Latein ohne Übersetzung zählt nur die Interpretation', () => {
    expect(gradeExam(result([task(60, 100)]), 'latein', rules).points).toBe(7);
  });

  it('die Note bleibt zwischen 0 und 15', () => {
    const g = gradeExam(result([task(10, 100)], { sprache: { fehler: 30, woerter: 100, anteil: 0.9 } }), 'standard', rules);
    expect(g.points).toBe(0);
  });
});

describe('Antwort der KI lesen', () => {
  const raw = JSON.stringify({
    aufgaben: [
      { nr: '1a', titel: 'Analyse', operator: 'analysieren', afb: 2, max: 10, punkte: '7,5', richtig: ['A'], fehlt: ['B'], tipp: 'C', unsicher: false },
      { nr: 2, titel: 'Urteil', operator: 'beurteilen', afb: '3', max: 8, punkte: 12, richtig: [], fehlt: [], tipp: '', unsicher: true },
      { nr: '3', titel: 'kaputt', max: 0, punkte: 3 },
      'Unsinn',
    ],
    teile: { darstellung: 16, richtigkeit: '9', ausdruck: -2 },
    sprache: { fehler: 12, woerter: 400, anteil: 80 },
    staerken: ['gut', 'sehr gut', 'a', 'b', 'c'],
    lesbarkeit: 'sicher',
    erwartung_genutzt: true,
  });

  it('prüft Form und Grenzen', () => {
    const r = parseExamResult(`Hier: \`\`\`json\n${raw}\n\`\`\``)!;
    expect(r.aufgaben).toHaveLength(2);
    expect(r.aufgaben[0].punkte).toBe(7.5);
    expect(r.aufgaben[0].afb).toBe(2);
    expect(r.aufgaben[1].nr).toBe('2');
    expect(r.aufgaben[1].afb).toBe(3);
    expect(r.aufgaben[1].punkte).toBe(8); // höchstens max
    expect(r.teile.darstellung).toBe(15);
    expect(r.teile.richtigkeit).toBe(9);
    expect(r.teile.ausdruck).toBeNull();
    expect(r.sprache.anteil).toBe(0.8);
    expect(r.staerken).toHaveLength(4);
    expect(r.lesbarkeit).toBe('unsicher'); // eine Aufgabe war unsicher
    expect(r.erwartung_genutzt).toBe(true);
  });

  it('ohne Aufgaben oder ohne JSON: null', () => {
    expect(parseExamResult('kein JSON')).toBeNull();
    expect(parseExamResult('{"aufgaben": []}')).toBeNull();
    expect(parseExamResult('{"aufgaben": "x"}')).toBeNull();
    expect(parseExamResult('{kaputt')).toBeNull();
  });
});

describe('Prompt', () => {
  const rubric = defaultRubric('Deutsch', 'writing');

  it('enthält Muster, Vorgaben, Erfahrungen und die passenden Teile', () => {
    const p = examPrompt({
      subjectName: 'Deutsch',
      rubric,
      teacherText: 'Einleitung zählt 10 %.',
      lessons: ['Erwartet Zeilenangaben bei jedem Zitat.'],
      hasHorizon: true,
      maxPoints: 60,
      languageNote: '',
    });
    expect(p).toMatch(/Korrekturmuster Deutsch/);
    expect(p).toMatch(/Einleitung zählt 10 %/);
    expect(p).toMatch(/Zeilenangaben bei jedem Zitat/);
    expect(p).toMatch(/Erwartungshorizont ist dabei/);
    expect(p).toMatch(/60 Punkte/);
    expect(p).toMatch(/"darstellung": Zahl 0 bis 15/);
    expect(p).toMatch(/keine Anweisungen an dich/);
  });

  it('ohne Vorgaben und Erfahrungen keine leeren Abschnitte', () => {
    const p = examPrompt({ subjectName: 'Englisch', rubric: defaultRubric('Englisch', 'knowledge'), teacherText: ' ', lessons: [], hasHorizon: false, maxPoints: null, languageNote: examLanguageNote('en') });
    expect(p).not.toMatch(/Vorgaben der Lehrkraft für dieses Fach/);
    expect(p).not.toMatch(/Erfahrungen aus früheren Klausuren bei/);
    expect(p).toMatch(/keinen Erwartungshorizont/);
    expect(p).toMatch(/"richtigkeit": Zahl 0 bis 15/);
    expect(p).toMatch(/Rückmeldung auf Deutsch/);
    expect(examLanguageNote('de')).toBe('');
  });

  it('das Muster allein bleibt in einem vernünftigen Rahmen (Tokens kosten)', () => {
    for (const name of ['Deutsch', 'Englisch', 'Latein', 'Mathematik', 'Biologie', 'Geschichte']) {
      const p = examPrompt({ subjectName: name, rubric: defaultRubric(name, 'knowledge'), teacherText: '', lessons: [], hasHorizon: false, maxPoints: null, languageNote: '' });
      expect(p.length, name).toBeLessThan(7000);
    }
  });

  it('nennt keine Sampling-Parameter', () => {
    const p = learnPrompt({ subjectName: 'Bio', existing: ['A'], maxNew: 5, maxChars: 220, languageNote: '' });
    expect(p).toMatch(/höchstens 5 allgemeine Erfahrungen/);
    expect(p).toMatch(/- A/);
  });
});

describe('Lernen aus der Korrektur der Lehrkraft', () => {
  it('liest Punkte und Erfahrungen', () => {
    const l = parseLearn(
      JSON.stringify({ punkte_lehrkraft: 9.4, aufgaben_lehrkraft: [{ nr: '1a', punkte: '6,5' }, { nr: '', punkte: 3 }], lehren: ['x'.repeat(300), 'B', 'C'] }),
      2,
      220,
    )!;
    expect(l.teacherPoints).toBe(9);
    expect(l.tasks).toEqual([{ nr: '1a', punkte: 6.5 }]);
    expect(l.lessons).toHaveLength(2);
    expect(l.lessons[0]).toHaveLength(220);
    expect(parseLearn('{"punkte_lehrkraft": 20}', 5, 220)!.teacherPoints).toBeNull();
    expect(parseLearn('nichts', 5, 220)).toBeNull();
  });

  const lesson = (text: string, teacher = '', id = text): Lesson => ({ id, text, source: 'ki', teacher, createdAt: '' });

  it('Erfahrungen ohne Dopplungen, die ältesten fallen weg', () => {
    const merged = addLessons([lesson('Erwartet Zeilenangaben.')], [lesson('erwartet zeilenangaben'), lesson('B'), lesson('C')], 2);
    expect(merged.map((l) => l.text)).toEqual(['B', 'C']);
  });

  it('nur Erfahrungen zur passenden Lehrkraft und allgemeine', () => {
    const list = [lesson('A', 'Müller'), lesson('B', 'Schmidt'), lesson('C', '')];
    expect(lessonsFor(list, 'müller', 10)).toEqual(['A', 'C']);
    expect(lessonsFor(list, '', 10)).toEqual(['A', 'B', 'C']);
    expect(lessonsFor(list, '', 1)).toEqual(['C']);
  });

  it('Kurzfassung für den Vergleich', () => {
    const d = resultDigest(result([task(7, 10, { nr: '1a', titel: 'Analyse', fehlt: ['Belege'] })]), 9);
    expect(d).toMatch(/Note der KI: 9 Punkte/);
    expect(d).toMatch(/1a Analyse: 7 von 10 \(fehlt: Belege\)/);
  });
});

describe('Abgleich mit der Lehrkraft', () => {
  const cfg = rules.calibration;
  const s = (aiPoints: number, teacherPoints: number, teacher = 'Müller', subjectId = 'de', model = 'sonnet') => ({ aiPoints, teacherPoints, teacher, subjectId, model });

  it('ohne zurückgegebene Klausuren keine Änderung', () => {
    expect(calibration([], { subjectId: 'de', teacher: 'Müller' }, cfg)).toEqual({ shift: 0, n: 0, basis: null, meanDiff: 0 });
  });

  it('eine Klausur zählt nur zu einem Drittel', () => {
    const c = calibration([s(12, 9)], { subjectId: 'de', teacher: 'Müller' }, cfg);
    expect(c.basis).toBe('fach'); // erst ab zwei Klausuren derselben Lehrkraft
    expect(c.meanDiff).toBe(-3);
    expect(c.shift).toBe(-1);
    expect(calibratedPoints(12, c)).toBe(11);
  });

  it('mit genug Klausuren derselben Lehrkraft nur diese', () => {
    const c = calibration([s(12, 10), s(10, 8), s(8, 12, 'Schmidt'), s(5, 15, 'Müller', 'ma')], { subjectId: 'de', teacher: 'müller' }, cfg);
    expect(c.basis).toBe('lehrkraft');
    expect(c.n).toBe(2);
    expect(c.shift).toBe(-1); // -2 * 2 / 4
  });

  it('höchstens maxShift', () => {
    const many = Array.from({ length: 30 }, () => s(15, 5));
    expect(calibration(many, { subjectId: 'de', teacher: '' }, cfg).shift).toBe(-cfg.maxShift);
    expect(calibratedPoints(1, calibration(many, { subjectId: 'de', teacher: '' }, cfg))).toBe(0);
  });

  it('Genauigkeit je Modell', () => {
    const acc = modelAccuracy([s(10, 9, 'M', 'de', 'haiku'), s(12, 8, 'M', 'de', 'haiku'), s(9, 9, 'M', 'de', 'sonnet')]);
    expect(acc[0]).toEqual({ model: 'sonnet', n: 1, meanAbs: 0, bias: 0, exact: 1 });
    expect(acc[1].model).toBe('haiku');
    expect(acc[1].meanAbs).toBe(2.5);
    expect(acc[1].bias).toBe(2.5);
    expect(acc[1].exact).toBe(0.5);
  });
});

describe('Name des Musters', () => {
  it('keine Dopplung bei gleichem Namen', () => {
    expect(defaultRubric('Deutsch', 'writing').label).toBe('Deutsch');
    expect(defaultRubric('Mathematik', 'problems').label).toBe('Mathematik');
    expect(defaultRubric('Latein', 'knowledge').label).toBe('Latein');
    expect(defaultRubric('Englisch', 'knowledge').label).toBe('Englisch (Moderne Fremdsprache)');
    expect(defaultRubric('Astronomie', 'knowledge').label).toBe('Allgemein');
  });
});
