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
 * Aufbau und Abgleich sind am echten Plan einer Schule geprüft (Spalte "Vertreter" mit durchgestrichener alter Lehrkraft, Zwischenzeilen mit der Stufe).
 */

import { CONFIG } from './config';
import { lessonFit, lessonsOn, substitutionKind, type SubstitutionEntry, type Timetable } from './lanisPlans';

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

export interface DsbEntry extends SubstitutionEntry {
  /** Klasse oder Stufe laut Plan, zum Beispiel "Q1" */
  klass: string | null;
  source: 'dsb';
}

const pad = (n: string) => n.padStart(2, '0');

/** Gibt es dieses Datum wirklich (kein 31.04.)? */
const realDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/**
 * Datum aus dem Titel eines Plans: "22.10.2026 Donnerstag" oder "22.10. Donnerstag". Ohne Jahr kommt es vom Aufrufer,
 * entweder fest oder je Monat und Tag (so lässt sich der Jahreswechsel behandeln). Ein Datum, das es nicht gibt, ergibt null.
 */
export function dsbTitleDate(title: string, year: number | ((month: number, day: number) => number)): string | null {
  const m = /(\d{1,2})\.(\d{1,2})\.(?:(\d{4})|(\d{2})(?!\d))?/.exec(title);
  if (!m) return null;
  const [d, mo] = [Number(m[1]), Number(m[2])];
  const y = m[3] ? Number(m[3]) : m[4] ? Number(`20${m[4]}`) : typeof year === 'function' ? year(mo, d) : year;
  if (!realDate(y, mo, d)) return null;
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

/**
 * Untis streicht die alten Werte durch und schreibt den neuen dahinter: "<s>Ker</s>?maa" (das Zeichen dazwischen ist ein
 * Pfeil, der im Zeichensatz der Seite als "?" ankommt). Ergibt den durchgestrichenen Teil (old) und den neuen Wert (now).
 * Eine Zelle ganz mit line-through zählt als alter Wert ohne neuen.
 */
export function splitStruck(cellHtml: string): { old: string; now: string } {
  const olds: string[] = [];
  const rest = cellHtml.replace(/<(s|strike|del)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner: string) => {
    olds.push(plainText(inner));
    return ' ';
  });
  if (olds.length > 0) {
    const now = plainText(rest).replace(/^[\s?→»›>\uFFFD]+/, '').trim();
    return { old: olds.join(' ').trim(), now: empty(now) ? '' : now };
  }
  const text = plainText(cellHtml);
  return /line-through/i.test(cellHtml) ? { old: text, now: '' } : { old: '', now: text };
}

const PERIODS = /^\d{1,2}(\s*[-–]\s*\d{1,2})?$/;

/** Zeile ohne Spaltenüberschrift: Stunde suchen, davor die Art, danach Vertreter, Fach, Raum, Text (so wie im Untis-Plan nach Klassen). */
function inferFields(texts: string[]): (Field | null)[] {
  const fields: (Field | null)[] = texts.map(() => null);
  const p = texts.findIndex((t) => PERIODS.test(t));
  if (p < 0) return fields;
  fields[p] = 'periods';
  if (p >= 1) fields[p - 1] = 'art';
  if (p >= 2) fields[p - 2] = 'klass';
  // Im Untis-Plan nach Klassen steht hinter der Stunde die Spalte "Vertreter" (alte Lehrkraft durchgestrichen, neue dahinter)
  (['substitute', 'subject', 'room', 'note'] as Field[]).forEach((f, i) => {
    if (p + 1 + i < fields.length) fields[p + 1 + i] = f;
  });
  return fields;
}

/** "Q1 Q1" (Zwischenüberschrift, doppelt geschrieben) -> "Q1" */
const groupName = (t: string) => [...new Set(t.split(/\s+/).filter(Boolean))].join(' ');

/**
 * Stunden aus der Zelle "Stunde": "3", "3 - 4", "3, 4". 'none' heißt: da steht keine Zahl (Kopfzeile, Fußzeile, Hinweis),
 * 'bad' heißt: Zahlen, aber unmöglich (0, über maxPeriod, rückwärts wie "5 - 3", länger als maxSpan, Jahreszahl).
 */
export function strictPeriods(
  text: string,
  maxPeriod: number = CONFIG.dsb.maxPeriod,
  maxSpan: number = CONFIG.dsb.maxSpan,
): { periods: number[]; status: 'ok' | 'none' | 'bad' } {
  const t = text.trim();
  if (!/\d/.test(t)) return { periods: [], status: 'none' };
  const bad = { periods: [], status: 'bad' as const };
  const range = /^(\d{1,2})\s*(?:[-–]|bis)\s*(\d{1,2})$/.exec(t);
  let list: number[];
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])];
    if (b < a || b - a + 1 > maxSpan) return bad;
    list = Array.from({ length: b - a + 1 }, (_, i) => a + i);
  } else if (/^\d{1,2}(?:\s*[,;/]\s*\d{1,2})*$/.test(t)) {
    list = t.split(/\s*[,;/]\s*/).map(Number);
    if (list.length > maxSpan) return bad;
  } else {
    return bad;
  }
  return list.every((n) => n >= 1 && n <= maxPeriod) ? { periods: list, status: 'ok' } : bad;
}

/** Eine Tabelle (ein Tag, eine Seite) eines Untis-Plans mit allem, was beim Lesen auffiel. */
export interface UntisTable {
  /** Text des Titels, zum Beispiel "22.10.2026 Donnerstag (Seite 1 / 3)" */
  title: string | null;
  /** Datum aus dem Titel (YYYY-MM-DD) oder null */
  date: string | null;
  /** "Seite 2 / 3" im Titel */
  page: { n: number; of: number } | null;
  /** "Stand: 22.10.2026 14:25" im Kopf der Seite, als "YYYY-MM-DDTHH:MM" (Ortszeit) */
  stand: string | null;
  hasList: boolean;
  /** Die Seite sagt ausdrücklich, dass es nichts gibt ("Keine Vertretungen") */
  noSubstitutions: boolean;
  /** Zeilen mit Daten, davon Zeilen mit lesbarer Stunde */
  rows: number;
  recognized: number;
  entries: DsbEntry[];
  /** Verworfene Zeilen: unmögliche Stunden, leere Einträge, Zeilen die keine Einträge sind */
  rejected: { periods: number; empty: number; junk: number };
}

const NOTHING = /keine\s+(vertretung|nachricht|änderung|aenderung)/i;

/** "Stand: 22.10.2026 14:25" aus dem Kopf einer Seite, sonst null. */
export function untisStand(html: string): string | null {
  const m = /Stand:?\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/.exec(plainText(html.slice(0, 6000)));
  if (!m || !realDate(Number(m[3]), Number(m[2]), Number(m[1])) || Number(m[4]) > 23 || Number(m[5]) > 59) return null;
  return `${m[3]}-${pad(m[2])}-${pad(m[1])}T${pad(m[4])}:${m[5]}`;
}

/**
 * Liest alle Tabellen einer HTML-Seite im Untis-Aufbau. Zwei Varianten:
 * - mit Spalte "Klasse(n)" und Kopfzeile (Überschriften bestimmen die Spalten)
 * - nach Klassen gruppiert: Zwischenzeilen wie "Q1 Q1" über den Einträgen, alte Werte durchgestrichen, Kopfzeile fehlt oder ist unbekannt
 * Seiten ohne Tabelle ergeben eine Tabelle ohne Liste (hasList false), Seiten ohne Titel keine.
 */
export function parseUntisTables(html: string, year: number | ((month: number, day: number) => number) = new Date().getFullYear()): UntisTable[] {
  const titles = [...html.matchAll(/<div\b[^>]*class="[^"]*\bmon_title\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)].map((m) => {
    const text = plainText(m[1]);
    const pg = /Seite\s*(\d+)\s*\/\s*(\d+)/i.exec(text);
    return { at: m.index ?? 0, text, date: dsbTitleDate(text, year), page: pg ? { n: Number(pg[1]), of: Number(pg[2]) } : null };
  });
  const stand = untisStand(html);
  const tables: UntisTable[] = [];
  const blank = (t: (typeof titles)[number] | undefined, hasList: boolean): UntisTable => ({
    title: t?.text ?? null,
    date: t?.date ?? null,
    page: t?.page ?? null,
    stand,
    hasList,
    noSubstitutions: false,
    rows: 0,
    recognized: 0,
    entries: [],
    rejected: { periods: 0, empty: 0, junk: 0 },
  });
  for (const table of html.matchAll(/<table\b[^>]*class="[^"]*\bmon_list\b[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)) {
    const at = table.index ?? 0;
    const out = blank([...titles].reverse().find((t) => t.at < at), true);
    tables.push(out);
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
        if (name && NOTHING.test(name)) out.noSubstitutions = true;
        else if (name) group = groupName(name);
        continue;
      }
      out.rows++;
      const cols = fields ?? inferFields(texts);
      const v: Partial<Record<Field, string>> = {};
      const set = (key: Field, val: string) => {
        if (val !== '' && !empty(val) && v[key] === undefined) v[key] = val;
      };
      cols.forEach((f, i) => {
        if (!f || i >= texts.length) return;
        const { old, now } = splitStruck(tds[i][2]);
        if (old === '') return set(f, now);
        // Durchgestrichen heißt: das war vorher so (altes Fach, alter Raum, alte Lehrkraft), dahinter steht der neue Wert
        if (f === 'subject') {
          set('subjectOld', old);
          set('subject', now);
        } else if (f === 'room') {
          set('roomOld', old);
          set('room', now);
        } else if (f === 'substitute' || f === 'teacher') {
          set('teacher', old);
          set('substitute', now);
        } else {
          set(f, texts[i]);
        }
      });
      const sp = strictPeriods(v.periods ?? '');
      if (sp.status === 'none') {
        out.rejected.junk++;
        continue;
      }
      out.recognized++;
      if (sp.status === 'bad') {
        out.rejected.periods++;
        continue;
      }
      const art = v.art ?? (v.cancel ? 'Entfall' : null);
      const base = { art, note: v.note ?? null, substitute: v.substitute ?? null, room: v.room ?? null, roomOld: v.roomOld ?? null };
      const kind = substitutionKind(base);
      // Raumwechsel: die Lehrkraft bleibt, in der Spalte "Vertreter" steht dann sie selbst
      const teacher = v.teacher ?? (kind === 'room' ? base.substitute : null);
      if (kind === 'room' && !v.teacher) base.substitute = null;
      const entry: DsbEntry = {
        date: out.date ?? '',
        periods: sp.periods,
        kind,
        subject: v.subject ?? null,
        subjectOld: v.subjectOld ?? null,
        teacher,
        group: null,
        klass: v.klass ?? group,
        source: 'dsb',
        ...base,
      };
      if ([entry.art, entry.subject, entry.subjectOld, entry.note].some((x) => x !== null && NOTHING.test(x))) {
        out.rejected.junk++;
      } else if (!entry.art && !entry.subject && !entry.subjectOld && !entry.teacher && !entry.substitute && !entry.room && !entry.roomOld && !entry.note) {
        out.rejected.empty++;
      } else {
        out.entries.push(entry);
      }
    }
  }
  if (tables.length === 0 && titles.length > 0) {
    const t = blank(titles[0], false);
    t.noSubstitutions = NOTHING.test(plainText(html));
    tables.push(t);
  }
  return tables;
}

/**
 * Alle Einträge einer HTML-Seite im Untis-Aufbau (siehe parseUntisTables). Tabellen ohne erkennbares Datum werden übersprungen.
 * Die Prüfung auf ein plausibles Datum, Widersprüche usw. macht readDsbPlans in dsbCheck.ts.
 */
export function parseUntisPlan(html: string, year: number | ((month: number, day: number) => number) = new Date().getFullYear()): DsbEntry[] {
  const out = parseUntisTables(html, year).flatMap((t) => (t.date ? t.entries : []));
  return dedupe(out).list.sort((a, b) => a.date.localeCompare(b.date) || (a.periods[0] ?? 0) - (b.periods[0] ?? 0));
}

/** Mehrere Seiten (oder eine Seite zweimal) liefern gleiche Zeilen nur einmal. */
export function dedupe(list: DsbEntry[]): { list: DsbEntry[]; removed: number } {
  const seen = new Set<string>();
  const out = list.filter((e) => {
    const key = JSON.stringify([e.date, e.periods, e.klass, e.subject, e.subjectOld, e.room, e.roomOld, e.teacher, e.substitute, e.art, e.note]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { list: out, removed: list.length - out.length };
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
 * Stundenplan am selben Tag, die sich mit den Stunden des Eintrags überschneidet und zu der der Eintrag nach Kurscode,
 * Lehrkraft und Fach passt (lessonFit). Gibt es in der Stufe mehrere Kurse desselben Fachs, entscheidet die Lehrkraft.
 * Was nur nach Fach und Zeit passt, bleibt mit uncertain = true erhalten (die App zeigt es als unsicher). Ohne Stundenplan
 * bleibt alles.
 */
export function forStudent(entries: DsbEntry[], tt: Timetable | null): DsbEntry[] {
  if (!tt) return entries;
  const levels = ownLevels(tt);
  const out: DsbEntry[] = [];
  for (const e of entries) {
    const r = studentCheck(e, tt, levels);
    if (r === 'ok') out.push(e);
    else if (r === 'maybe') out.push({ ...e, uncertain: true });
  }
  return out;
}

/**
 * Warum ein Eintrag zu dir passt oder nicht: 'ok' (Kurscode oder Lehrkraft bestätigen es), 'maybe' (nur Fach und Zeit),
 * falsche Klasse, keine eigene Stunde zu der Zeit, anderer Kurs (Fach oder Lehrkraft).
 */
export function studentCheck(e: DsbEntry, tt: Timetable, levels: string[] = ownLevels(tt)): 'ok' | 'maybe' | 'klass' | 'lesson' | 'subject' {
  if (!classMatches(e.klass, levels)) return 'klass';
  const mine = lessonsOn(tt, e.date).filter((l) => e.periods.some((p) => p >= l.period && p < l.period + l.span));
  if (mine.length === 0) return 'lesson';
  const fits = mine.map((l) => lessonFit(e, l));
  if (fits.includes('sure')) return 'ok';
  return fits.includes('maybe') ? 'maybe' : 'subject';
}

/** Anfang der ersten Plan-Tabelle (Kopfzeile und die ersten Zeilen) zum Kopieren, höchstens 5000 Zeichen. */
export function dsbSample(pages: string[]): string {
  for (const h of pages) {
    const at = h.search(/<table\b[^>]*mon_list/i);
    if (at >= 0) return h.slice(Math.max(0, h.lastIndexOf('mon_title', at) - 30), at + 5000).slice(0, 5000);
  }
  return '';
}
