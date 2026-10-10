/**
 * Ob gerade der Admin die App nutzt. Setzt AccountGate nach dem Laden des Kontos. Für alle anderen werden technische Fehlermeldungen
 * (Schlüssel, Konsolen, Migrationen, Functions, Modelle) durch eine neutrale Meldung ersetzt.
 */
let adminView = false;

export function setAdminView(v: boolean): void {
  adminView = v;
}

export const isAdminView = (): boolean => adminView;

const TECHNICAL = /Supabase|Migration|Funktion [a-z]+-[a-z-]+|Function|Console|API_KEY|Schlüssel|Secret|eingerichtet|Groq|Anthropic|Haiku|Sonnet|Modell|Guthaben|Ausgabenlimit|HTTP \d/i;

/** Für Freunde: technische Meldungen werden neutral. Der Admin sieht alles. */
export function friendly(message: string, fallback = 'Das hat gerade nicht geklappt. Versuche es später noch einmal.'): string {
  return adminView || !TECHNICAL.test(message) ? message : fallback;
}
