import { describe, expect, it } from 'vitest';
import { defaultLanguageFor, isLanguage, isLanguageSubject, LANGUAGE_LABELS, LANGUAGES, languageRule } from './languages';

describe('defaultLanguageFor', () => {
  it('Sprachfächer nach dem Namen', () => {
    expect(defaultLanguageFor('Englisch')).toBe('en');
    expect(defaultLanguageFor('Französisch')).toBe('fr');
    expect(defaultLanguageFor('Franzoesisch')).toBe('fr'); // auch die Schreibweise ohne Umlaut
    expect(defaultLanguageFor('Tuerkisch')).toBe('tr');
    expect(defaultLanguageFor('Spanisch')).toBe('es');
    expect(defaultLanguageFor('Latein')).toBe('la');
    expect(defaultLanguageFor('Italienisch')).toBe('it');
    expect(defaultLanguageFor('Russisch')).toBe('ru');
    expect(defaultLanguageFor('Türkisch')).toBe('tr');
    expect(defaultLanguageFor('  englisch LK ')).toBe('en'); // Leerzeichen am Rand stören nicht
    expect(defaultLanguageFor('Englisch LK')).toBe('en');
    expect(defaultLanguageFor('Französisch 3. Fremdsprache')).toBe('fr');
  });

  it('bilinguale Fächer sind Englisch', () => {
    expect(defaultLanguageFor('Bio Bili')).toBe('en');
    expect(defaultLanguageFor('Biologie bilingual')).toBe('en');
    expect(defaultLanguageFor('Geschichte (englisch)')).toBe('en');
    expect(defaultLanguageFor('Politik und Wirtschaft bilingual')).toBe('en');
    expect(defaultLanguageFor('Bili Erdkunde')).toBe('en');
  });

  it('alles andere ist Deutsch, auch "Bio Deutsch"', () => {
    expect(defaultLanguageFor('Biologie')).toBe('de');
    expect(defaultLanguageFor('Bio Deutsch')).toBe('de');
    expect(defaultLanguageFor('Deutsch')).toBe('de');
    expect(defaultLanguageFor('Mathematik')).toBe('de');
    expect(defaultLanguageFor('')).toBe('de');
    expect(defaultLanguageFor('Ethik')).toBe('de');
  });
});

describe('isLanguageSubject', () => {
  it('echte Sprachfächer ja, bilinguale und Deutsch nein', () => {
    expect(isLanguageSubject('Englisch')).toBe(true);
    expect(isLanguageSubject('Latein')).toBe(true);
    expect(isLanguageSubject('Bio Bili')).toBe(false);
    expect(isLanguageSubject('Biologie')).toBe(false);
  });
});

describe('languageRule', () => {
  it('Deutsch und Unbekanntes ergeben keine Regel', () => {
    expect(languageRule('de')).toBe('');
    expect(languageRule('xx')).toBe('');
    expect(languageRule('')).toBe('');
  });

  it('Fremdsprache: Inhalte in der Sprache, JSON-Schlüssel unverändert', () => {
    expect(languageRule('en')).toContain('auf Englisch unterrichtet');
    expect(languageRule('en')).toContain('Schlüssel des JSON bleiben unverändert');
    expect(languageRule('fr')).toContain('Französisch');
    expect(languageRule('es')).toContain('Spanisch');
  });

  it('Latein: Lateinisches bleibt lateinisch, Erklärung Deutsch', () => {
    const r = languageRule('la');
    expect(r).toContain('Latein');
    expect(r).toContain('auf Deutsch');
  });

  it('jede Sprache hat einen Namen und eine Regel (außer Deutsch)', () => {
    for (const l of LANGUAGES) {
      expect(LANGUAGE_LABELS[l]).toBeTruthy();
      expect(isLanguage(l)).toBe(true);
      expect(languageRule(l) === '').toBe(l === 'de');
    }
    expect(isLanguage('xx')).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });
});
