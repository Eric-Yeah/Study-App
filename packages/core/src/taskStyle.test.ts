import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { emptyStyle, parseStyle, sanitizeStyle, styleForPrompt, styleIsEmpty, stylePrompt, type StyleSample, type TaskStyle } from './taskStyle';

const l = CONFIG.style;
const style = (o: Partial<TaskStyle> = {}): TaskStyle => ({ ...emptyStyle(), ...o });
const sample = (teacher: string, createdAt: string, o: Partial<TaskStyle> = {}): StyleSample => ({ teacher, createdAt, style: style(o) });

describe('Stil lesen', () => {
  it('liest die Antwort der KI und bereinigt sie', () => {
    const s = parseStyle(
      'Hier:\n```json\n' + JSON.stringify({ zusammenfassung: '  Streng  und  knapp. ', aufbau: ['Drei Aufgaben', ' ', 7, 'Material M1'], operatoren: ['analysiere', 'beurteile'], extra: 'x' }) + '\n```',
      l,
    )!;
    expect(s.zusammenfassung).toBe('Streng und knapp.');
    expect(s.aufbau).toEqual(['Drei Aufgaben', 'Material M1']);
    expect(s.formulierungen).toEqual([]);
    expect('extra' in s).toBe(false);
  });
  it('begrenzt Einträge und Längen', () => {
    const s = sanitizeStyle({ aufbau: Array.from({ length: 20 }, (_, i) => `Eintrag ${i}`), zusammenfassung: 'x'.repeat(2000), besonderheiten: ['y'.repeat(900)] }, l);
    expect(s.aufbau).toHaveLength(l.maxItems);
    expect(s.zusammenfassung).toHaveLength(l.summaryChars);
    expect(s.besonderheiten[0]).toHaveLength(l.itemChars);
  });
  it('gibt null zurück, wenn nichts zu erkennen ist', () => {
    expect(parseStyle('kein json', l)).toBeNull();
    expect(parseStyle('{"aufbau": []}', l)).toBeNull();
    expect(parseStyle('{kaputt', l)).toBeNull();
    expect(styleIsEmpty(emptyStyle())).toBe(true);
    expect(sanitizeStyle(null, l)).toEqual(emptyStyle());
  });
});

describe('Prompt zum Lernen', () => {
  it('nennt Fach, Lehrkraft und die Form der Antwort', () => {
    const p = stylePrompt({ subjectName: 'Deutsch', teacher: 'Müller', languageNote: '', maxItems: 8 });
    expect(p).toContain('im Fach Deutsch, gestellt von der Lehrkraft Müller');
    expect(p).toContain('"formulierungen"');
    expect(p).toContain('Keine Namen von Schülerinnen');
    expect(stylePrompt({ subjectName: '', teacher: '', languageNote: 'Antworte auf Deutsch.', maxItems: 5 })).toContain('Antworte auf Deutsch.');
  });
});

describe('Stil für die Übungsklausur', () => {
  const limits = { promptSheets: 2, promptItems: 3, promptChars: 2000 };
  it('ist ohne gelernte Blätter leer', () => {
    expect(styleForPrompt([], 'Müller', limits)).toEqual({ lines: [], used: 0 });
    expect(styleForPrompt([sample('Müller', '1')], 'Müller', limits).used).toBe(0);
  });
  it('nimmt die Blätter der Lehrkraft, neueste zuerst, und führt sie zusammen', () => {
    const r = styleForPrompt(
      [
        sample('Müller', '2026-01', { zusammenfassung: 'alt', aufbau: ['Drei Aufgaben', 'Material M1'] }),
        sample('Müller', '2026-03', { zusammenfassung: 'neu', aufbau: ['drei aufgaben', 'Teilaufgaben a bis c'], operatoren: ['analysiere'] }),
        sample('Meier', '2026-04', { aufbau: ['Fremd'] }),
        sample('Müller', '2025-12', { aufbau: ['Sehr alt'] }),
      ],
      ' müller ',
      limits,
    );
    expect(r.used).toBe(2);
    expect(r.lines[0]).toBe('- Gesamteindruck: neu');
    expect(r.lines.find((x) => x.startsWith('- Aufbau'))).toBe('- Aufbau: drei aufgaben | Teilaufgaben a bis c | Material M1');
    expect(r.lines.join('\n')).not.toContain('Fremd');
    expect(r.lines.join('\n')).not.toContain('Sehr alt');
  });
  it('fällt auf die übrigen Blätter des Fachs zurück', () => {
    const r = styleForPrompt([sample('Meier', '2026-04', { operatoren: ['beurteile'] })], 'Müller', limits);
    expect(r.used).toBe(1);
    expect(r.lines).toEqual(['- Operatoren: beurteile']);
    expect(styleForPrompt([sample('Meier', '2026-04', { operatoren: ['beurteile'] })], '', limits).used).toBe(1);
  });
  it('kürzt die Listen und die Gesamtlänge', () => {
    const many = sample('A', '1', { aufbau: ['a', 'b', 'c', 'd', 'e'] });
    expect(styleForPrompt([many], '', limits).lines[0]).toBe('- Aufbau: a | b | c');
    const long = sample('A', '1', { zusammenfassung: 'z'.repeat(400), aufbau: ['b'.repeat(200)], operatoren: ['o'.repeat(200)] });
    const r = styleForPrompt([long], '', { ...limits, promptChars: 500 });
    expect(r.lines.join('').length).toBeLessThanOrEqual(900);
    expect(r.lines.length).toBeLessThan(3);
  });
});
