import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { languageRule } from './languages';
import { EXAM_RESULT_SCHEMA, LEARN_SCHEMA, parseExamResult, parseLearn } from './examGrading';
import { parseStyle, STYLE_SCHEMA } from './taskStyle';
import { parseTopics, TOPICS_SCHEMA } from './topics';
import {
  chooseModel,
  chunkPages,
  costUsd,
  escalationChoice,
  estimateInputTokens,
  fitsBudget,
  fitWithin,
  imageTokenBound,
  jpegSize,
  outputConfig,
  requestCostUsd,
  SUMMARY_SCHEMA,
  mergeSummaries,
  needsOcr,
  normalizeForceEffort,
  parseSummary,
  priceOf,
  shouldEscalate,
  spentUsd,
  summaryPrompt,
  worstCaseUsd,
  type WorksheetPage,
} from './worksheets';

const text = (t = 'Text'): WorksheetPage => ({ type: 'text', text: t });
const image = (n: number): WorksheetPage => ({ type: 'image', path: `u/${n}.jpg` });

describe('needsOcr', () => {
  it('zu wenig Zeichen heißt Bild, Leerraum zählt nicht', () => {
    const min = CONFIG.ai.minCharsPerPage;
    expect(needsOcr('', min)).toBe(true);
    expect(needsOcr('   \n\n  ', min)).toBe(true);
    expect(needsOcr('a'.repeat(min - 1), min)).toBe(true);
    expect(needsOcr('a'.repeat(min), min)).toBe(false);
    expect(needsOcr(`${'a '.repeat(min)}`, min)).toBe(false);
    expect(needsOcr('a      b'.repeat(2), 20)).toBe(true); // 8 Zeichen nach dem Zusammenfassen von Leerraum
  });
});

describe('fitWithin', () => {
  it('verkleinert die längste Kante auf maxEdge und behält das Seitenverhältnis', () => {
    expect(fitWithin(3200, 2400, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(2400, 3200, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(4000, 1000, 1600)).toEqual({ width: 1600, height: 400 });
  });

  it('vergrößert nie', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
    expect(fitWithin(1, 1, 1600)).toEqual({ width: 1, height: 1 });
  });

  it('bleibt bei Rundung und Randfällen mindestens 1 Pixel groß', () => {
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 });
    expect(fitWithin(0, 0, 1600)).toEqual({ width: 1, height: 1 });
  });
});

describe('Kosten und Monatsbudget', () => {
  const ai = CONFIG.ai;
  const HAIKU = 'claude-haiku-5-5';
  const SONNET = 'claude-sonnet-5-5';
  const tenImages = Array.from({ length: ai.maxImagesPerRequest }, (_, i) => image(i)); // Maße unbekannt: Höchstwert
  // So schickt die App Blätter: A4 mit 1600 px längster Kante, Tokens aus den Maßen gemessen
  const a4Tokens = imageTokenBound({ width: 1131, height: 1600 }, ai);
  const tenA4: WorksheetPage[] = Array.from({ length: ai.maxImagesPerRequest }, (_, i) => ({ type: 'image', path: `u/${i}.jpg`, tokens: a4Tokens }));

  it('rechnet Tokens in Dollar um, je Modell mit seinem Preis', () => {
    expect(costUsd(SONNET, 1_000_000, 0, ai.prices)).toBe(2);
    expect(costUsd(SONNET, 0, 1_000_000, ai.prices)).toBe(10);
    expect(costUsd(SONNET, 10_000, 1_000, ai.prices)).toBeCloseTo(0.03, 10);
    expect(costUsd(HAIKU, 1_000_000, 0, ai.prices)).toBeCloseTo(0.1, 10);
    expect(costUsd(HAIKU, 0, 1_000_000, ai.prices)).toBeCloseTo(0.5, 10);
    expect(costUsd(SONNET, -5, -5, ai.prices)).toBe(0);
  });

  it('ein unbekanntes Modell rechnet mit dem teuersten bekannten Preis, nie zu billig', () => {
    expect(priceOf('claude-gibts-nicht', ai.prices)).toEqual(ai.prices[SONNET]);
    expect(costUsd('', 1_000_000, 0, ai.prices)).toBe(2);
    expect(priceOf('x', {})).toEqual({ inputUsdPerMTok: 0, outputUsdPerMTok: 0 });
  });

  it('jedes Modell aus CONFIG.ai.models hat einen Preis', () => {
    for (const [task, { model }] of Object.entries(ai.models)) expect(ai.prices[model], `${task}: ${model}`).toBeDefined();
  });

  it('die Aufgaben nutzen die gewünschten Modelle', () => {
    expect(ai.models.text).toEqual({ model: HAIKU, effort: 'medium' });
    expect(ai.models.image).toEqual({ model: HAIKU, effort: 'medium' });
    expect(ai.models.escalation).toEqual({ model: SONNET, effort: 'medium' });
    expect(ai.models.exam).toEqual({ model: SONNET, effort: 'medium' });
  });

  it('summiert den Monat aus den Zeilen je Modell', () => {
    const rows = [
      { model: SONNET, input_tokens: 100_000, output_tokens: 10_000 }, // 0,2 + 0,1
      { model: HAIKU, input_tokens: 1_000_000, output_tokens: 100_000 }, // 0,1 + 0,05
    ];
    expect(spentUsd(rows, ai.prices)).toBeCloseTo(0.45, 10);
    expect(spentUsd([], ai.prices)).toBe(0);
    expect(spentUsd([{ model: SONNET, input_tokens: Number('500000') as number, output_tokens: 0 }], ai.prices)).toBeCloseTo(1, 10);
  });

  it('schätzt die Eingabe nach oben: Bilder mit Höchstwert, Text nach Zeichen', () => {
    expect(estimateInputTokens([], ai)).toBe(ai.promptOverheadTokens);
    expect(estimateInputTokens([image(1)], ai)).toBe(ai.promptOverheadTokens + ai.maxImageTokens);
    expect(estimateInputTokens([text('a'.repeat(250))], ai)).toBe(ai.promptOverheadTokens + 100);
  });

  it('eine größte Anfrage bleibt für Haiku unter 100.000 Token (sonst gilt der höhere Preis)', () => {
    const biggest = [...tenImages, text('a'.repeat(80_000))];
    expect(estimateInputTokens(biggest, ai)).toBeLessThan(100_000);
  });

  it('der schlimmste Fall einer Anfrage mit 10 A4-Bildern: Sonnet unter 10 Cent, Haiku weit darunter', () => {
    const sonnet = worstCaseUsd(tenA4, SONNET, ai);
    expect(sonnet).toBeGreaterThan(0.05);
    expect(sonnet).toBeLessThan(0.1);
    // Ohne lesbare Maße rechnet die Grenze mit dem Höchstwert und liegt darüber
    expect(worstCaseUsd(tenImages, SONNET, ai)).toBeGreaterThan(sonnet);
    const haiku = worstCaseUsd(tenA4, HAIKU, ai);
    expect(haiku).toBeLessThan(0.01);
    expect(haiku).toBeLessThan(sonnet / 10);
  });

  it('das Budget bleibt im gewünschten Rahmen von 3 bis 5 Euro', () => {
    // Der Kurs schwankt: bei 1,05 bis 1,20 US-Dollar je Euro soll das Budget zwischen 3 und 5 Euro liegen.
    expect(ai.monthlyBudgetUsd / 1.2).toBeGreaterThanOrEqual(3);
    expect(ai.monthlyBudgetUsd / 1.05).toBeLessThanOrEqual(5);
  });

  it('fitsBudget lässt die letzte Anfrage zu, die gerade noch passt, und lehnt die nächste ab', () => {
    const worst = worstCaseUsd(tenImages, SONNET, ai);
    expect(fitsBudget(0, worst, ai.monthlyBudgetUsd)).toBe(true);
    expect(fitsBudget(ai.monthlyBudgetUsd - worst, worst, ai.monthlyBudgetUsd)).toBe(true);
    expect(fitsBudget(ai.monthlyBudgetUsd - worst + 0.001, worst, ai.monthlyBudgetUsd)).toBe(false);
    expect(fitsBudget(ai.monthlyBudgetUsd, 0.0001, ai.monthlyBudgetUsd)).toBe(false);
  });

  it('auch im schlimmsten Fall bleibt der Monat unter dem Budget, mit jedem Modell', () => {
    for (const [pages, model, minRequests] of [[tenA4, SONNET, 50], [tenImages, SONNET, 40], [tenA4, HAIKU, 1000], [tenImages, HAIKU, 800]] as const) {
      const worst = worstCaseUsd(pages, model, ai);
      let spent = 0;
      let n = 0;
      while (fitsBudget(spent, worst, ai.monthlyBudgetUsd) && n < 100_000) {
        spent += worst; // schlimmer als alles, was wirklich entstehen kann
        n++;
      }
      expect(spent, model).toBeLessThanOrEqual(ai.monthlyBudgetUsd);
      expect(n, model).toBeGreaterThanOrEqual(minRequests);
    }
  });
});

/** Kleinster JPEG-Kopf mit SOF0 (Baseline) oder SOF2 (progressiv), davor ein APP0-Block. */
const jpegHeader = (width: number, height: number, sof = 0xc0): Uint8Array =>
  new Uint8Array([
    0xff, 0xd8, // Start
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // APP0 (JFIF)
    0xff, sof, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);

describe('Bild-Tokens als Obergrenze', () => {
  const ai = CONFIG.ai;

  it('jpegSize liest Breite und Höhe aus dem Kopf (Baseline und progressiv)', () => {
    expect(jpegSize(jpegHeader(1131, 1600))).toEqual({ width: 1131, height: 1600 });
    expect(jpegSize(jpegHeader(1600, 1200, 0xc2))).toEqual({ width: 1600, height: 1200 });
    expect(jpegSize(jpegHeader(8000, 8000))).toEqual({ width: 8000, height: 8000 });
  });

  it('jpegSize: kein JPEG, abgeschnitten oder ohne Kopf ergibt null', () => {
    expect(jpegSize(new Uint8Array([]))).toBeNull();
    expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG
    expect(jpegSize(new Uint8Array([255, 216, 255, 1, 2, 3]))).toBeNull();
    expect(jpegSize(jpegHeader(1131, 1600).slice(0, 25))).toBeNull();
    expect(jpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]))).toBeNull(); // Bilddaten vor dem Kopf
    expect(jpegSize(jpegHeader(0, 1600))).toBeNull();
  });

  it('Kacheln von 28 px wie in der Doku: ⌈B/28⌉ x ⌈H/28⌉ plus Zuschlag', () => {
    expect(imageTokenBound({ width: 1131, height: 1600 }, ai)).toBe(41 * 58 + ai.imageTokenMargin);
    expect(imageTokenBound({ width: 1600, height: 1200 }, ai)).toBe(58 * 43 + ai.imageTokenMargin);
    expect(imageTokenBound({ width: 1000, height: 1000 }, ai)).toBe(1296 + ai.imageTokenMargin); // Beispiel der Doku: 1.296 Token
    expect(imageTokenBound({ width: 200, height: 200 }, ai)).toBe(64 + ai.imageTokenMargin); // Beispiel der Doku: 64 Token
  });

  it('nie unter dem, was Claude berechnen kann: große Bilder und unbekannte Maße nehmen den Höchstwert des Modells', () => {
    expect(ai.maxImageTokens).toBeGreaterThanOrEqual(4784); // Höchstwert bei hoher Auflösung laut Doku
    expect(imageTokenBound({ width: 3840, height: 2160 }, ai)).toBe(ai.maxImageTokens);
    expect(imageTokenBound({ width: 8000, height: 8000 }, ai)).toBe(ai.maxImageTokens);
    expect(imageTokenBound(null, ai)).toBe(ai.maxImageTokens);
    expect(imageTokenBound({ width: NaN, height: 100 }, ai)).toBe(ai.maxImageTokens);
    // Für jede Größe: mindestens die Kachelzahl (begrenzt durch den Höchstwert der Doku)
    for (let w = 1; w <= 3000; w += 97) {
      for (let h = 1; h <= 3000; h += 89) {
        const docTokens = Math.min(Math.ceil(w / 28) * Math.ceil(h / 28), 4784);
        expect(imageTokenBound({ width: w, height: h }, ai)).toBeGreaterThanOrEqual(docTokens);
      }
    }
  });

  it('estimateInputTokens nimmt gemessene Tokens, ungültige Werte zählen mit dem Höchstwert, nie mehr als der Höchstwert', () => {
    const base = ai.promptOverheadTokens;
    expect(estimateInputTokens([{ type: 'image', path: 'u/1.jpg', tokens: 2394 }], ai)).toBe(base + 2394);
    for (const bad of [0, -5, NaN, Infinity]) expect(estimateInputTokens([{ type: 'image', path: 'u/1.jpg', tokens: bad }], ai)).toBe(base + ai.maxImageTokens);
    expect(estimateInputTokens([{ type: 'image', path: 'u/1.jpg', tokens: 99_999 }], ai)).toBe(base + ai.maxImageTokens);
  });

  it('Haiku über 100.000 Token Eingabe: der schlimmste Fall rechnet mit dem höheren Preis', () => {
    const HAIKU = 'claude-haiku-5-5';
    expect(requestCostUsd(HAIKU, 100_000, 1000, ai.prices)).toBeCloseTo((100_000 * 0.1 + 1000 * 0.5) / 1e6, 12);
    expect(requestCostUsd(HAIKU, 100_001, 1000, ai.prices)).toBeCloseTo((100_001 * 0.5 + 1000 * 2.5) / 1e6, 12);
    expect(requestCostUsd('claude-sonnet-5-5', 200_000, 0, ai.prices)).toBeCloseTo(0.4, 12);
    const many: WorksheetPage[] = Array.from({ length: 24 }, (_, i) => ({ type: 'image', path: `u/${i}.jpg` }));
    const pricing = { ...ai, maxTokens: 1000 };
    expect(worstCaseUsd(many, HAIKU, pricing)).toBeCloseTo(requestCostUsd(HAIKU, estimateInputTokens(many, pricing), 1000, ai.prices), 12);
    expect(worstCaseUsd(many, HAIKU, pricing)).toBeGreaterThan(costUsd(HAIKU, estimateInputTokens(many, pricing), 1000, ai.prices));
  });
});

describe('strukturierte Ausgabe', () => {
  it('outputConfig: Effort allein oder mit JSON-Schema im selben Objekt', () => {
    expect(outputConfig('medium')).toEqual({ effort: 'medium' });
    expect(outputConfig('high', SUMMARY_SCHEMA)).toEqual({ effort: 'high', format: { type: 'json_schema', schema: SUMMARY_SCHEMA } });
  });

  it('SUMMARY_SCHEMA: alle Felder Pflicht, keine weiteren, passt zu parseSummary', () => {
    expect(SUMMARY_SCHEMA.additionalProperties).toBe(false);
    expect([...SUMMARY_SCHEMA.required].sort()).toEqual(Object.keys(SUMMARY_SCHEMA.properties).sort());
    const sample = { thema: 'Optik', kernaussagen: ['a'], begriffe: ['b'], formeln: [], offene_fragen: [], lesbarkeit: 'sicher' };
    expect(Object.keys(parseSummary(JSON.stringify(sample))!).sort()).toEqual([...SUMMARY_SCHEMA.required].sort());
    expect(SUMMARY_SCHEMA.properties.lesbarkeit.enum).toEqual(['sicher', 'unsicher']);
  });

  // Regeln der strukturierten Ausgabe (Anthropic-Doku): jedes Objekt mit additionalProperties: false, hier alle Felder Pflicht,
  // keine Zahl- oder Längengrenzen (minimum, maxLength usw. werden nicht unterstützt), keine Rekursion.
  const UNSUPPORTED = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', '$ref'];
  const checkSchema = (node: unknown, path: string): void => {
    if (typeof node !== 'object' || node === null) return;
    const n = node as Record<string, unknown>;
    for (const k of UNSUPPORTED) expect(k in n, `${path}: ${k}`).toBe(false);
    if (n.type === 'object') {
      expect(n.additionalProperties, path).toBe(false);
      const props = Object.keys(n.properties as object);
      expect([...(n.required as string[])].sort(), path).toEqual(props.sort());
      for (const [k, v] of Object.entries(n.properties as object)) checkSchema(v, `${path}.${k}`);
    }
    if (n.items) checkSchema(n.items, `${path}[]`);
    if (Array.isArray(n.anyOf)) n.anyOf.forEach((v, i) => checkSchema(v, `${path}|${i}`));
  };

  it('alle Schemas halten die Regeln ein', () => {
    for (const [name, schema] of Object.entries({ SUMMARY_SCHEMA, EXAM_RESULT_SCHEMA, LEARN_SCHEMA, TOPICS_SCHEMA, STYLE_SCHEMA })) checkSchema(schema, name);
  });

  it('eine Antwort genau in der Form der Schemas lesen die bisherigen Parser (Sicherung bleibt gleich)', () => {
    const exam = {
      aufgaben: [{ nr: '1', titel: 'Analyse', operator: 'analysieren', afb: 2, max: 10, max_geschaetzt: false, punkte: 7.5, richtig: ['a'], fehlt: ['b'], tipp: 'c', unsicher: false }],
      teile: { darstellung: 11, richtigkeit: null, ausdruck: null, uebersetzung_fehler: null, uebersetzung_woerter: null },
      sprache: { fehler: 4, woerter: 600, anteil: 0.9 },
      staerken: ['s'], schwaechen: ['w'], naechste_schritte: ['n'], lesbarkeit: 'sicher', erwartung_genutzt: false,
    };
    expect(Object.keys(exam).sort()).toEqual([...EXAM_RESULT_SCHEMA.required].sort());
    const r = parseExamResult(JSON.stringify(exam))!;
    expect(r.aufgaben[0].punkte).toBe(7.5);
    expect(r.teile.darstellung).toBe(11);
    expect(r.lesbarkeit).toBe('sicher');
    const learn = parseLearn(JSON.stringify({ punkte_lehrkraft: 9, aufgaben_lehrkraft: [{ nr: '1', punkte: 6 }], lehren: ['x'] }), 5, 220)!;
    expect(learn).toEqual({ teacherPoints: 9, tasks: [{ nr: '1', punkte: 6 }], lessons: ['x'] });
    expect(parseTopics(JSON.stringify({ themen: [{ titel: 'Optik', quellen: [1] }] }), 2, [], 12, 80)).toEqual([{ title: 'Optik', sources: [1] }]);
    const style = { zusammenfassung: 'z', aufbau: ['a'], formulierungen: [], operatoren: [], materialien: [], bewertung: [], besonderheiten: [] };
    expect(Object.keys(style).sort()).toEqual([...STYLE_SCHEMA.required].sort());
    expect(parseStyle(JSON.stringify(style), CONFIG.style)?.aufbau).toEqual(['a']);
  });
});

describe('Modellwahl', () => {
  const models = CONFIG.ai.models;

  it('nur Text: Text-Modell, mit Bild: Bild-Modell', () => {
    expect(chooseModel([text(), text()], undefined, models)).toEqual({ task: 'text', ...models.text });
    expect(chooseModel([], undefined, models)).toEqual({ task: 'text', ...models.text });
    expect(chooseModel([text(), image(1)], undefined, models)).toEqual({ task: 'image', ...models.image });
    expect(chooseModel([image(1)], undefined, models).effort).toBe('medium');
  });

  it('"Genauer lesen" (forceEffort) nimmt das Modell der Eskalation mit diesem Effort', () => {
    expect(chooseModel([text()], 'high', models)).toEqual({ task: 'escalation', model: models.escalation.model, effort: 'high' });
    expect(chooseModel([image(1)], 'medium', models)).toEqual({ task: 'escalation', model: models.escalation.model, effort: 'medium' });
  });

  it('ungültiges forceEffort wird ignoriert', () => {
    for (const bad of ['low', 'max', 'xhigh', 42, null, undefined, {}]) expect(chooseModel([image(1)], bad, models).task, String(bad)).toBe('image');
    expect(normalizeForceEffort('medium')).toBe('medium');
    expect(normalizeForceEffort(undefined)).toBeNull();
  });

  it('bei unsicherer Lesbarkeit geht es einmal zur Eskalation, nicht von dort aus noch einmal', () => {
    const first = chooseModel([image(1)], undefined, models);
    expect(shouldEscalate('unsicher', first)).toBe(true);
    expect(shouldEscalate('unsicher', chooseModel([text()], undefined, models))).toBe(true);
    expect(shouldEscalate('sicher', first)).toBe(false);
    expect(shouldEscalate('unsicher', escalationChoice(models))).toBe(false);
    expect(shouldEscalate('unsicher', chooseModel([image(1)], 'high', models))).toBe(false);
    expect(escalationChoice(models)).toEqual({ task: 'escalation', model: models.escalation.model, effort: 'medium' });
  });

  it('die Function setzt kein temperature, top_p oder top_k', () => {
    for (const file of ['summarize-worksheet/index.ts']) {
      const source = readFileSync(new URL(`../../../supabase/functions/${file}`, import.meta.url), 'utf8')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//')) // Kommentare dürfen es erwähnen
        .join('\n');
      expect(source, file).not.toMatch(/temperature|top_p|top_k/);
    }
  });
});

describe('chunkPages', () => {
  it('teilt nach Bildern, Textseiten bleiben in Reihenfolge', () => {
    const pages = [text('a'), ...[1, 2, 3, 4, 5].map(image), text('b'), image(6)];
    const chunks = chunkPages(pages, 2);
    expect(chunks.map((c) => c.filter((p) => p.type === 'image').length)).toEqual([2, 2, 2]);
    expect(chunks.flat()).toEqual(pages);
    expect(chunks[0][0]).toEqual(text('a'));
  });

  it('bis zur Grenze bleibt alles in einem Päckchen', () => {
    const pages = Array.from({ length: CONFIG.ai.maxImagesPerRequest }, (_, i) => image(i));
    expect(chunkPages(pages, CONFIG.ai.maxImagesPerRequest)).toHaveLength(1);
    expect(chunkPages([...pages, image(99)], CONFIG.ai.maxImagesPerRequest)).toHaveLength(2);
  });

  it('leere Eingabe und nur Text', () => {
    expect(chunkPages([], 10)).toEqual([]);
    expect(chunkPages([text(), text()], 1)).toHaveLength(1);
    expect(chunkPages([image(1), image(2)], 0)).toHaveLength(2); // Grenze mindestens 1
  });
});

describe('parseSummary', () => {
  const ok = { thema: 'Optik', kernaussagen: ['Licht ist eine Welle'], begriffe: ['Brechung'], formeln: ['n = c/v'], offene_fragen: [], lesbarkeit: 'sicher' };

  it('liest sauberes JSON', () => {
    expect(parseSummary(JSON.stringify(ok))).toEqual(ok);
  });

  it('kommt mit Text oder Codeblock um das JSON zurecht', () => {
    expect(parseSummary('Hier:\n```json\n' + JSON.stringify(ok) + '\n```')).toEqual(ok);
    expect(parseSummary('  ' + JSON.stringify(ok) + '  Viel Erfolg!')).toEqual(ok);
  });

  it('lehnt Kaputtes ab', () => {
    expect(parseSummary('')).toBeNull();
    expect(parseSummary('kein json')).toBeNull();
    expect(parseSummary('{"thema": "abgeschnitten", "kernaussagen": ["a"')).toBeNull();
    expect(parseSummary('[1, 2]')).toBeNull();
    expect(parseSummary('{}')).toMatchObject({ thema: '', kernaussagen: [], lesbarkeit: 'unsicher' });
  });

  it('prüft die Form, füllt Fehlendes und begrenzt', () => {
    const r = parseSummary(
      JSON.stringify({ thema: 7, kernaussagen: ['ok', 3, null, { x: 1 }, '  ', 'a'.repeat(5000)], begriffe: 'kein array', lesbarkeit: 'vielleicht' }),
    )!;
    expect(r.thema).toBe('');
    expect(r.kernaussagen).toEqual(['ok', '3', 'a'.repeat(600)]);
    expect(r.begriffe).toEqual([]);
    expect(r.lesbarkeit).toBe('unsicher'); // unbekannter Wert gilt als unsicher
    const many = parseSummary(JSON.stringify({ kernaussagen: Array.from({ length: 200 }, (_, i) => `punkt ${i}`) }))!;
    expect(many.kernaussagen).toHaveLength(40);
  });
});

describe('mergeSummaries', () => {
  const s = (over: Partial<ReturnType<typeof mk>>) => ({ ...mk(), ...over });
  const mk = () => ({ thema: '', kernaussagen: [] as string[], begriffe: [] as string[], formeln: [] as string[], offene_fragen: [] as string[], lesbarkeit: 'sicher' as const });

  it('vereint ohne Doppelte, nimmt das erste Thema, unsicher wenn eines unsicher ist', () => {
    const merged = mergeSummaries([
      s({ thema: '', kernaussagen: ['A', 'B'], begriffe: ['x'] }),
      s({ thema: 'Optik', kernaussagen: ['b', 'C'], lesbarkeit: 'unsicher' as never }),
    ]);
    expect(merged.thema).toBe('Optik');
    expect(merged.kernaussagen).toEqual(['A', 'B', 'C']);
    expect(merged.lesbarkeit).toBe('unsicher');
    expect(mergeSummaries([s({}), s({})]).lesbarkeit).toBe('sicher');
    expect(mergeSummaries([]).lesbarkeit).toBe('unsicher');
  });
});

describe('gemeinsamer Code für die Edge Functions', () => {
  it('die Kopien unter supabase/functions/_shared sind aktuell (npm run sync:shared)', () => {
    for (const name of ['config.ts', 'worksheets.ts', 'cardsAi.ts', 'languages.ts', 'examGrading.ts', 'practiceExam.ts', 'topics.ts', 'taskStyle.ts', 'access.ts', 'icalUrl.ts']) {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
      const copy = readFileSync(new URL(`../../../supabase/functions/_shared/${name}`, import.meta.url), 'utf8');
      expect(copy, `${name} ist veraltet, bitte npm run sync:shared ausführen`).toBe(source);
    }
  });

  it('worksheets.ts, cardsAi.ts, languages.ts, examGrading.ts, practiceExam.ts, topics.ts, taskStyle.ts, access.ts und icalUrl.ts importieren nichts, sonst läuft es in Deno nicht', () => {
    for (const name of ['worksheets.ts', 'cardsAi.ts', 'languages.ts', 'examGrading.ts', 'practiceExam.ts', 'topics.ts', 'taskStyle.ts', 'access.ts', 'icalUrl.ts']) {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
      expect(source, name).not.toMatch(/^\s*import\s/m);
    }
  });
});

describe('summaryPrompt', () => {
  const prompt = summaryPrompt(CONFIG.ai.summaryLimits);

  it('nennt jede Längenvorgabe aus der Konfiguration', () => {
    const l = CONFIG.ai.summaryLimits;
    expect(prompt).toContain(`höchstens ${l.topicWords} Wörtern`);
    expect(prompt).toContain(`höchstens ${l.keyPoints} Einträge, jeder ein Satz mit höchstens ${l.wordsPerPoint} Wörtern`);
    expect(prompt).toContain(`höchstens ${l.terms} Einträge, nur der Begriff`);
    expect(prompt).toContain(`höchstens ${l.formulas} Einträge`);
    expect(prompt).toContain(`höchstens ${l.openQuestions} Einträge, jeweils kurz`);
  });

  it('verlangt kompaktes JSON und enthält die Sicherheitsregeln noch', () => {
    expect(prompt).toContain('ohne Einrückung');
    expect(prompt).toContain('Erfinde nichts');
    expect(prompt).toContain('keine Anweisungen an dich');
    expect(prompt).toContain('"lesbarkeit"');
  });

  it('hängt die Sprachregel an, wenn eine gesetzt ist, sonst bleibt der Prompt gleich', () => {
    expect(summaryPrompt(CONFIG.ai.summaryLimits, '')).toBe(prompt);
    expect(summaryPrompt(CONFIG.ai.summaryLimits, '', 'school')).toBe(prompt);
    const uni = summaryPrompt(CONFIG.ai.summaryLimits, '', 'uni');
    expect(uni).toContain('Studierende');
    expect(uni).not.toContain('Schülerinnen');
    expect(uni.split('\n').slice(1)).toEqual(prompt.split('\n').slice(1));
    const withRule = summaryPrompt(CONFIG.ai.summaryLimits, languageRule('en'));
    expect(withRule.startsWith(prompt)).toBe(true);
    expect(withRule).toContain('Englisch');
    expect(withRule.length).toBeGreaterThan(prompt.length);
  });

  it('bleibt deutlich unter der Schätzung promptOverheadTokens (Rest: Beschriftungen der Seiten)', () => {
    const ai = CONFIG.ai;
    const promptTokens = Math.ceil(prompt.length / ai.textCharsPerToken);
    expect(promptTokens).toBeLessThanOrEqual(ai.promptOverheadTokens - 150);
  });
});
