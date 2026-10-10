/**
 * Unterrichtssprache eines Fachs: Englisch für Englisch und bilinguale Fächer (zum Beispiel Bio Bili), Französisch,
 * Spanisch, Latein und so weiter. Sie bestimmt, in welcher Sprache die KI Zusammenfassungen und Karteikarten schreibt.
 *
 * WICHTIG: Diese Datei darf nichts importieren, weil die Edge Functions (Deno) sie als Kopie unter
 * supabase/functions/_shared/languages.ts nutzen. Quelle ist diese Datei, die Kopie entsteht mit `npm run sync:shared`.
 */

export const LANGUAGES = ['de', 'en', 'fr', 'es', 'la', 'it', 'ru', 'tr'] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  de: 'Deutsch',
  en: 'Englisch',
  fr: 'Französisch',
  es: 'Spanisch',
  la: 'Latein',
  it: 'Italienisch',
  ru: 'Russisch',
  tr: 'Türkisch',
};

/** Name der Sprache in der Sprache selbst, für die Anweisung an die KI. */
const LANGUAGE_NAMES_DE: Record<Exclude<Language, 'de' | 'la'>, string> = {
  en: 'Englisch',
  fr: 'Französisch',
  es: 'Spanisch',
  it: 'Italienisch',
  ru: 'Russisch',
  tr: 'Türkisch',
};

export const isLanguage = (v: unknown): v is Language => typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/**
 * Sprache, die zu einem Fachnamen passt: Sprachfächer nach dem Namen, bilinguale Fächer ("Bio Bili", "Biologie bilingual",
 * "Geschichte (englisch)") und alles andere Deutsch. Nur ein Vorschlag, der Nutzer kann ihn ändern.
 */
export function defaultLanguageFor(subjectName: string): Language {
  const n = fold(subjectName.trim());
  if (/\b(bili|bilingual|bilingue?)\b/.test(n) || /\(en(glisch|glish)?\)/.test(n)) return 'en';
  if (/^(englisch|english)\b/.test(n)) return 'en';
  if (/^(franzo(e)?sisch|french|francais)\b/.test(n)) return 'fr';
  if (/^(spanisch|spanish|espanol)\b/.test(n)) return 'es';
  if (/^latein|^latin\b/.test(n)) return 'la';
  if (/^(italienisch|italian)\b/.test(n)) return 'it';
  if (/^(russisch|russian)\b/.test(n)) return 'ru';
  if (/^(tu(e)?rkisch|turkish)\b/.test(n)) return 'tr';
  return 'de';
}

/** Gehört das Fach selbst zu einer Fremdsprache (Englisch, Französisch, ...), nicht nur bilingual? */
export const isLanguageSubject = (subjectName: string): boolean => {
  const n = fold(subjectName);
  return defaultLanguageFor(subjectName) !== 'de' && !/\b(bili|bilingual|bilingue?)\b/.test(n) && !/\(en(glisch|glish)?\)/.test(n);
};

/**
 * Satz für den Prompt der KI, in welcher Sprache sie schreiben soll. Für Deutsch leer (das ist der Standard der Prompts).
 * Die Schlüssel des JSON bleiben immer deutsch, nur die Inhalte wechseln die Sprache.
 */
export function languageRule(language: string): string {
  if (!isLanguage(language) || language === 'de') return '';
  if (language === 'la') {
    return 'Das Fach ist Latein: Lateinische Wörter, Sätze und Formen bleiben lateinisch, Fragen, Aufgaben und Erklärungen schreibst du auf Deutsch. Die Schlüssel des JSON bleiben unverändert.';
  }
  return `Das Fach wird auf ${LANGUAGE_NAMES_DE[language]} unterrichtet: Schreibe alle Inhalte (Texte, Fragen, Antworten, Begriffe) auf ${LANGUAGE_NAMES_DE[language]}. Die Schlüssel des JSON bleiben unverändert.`;
}
