import { ICAL_URL_PROBLEMS, checkIcalUrl, decodeIcs } from '@study/core';
import { decryptText, encryptText } from './secureStore';
import { supabase } from './supabase';

/** Fehler mit deutscher Meldung für die Oberfläche. */
export class IcalError extends Error {}

const MESSAGES: Record<string, string> = {
  blocked: 'Diese Adresse darf die App nicht abrufen (sie zeigt auf keinen öffentlichen Server).',
  unavailable: 'Der Kalender-Server antwortet nicht oder hat den Link abgelehnt. Prüfe, ob der Link noch gilt.',
  too_big: 'Die Kalenderdatei ist zu groß (höchstens 2 MB).',
  not_calendar: 'Unter diesem Link liegt keine Kalenderdatei. Hast du den richtigen Export-Link kopiert?',
  not_allowed: 'Dein Konto ist dafür noch nicht freigegeben.',
  rate_limited: 'Zu viele Abrufe in kurzer Zeit. Versuche es in ein paar Minuten noch einmal.',
};

/** Lädt den Kalender über die Edge Function ical-fetch (der Link wird dort nicht gespeichert) und gibt den Text zurück. */
export async function fetchIcal(url: string): Promise<string> {
  const check = checkIcalUrl(url);
  if (!check.ok) throw new IcalError(ICAL_URL_PROBLEMS[check.reason]);
  const { data, error } = await supabase.functions.invoke<{ bytes: string }>('ical-fetch', { body: { url: check.url } });
  if (error || !data?.bytes) {
    let code = '';
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        code = String(((await ctx.json()) as { error?: string }).error ?? '');
      } catch {
        /* unbekannt */
      }
    }
    throw new IcalError(MESSAGES[code] ?? 'Der Kalender konnte nicht geladen werden. Ist die Funktion ical-fetch in Supabase eingerichtet?');
  }
  return decodeIcs(Uint8Array.from(atob(data.bytes), (c) => c.charCodeAt(0)));
}

const KEY = 'study-app-ical-v1';

export interface SavedIcal {
  url: string;
  at: number; // letzter erfolgreicher Abruf (ms)
}

/** Der gespeicherte Link liegt verschlüsselt nur auf diesem Gerät (wie die Zugangsdaten für Lanis), nie in der Datenbank. */
export async function loadSavedIcal(): Promise<SavedIcal | null> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { c?: string; at?: number };
    const url = await decryptText(parsed.c ?? null);
    return url ? { url, at: typeof parsed.at === 'number' ? parsed.at : 0 } : null;
  } catch {
    return null;
  }
}

export async function saveIcal(url: string, at: number): Promise<void> {
  try {
    localStorage.setItem(KEY, JSON.stringify({ c: await encryptText(url), at }));
  } catch {
    // Speicher gesperrt: der Link wird dann nicht gemerkt
  }
}

export function forgetIcal(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignorieren
  }
}
