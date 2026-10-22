/**
 * Vertretungsplan aus DSBmobile (Heinekingmedia). Viele Schulen veröffentlichen ihren Vertretungsplan nicht im
 * Lanis, sondern über die App "DSBmobile". Reine Funktionen ohne DOM.
 *
 * Ablauf: Die Edge Function dsb-plan meldet sich bei DSBmobile an und lädt die HTML-Seiten der Pläne. Das sind
 * meistens Exporte aus Untis (subst_001.htm usw.) im folgenden Aufbau:
 *   <div class="mon_title">22.10.2026 Donnerstag</div>        Datum des Plans
 *   <table class="mon_list"> <tr><th>Klasse(n)</th><th>Stunde</th><th>Fach</th><th>Raum</th> ... </tr> <tr><td>...
 * Die Spalten sind je nach Schule verschieden, darum werden sie über die Überschrift erkannt (nicht über die
 * Reihenfolge). Eingeklammerte Überschriften wie "(Fach)", "(Raum)" und "(Lehrer)" sind die Werte VOR der Änderung.
 *
 * Der Plan gilt für die ganze Schule. forStudent behält nur, was zu den eigenen Stunden im Stundenplan passt.
 * Das Format ist nach Bibliotheken und Beispielen übernommen und noch nicht an dem Plan einer echten Schule geprüft.
 */

import { LANIS_SUBJECT_NAMES } from './lanis';
import { lessonsOn, parsePeriods, substitutionKind, type SubstitutionEntry, type Timetable } from './lanisPlans';

const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&auml;/g, 'ä')
    .replace(/&ouml;/g, 'ö')
    .replace(/&uuml;/g, 'ü')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Passt ein Fach aus dem Plan ("M", "Mathe", "M-GK1", "Bio") zum Fachkürzel einer Stunde ("M")?
 * Gleich, oder der Name ist ein bekannter Name des Kürzels (Mathe, Mathematik), oder einer der Namen beginnt mit dem anderen
 * (mindestens zwei Zeichen, damit "E" nicht zu "Ethik" passt).
 */
export function subjectMatchesAbbr(name: string, abbr: string): boolean {
  const token = name.trim().toLowerCase().split(/[\s\-_/.]+/)[0].replace(/\d+$/, '');
  const a = abbr.toLowerCase();
  if (!token || !a) return false;
  if (token === a) return true;
  if (LANIS_SUBJECT_NAMES[a]?.some((n) => n.startsWith(token) || token.startsWith(n))) return token.length >= 2;
  const [short, long] = token.length <= a.length ? [token, a] : [a, token];
  return short.length >= 2 && long.startsWith(short);
}

export interface DsbEntry extends SubstitutionEntry {
  /** Klasse oder Stufe laut Plan, zum Beispiel "Q1" */
  klass: string | null;
  source: 'dsb';
}

const pad = (n: string) => n.padStart(2, '0');

/** Datum aus dem Titel eines Plans: "22.10.2026 Donnerstag" oder "22.10. Donnerstag" (dann mit dem übergebenen Jahr). */
export function dsbTitleDate(title: string, year: number): string | null {
  const m = /(\d{1,2})\.(\d{1,2})\.(?:(\d{4})|(\d{2})(?!\d))?/.exec(title);
  if (!m) return null;
  const y = m[3] ?? (m[4] ? `20${m[4]}` : String(year));
  return `${y}-${pad(m[2])}-${pad(m[1])}`;
}

type Field = 'klass' | 'periods' | 'subject' | 'subjectOld' | 'room' | 'roomOld' | 'substitute' | 'teacher' | 'art' | 'note' | 'cancel';

/** Spaltenüberschrift zum Feld, null für unbekannte Spalten. */
export function dsbField(header: string): Field | null {
  const raw = plainText(header).toLowerCase();
  const old = raw.startsWith('(') && raw.endsWith(')');
  const h = raw.replace(/[()]/g, '').trim();
  if (/^klasse/.test(h) || h === 'kurs' || h === 'stufe') return 'klass';
  if (/^stunde/.test(h) || h === 'std' || h === 'std.') return 'periods';
  if (h === 'fach') return old ? 'subjectOld' : 'subject';
  if (h === 'raum') return old ? 'roomOld' : 'room';
  if (/^vertreter|^vertr\.?$/.test(h)) return 'substitute';
  if (/^lehrer|^lehrkraft/.test(h)) return 'teacher';
  if (h === 'art') return 'art';
  if (/text|hinweis|bemerkung|info/.test(h)) return 'note';
  if (/^entfall/.test(h)) return 'cancel';
  return null;
}

const empty = (v: string) => v === '' || /^[-–—.]+$/.test(v);

/** Alle Einträge einer HTML-Seite im Untis-Aufbau. Seiten ohne erkennbare Tabelle ergeben eine leere Liste. */
export function parseUntisPlan(html: string, year = new Date().getFullYear()): DsbEntry[] {
  const titles = [...html.matchAll(/<div\b[^>]*class="[^"]*\bmon_title\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)].map((m) => ({
    at: m.index ?? 0,
    date: dsbTitleDate(plainText(m[1]), year),
  }));
  const out: DsbEntry[] = [];
  for (const table of html.matchAll(/<table\b[^>]*class="[^"]*\bmon_list\b[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)) {
    const at = table.index ?? 0;
    const date = [...titles].reverse().find((t) => t.at < at)?.date ?? null;
    if (!date) continue;
    const rows = [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => r[1]);
    const headIdx = rows.findIndex((r) => /<th\b/i.test(r));
    if (headIdx < 0) continue;
    const fields = [...rows[headIdx].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => dsbField(m[1]));
    if (!fields.includes('periods')) continue;
    for (const row of rows.slice(headIdx + 1)) {
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => plainText(m[1]));
      if (cells.length < 2) continue; // "Keine Vertretungen" und ähnliche Zeilen
      const v: Partial<Record<Field, string>> = {};
      fields.forEach((f, i) => {
        if (f && i < cells.length && !empty(cells[i]) && v[f] === undefined) v[f] = cells[i];
      });
      const periods = parsePeriods(v.periods ?? '');
      if (periods.length === 0) continue;
      const art = v.art ?? (v.cancel ? 'Entfall' : null);
      const base = { art, note: v.note ?? null, substitute: v.substitute ?? null, room: v.room ?? null, roomOld: v.roomOld ?? null };
      out.push({
        date,
        periods,
        kind: substitutionKind(base),
        subject: v.subject ?? null,
        subjectOld: v.subjectOld ?? null,
        teacher: v.teacher ?? null,
        group: null,
        klass: v.klass ?? null,
        source: 'dsb',
        ...base,
      });
    }
  }
  return dedupe(out).sort((a, b) => a.date.localeCompare(b.date) || (a.periods[0] ?? 0) - (b.periods[0] ?? 0));
}

/** Mehrere Seiten (oder eine Seite zweimal) liefern gleiche Zeilen nur einmal. */
function dedupe(list: DsbEntry[]): DsbEntry[] {
  const seen = new Set<string>();
  return list.filter((e) => {
    const key = JSON.stringify([e.date, e.periods, e.klass, e.subject, e.subjectOld, e.room, e.roomOld, e.teacher, e.substitute, e.art, e.note]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Stufen der eigenen Kurse: "Q1M03" -> Q1. Leer, wenn der Stundenplan keine Q-Phase erkennen lässt. */
export function ownLevels(tt: Timetable): string[] {
  return [...new Set(tt.lessons.map((l) => /^(Q[1-4]|E\d)/i.exec(l.course.trim())?.[1].toUpperCase()).filter((x): x is string => Boolean(x)))];
}

/** Gehört die Klassenangabe des Plans ("Q1", "Q1, Q2", "10a") zu einer der eigenen Stufen? */
export function classMatches(klass: string | null, levels: string[]): boolean {
  if (levels.length === 0 || !klass) return true;
  const tokens = klass.toUpperCase().split(/[\s,;/+]+/).filter(Boolean);
  return levels.some((lv) => tokens.some((t) => t === lv || t.startsWith(`${lv}-`) || t.startsWith(`${lv}_`) || t === lv.replace(/^Q/, 'Q.')));
}

/**
 * Behält aus dem Plan der ganzen Schule nur, was die eigenen Stunden betrifft: passende Stufe und eine Stunde im
 * Stundenplan am selben Tag, die sich mit den Stunden des Eintrags überschneidet und zu Fach oder Lehrkraft passt.
 * Ohne Stundenplan bleibt nur der Filter nach Stufe, und ohne Stufe gar keiner.
 */
export function forStudent(entries: DsbEntry[], tt: Timetable | null): DsbEntry[] {
  if (!tt) return entries;
  const levels = ownLevels(tt);
  return entries.filter((e) => {
    if (!classMatches(e.klass, levels)) return false;
    const mine = lessonsOn(tt, e.date).filter((l) => e.periods.some((p) => p >= l.period && p < l.period + l.span));
    if (mine.length === 0) return false;
    const names = [e.subject, e.subjectOld].filter((x): x is string => Boolean(x));
    if (names.length === 0) return true; // Plan ohne Fach: die Stunde allein entscheidet
    return mine.some(
      (l) =>
        names.some((n) => subjectMatchesAbbr(n, l.abbr)) ||
        (e.teacher !== null && l.teacher !== '' && e.teacher.toLowerCase() === l.teacher.toLowerCase()),
    );
  });
}
