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
  const token = name.trim().replace(/^(?:Q[1-4]|E\d)(?=[A-Za-zÄÖÜäöü])/i, '').toLowerCase().split(/[\s\-_/.]+/)[0].replace(/\d+$/, '');
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

/** Durchgestrichener Inhalt (Untis streicht die alten Werte durch): <s>, <strike>, <del> oder line-through. */
const isStruck = (cellHtml: string) => /<(s|strike|del)\b|line-through/i.test(cellHtml);

const PERIODS = /^\d{1,2}(\s*[-–]\s*\d{1,2})?$/;

/** Zeile ohne Spaltenüberschrift: Stunde suchen, davor die Art, danach Lehrer, Fach, Raum, Text (so wie im Untis-Gruppenplan). */
function inferFields(texts: string[]): (Field | null)[] {
  const fields: (Field | null)[] = texts.map(() => null);
  const p = texts.findIndex((t) => PERIODS.test(t));
  if (p < 0) return fields;
  fields[p] = 'periods';
  if (p >= 1) fields[p - 1] = 'art';
  if (p >= 2) fields[p - 2] = 'klass';
  (['teacher', 'subject', 'room', 'note'] as Field[]).forEach((f, i) => {
    if (p + 1 + i < fields.length) fields[p + 1 + i] = f;
  });
  return fields;
}

/** "Q1 Q1" (Zwischenüberschrift, doppelt geschrieben) -> "Q1" */
const groupName = (t: string) => [...new Set(t.split(/\s+/).filter(Boolean))].join(' ');

/**
 * Alle Einträge einer HTML-Seite im Untis-Aufbau. Zwei Varianten:
 * - mit Spalte "Klasse(n)" und Kopfzeile (Überschriften bestimmen die Spalten)
 * - nach Klassen gruppiert: Zwischenzeilen wie "Q1 Q1" über den Einträgen, alte Werte durchgestrichen, Kopfzeile fehlt oder ist unbekannt
 * Seiten ohne erkennbare Tabelle ergeben eine leere Liste.
 */
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
    let fields: (Field | null)[] | null = null;
    let group: string | null = null;
    for (const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const ths = [...row[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)];
      if (ths.length > 0) {
        const f = ths.map((m) => dsbField(m[1]));
        if (f.includes('periods')) fields = f;
        continue;
      }
      const tds = [...row[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
      if (tds.length === 0) continue;
      const texts = tds.map((m) => plainText(m[2]));
      // Zwischenzeile mit dem Namen der Klasse
      if (tds.length === 1 || (tds.length <= 2 && /colspan|inline_header/i.test(tds[0][1]))) {
        const name = texts.find(Boolean);
        if (name) group = groupName(name);
        continue;
      }
      const cols = fields ?? inferFields(texts);
      const v: Partial<Record<Field, string>> = {};
      cols.forEach((f, i) => {
        if (!f || i >= texts.length || empty(texts[i])) return;
        // Durchgestrichen heißt: das war vorher so (altes Fach, alter Raum)
        const key: Field = isStruck(tds[i][2]) ? (f === 'subject' ? 'subjectOld' : f === 'room' ? 'roomOld' : f) : f;
        if (v[key] === undefined) v[key] = texts[i];
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
        klass: v.klass ?? group,
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
  return entries.filter((e) => studentCheck(e, tt, levels) === 'ok');
}

/** Warum ein Eintrag zu dir passt ('ok') oder nicht: falsche Klasse, keine eigene Stunde zu der Zeit, anderes Fach. */
export function studentCheck(e: DsbEntry, tt: Timetable, levels: string[] = ownLevels(tt)): 'ok' | 'klass' | 'lesson' | 'subject' {
  if (!classMatches(e.klass, levels)) return 'klass';
  const mine = lessonsOn(tt, e.date).filter((l) => e.periods.some((p) => p >= l.period && p < l.period + l.span));
  if (mine.length === 0) return 'lesson';
  const names = [e.subject, e.subjectOld].filter((x): x is string => Boolean(x));
  if (names.length === 0) return 'ok'; // Plan ohne Fach: die Stunde allein entscheidet
  const fits = mine.some(
    (l) =>
      names.some((n) => subjectMatchesAbbr(n, l.abbr)) ||
      (e.teacher !== null && l.teacher !== '' && e.teacher.toLowerCase() === l.teacher.toLowerCase()),
  );
  return fits ? 'ok' : 'subject';
}

export interface DsbDiagnosis {
  /** Seiten, davon wie Untis-Pläne erkannt */
  pages: number;
  recognized: number;
  /** Einträge im Plan der ganzen Schule */
  total: number;
  dates: string[];
  /** Stufen aus deinem Stundenplan */
  levels: string[];
  /** Einträge deiner Stufe, und die, die zu dir passen */
  ofLevel: number;
  mine: number;
  /** Warum Einträge nicht passen */
  dropped: { klass: number; lesson: number; subject: number };
  /** Beispielwerte aus dem Plan: Spaltenüberschriften und erste Klassenangaben */
  headers: string[];
  klassSamples: string[];
}

/** Zusammenfassung für die Fehlersuche: was stand im Plan und was davon ist bei dir gelandet. */
export function diagnoseDsb(pages: string[], tt: Timetable | null, year = new Date().getFullYear()): DsbDiagnosis {
  const all = pages.flatMap((h) => parseUntisPlan(h, year));
  const levels = tt ? ownLevels(tt) : [];
  const dropped = { klass: 0, lesson: 0, subject: 0 };
  let mine = 0;
  if (tt) {
    for (const e of all) {
      const r = studentCheck(e, tt, levels);
      if (r === 'ok') mine++;
      else dropped[r]++;
    }
  }
  const headers = [
    ...new Set(
      pages.flatMap((h) =>
        [...(/<table\b[^>]*mon_list[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>/i.exec(h)?.[1] ?? '').matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => plainText(m[1])),
      ),
    ),
  ].slice(0, 20);
  return {
    pages: pages.length,
    recognized: pages.filter((h) => /mon_title|mon_list/.test(h)).length,
    total: all.length,
    dates: [...new Set(all.map((e) => e.date))].sort(),
    levels,
    ofLevel: all.filter((e) => classMatches(e.klass, levels)).length,
    mine,
    dropped,
    headers,
    klassSamples: [...new Set(all.map((e) => e.klass ?? '–'))].slice(0, 12),
  };
}

/** Anfang der ersten Plan-Tabelle (Kopfzeile und die ersten Zeilen) zum Kopieren, höchstens 5000 Zeichen. */
export function dsbSample(pages: string[]): string {
  for (const h of pages) {
    const at = h.search(/<table\b[^>]*mon_list/i);
    if (at >= 0) return h.slice(Math.max(0, h.lastIndexOf('mon_title', at) - 30), at + 5000).slice(0, 5000);
  }
  return '';
}
