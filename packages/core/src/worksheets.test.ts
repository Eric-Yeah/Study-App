import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { languageRule } from './languages';
import {
  chooseModel,
  chunkPages,
  costUsd,
  escalationChoice,
  estimateInputTokens,
  fitsBudget,
  fitWithin,
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
  const tenImages = Array.from({ length: ai.maxImagesPerRequest }, (_, i) => image(i));

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

  it('der schlimmste Fall einer Anfrage mit 10 Bildern: Sonnet unter 10 Cent, Haiku weit darunter', () => {
    const sonnet = worstCaseUsd(tenImages, SONNET, ai);
    expect(sonnet).toBeGreaterThan(0.05);
    expect(sonnet).toBeLessThan(0.1);
    const haiku = worstCaseUsd(tenImages, HAIKU, ai);
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
    for (const [model, minRequests] of [[SONNET, 50], [HAIKU, 1000]] as const) {
      const worst = worstCaseUsd(tenImages, model, ai);
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
    for (const name of ['config.ts', 'worksheets.ts', 'cardsAi.ts', 'languages.ts', 'examGrading.ts', 'practiceExam.ts', 'topics.ts', 'taskStyle.ts', 'access.ts']) {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
      const copy = readFileSync(new URL(`../../../supabase/functions/_shared/${name}`, import.meta.url), 'utf8');
      expect(copy, `${name} ist veraltet, bitte npm run sync:shared ausführen`).toBe(source);
    }
  });

  it('worksheets.ts, cardsAi.ts, languages.ts, examGrading.ts, practiceExam.ts, topics.ts, taskStyle.ts und access.ts importieren nichts, sonst läuft es in Deno nicht', () => {
    for (const name of ['worksheets.ts', 'cardsAi.ts', 'languages.ts', 'examGrading.ts', 'practiceExam.ts', 'topics.ts', 'taskStyle.ts', 'access.ts']) {
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
