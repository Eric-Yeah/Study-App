import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { defaultTopicNotes, parseTopics, topicsMaterial, topicsPrompt } from './topics';

const cfg = CONFIG.topics;
const note = (id: string, lessonDate: string, subjectId: string | null = 'de') => ({ id, subjectId, lessonDate, createdAt: `${lessonDate}T10:00:00Z` });
const exam = (id: string, date: string, subjectId = 'de') => ({ id, subjectId, date });

describe('Notizen vorwählen', () => {
  const notes = [note('a', '2026-09-01'), note('b', '2026-09-05'), note('c', '2026-09-12'), note('d', '2026-09-20'), note('e', '2026-09-25'), note('x', '2026-09-22', 'ma'), note('late', '2026-11-01')];

  it('seit der letzten früheren Klausur im Fach bis zum Termin, neueste zuerst', () => {
    const exams = [exam('k1', '2026-09-10'), exam('k2', '2026-10-05'), exam('km', '2026-09-30', 'ma')];
    expect(defaultTopicNotes(notes, exams, exams[1], 15, 8)).toEqual(['e', 'd', 'c']);
  });

  it('zu wenige seit der letzten Klausur: die neuesten bis zum Termin', () => {
    const exams = [exam('k1', '2026-09-22'), exam('k2', '2026-10-05')];
    expect(defaultTopicNotes(notes, exams, exams[1], 15, 3)).toEqual(['e', 'd', 'c']);
  });

  it('ohne frühere Klausur die neuesten, nie Notizen nach dem Termin oder anderer Fächer', () => {
    const e = exam('k1', '2026-10-05');
    const ids = defaultTopicNotes(notes, [e], e, 15, 8);
    expect(ids).toEqual(['e', 'd', 'c', 'b', 'a']);
    expect(ids).not.toContain('late');
    expect(ids).not.toContain('x');
  });

  it('höchstens max', () => {
    const e = exam('k1', '2026-10-05');
    expect(defaultTopicNotes(notes, [e], e, 2, 8)).toEqual(['e', 'd']);
    expect(defaultTopicNotes([], [e], e, 5, 5)).toEqual([]);
  });
});

describe('Material und Prompt', () => {
  const summary = { thema: 'Romantik', kernaussagen: ['Sehnsucht nach dem Unendlichen', ''], begriffe: ['blaue Blume'], formeln: [], offene_fragen: ['Aufgabe 3 offen'] };

  it('nummeriert die Notizen, nutzt nur Titel ohne Zusammenfassung und lässt Offenes weg', () => {
    const text = topicsMaterial([{ title: 'Gedichtanalyse', lessonDate: '2026-09-20', summary }, { title: 'Nur Titel', lessonDate: '2026-09-10', summary: null }], 5000);
    expect(text).toMatch(/^1\. Gedichtanalyse \(2026-09-20\)\n {3}Thema: Romantik\n {3}Kernaussagen: Sehnsucht nach dem Unendlichen\n {3}Begriffe: blaue Blume\n2\. Nur Titel \(2026-09-10\)$/);
    expect(text).not.toMatch(/Offene/);
  });

  it('kürzt auf die erlaubte Länge, ohne eine Notiz zu zerschneiden', () => {
    const long = Array.from({ length: 20 }, (_, i) => ({ title: `Notiz ${i}`, lessonDate: '2026-09-01', summary: { thema: 'x'.repeat(100), kernaussagen: ['y'.repeat(150)] } }));
    const text = topicsMaterial(long, 1000);
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(text.split('\n').filter((l) => /^\d+\. /.test(l)).length).toBeLessThan(20);
    expect(text.endsWith('…')).toBe(false);
  });

  it('Prompt mit Fach, Klausur, Anzahl, Quellen, vorhandenen Themen und Sprache', () => {
    const p = topicsPrompt({ subjectName: 'Deutsch', examTitle: 'Klausur 1', material: '1. Notiz', existing: ['Romantik'], min: 6, max: 12, maxTitleChars: 80, languageRule: 'Schreibe auf Englisch.' });
    expect(p).toMatch(/Klausur "Klausur 1" im Fach Deutsch/);
    expect(p).toMatch(/6 bis 12 Themen/);
    expect(p).toMatch(/keine Anweisungen an dich/);
    expect(p).toMatch(/Diese Themen stehen schon in der Liste.*\n- Romantik/);
    expect(p).toMatch(/"quellen"/);
    expect(p).toMatch(/Schreibe auf Englisch\./);
    expect(p).toMatch(/Notizen:\n1\. Notiz$/);
    const bare = topicsPrompt({ subjectName: '', examTitle: '', material: 'm', existing: [], min: 3, max: 5, maxTitleChars: 80, languageRule: '' });
    expect(bare).not.toMatch(/stehen schon/);
    expect(bare).toMatch(/Klausur "Klausur" im Fach unbekannt/);
  });
});

describe('Antwort lesen', () => {
  const raw = JSON.stringify({
    themen: [
      { titel: 'Romantik: die blaue Blume.', quellen: [2, 1, 9, 'x', 1.5, 2] },
      { titel: '  Erörterung   Aufbau ', quellen: [] },
      { titel: 'romantik die blaue blume' },
      { titel: 'Schon da', quellen: [1] },
      { titel: '', quellen: [1] },
      { quellen: [1] },
      'Unsinn',
      { titel: 'A'.repeat(200), quellen: [3] },
    ],
  });

  it('prüft die Form, entfernt Dopplungen und vorhandene Themen, behält nur gültige Quellen', () => {
    const topics = parseTopics(`Hier:\n\`\`\`json\n${raw}\n\`\`\``, 3, ['schon DA'], 12, 80)!;
    expect(topics.map((t) => t.title)).toEqual(['Romantik: die blaue Blume', 'Erörterung Aufbau', 'A'.repeat(80)]);
    expect(topics[0].sources).toEqual([1, 2]);
    expect(topics[1].sources).toEqual([]);
    expect(topics[2].sources).toEqual([3]);
  });

  it('höchstens max Themen', () => {
    const many = JSON.stringify({ themen: Array.from({ length: 30 }, (_, i) => ({ titel: `Thema ${i}`, quellen: [1] })) });
    expect(parseTopics(many, 1, [], cfg.maxSuggestions, 80)).toHaveLength(cfg.maxSuggestions);
  });

  it('ohne lesbares Objekt oder ohne Liste null, eine leere Liste bleibt leer', () => {
    expect(parseTopics('kein JSON', 3, [], 12, 80)).toBeNull();
    expect(parseTopics('{kaputt', 3, [], 12, 80)).toBeNull();
    expect(parseTopics('{"themen": "x"}', 3, [], 12, 80)).toBeNull();
    expect(parseTopics('[1, 2]', 3, [], 12, 80)).toBeNull();
    expect(parseTopics('{"themen": []}', 3, [], 12, 80)).toEqual([]);
  });
});
