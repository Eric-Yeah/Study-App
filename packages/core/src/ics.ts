import { CONFIG } from './config';
import { addDay, matchSubjectId, mondayOf, type EventKind, type StudyEvent } from './events';

/**
 * Kalenderdateien (.ics, iCalendar nach RFC 5545) lesen: Vorlesungen, Übungen und Seminare aus dem Uni-System als Stundenplan.
 * Reine Funktionen ohne Netz. Uhrzeiten mit Zeitzone (TZID) gelten als Ortszeit, Zeiten mit Z (UTC) werden in die Ortszeit des
 * Geräts umgerechnet. Ganztägige und mehrtägige Termine (Feiertage, Blockveranstaltungen) lässt der Import aus und zählt sie.
 */

/** Dekodiert die Bytes einer Datei: UTF-8 (mit oder ohne BOM) und UTF-16 (zum Beispiel aus TUCaN) werden erkannt. */
export function decodeIcs(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  // UTF-16 ohne BOM: jedes zweite Byte ist 0 (lateinischer Text)
  if (bytes.length >= 4) {
    const sample = bytes.subarray(0, Math.min(bytes.length, 200));
    let evenZero = 0;
    let oddZero = 0;
    sample.forEach((b, i) => {
      if (b === 0) (i % 2 === 0 ? evenZero++ : oddZero++);
    });
    const half = sample.length / 4;
    if (oddZero > half && evenZero === 0) return new TextDecoder('utf-16le').decode(bytes);
    if (evenZero > half && oddZero === 0) return new TextDecoder('utf-16be').decode(bytes);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseLine(line: string): Prop | null {
  // Name und Parameter bis zum ersten Doppelpunkt außerhalb von Anführungszeichen
  let inQuote = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === ':' && !inQuote) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts: string[] = [];
  let cur = '';
  inQuote = false;
  for (const c of head) {
    if (c === '"') inQuote = !inQuote;
    if (c === ';' && !inQuote) {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: parts[0].toUpperCase(), params, value };
}

const unescapeText = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

interface Stamp {
  date: string; // YYYY-MM-DD
  min: number;
  allDay: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

function parseStamp(value: string, params: Record<string, string>): Stamp | null {
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (h === undefined || params.VALUE === 'DATE') return { date: `${y}-${mo}-${d}`, min: 0, allDay: true };
  if (z) {
    const u = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)));
    return { date: `${u.getFullYear()}-${pad(u.getMonth() + 1)}-${pad(u.getDate())}`, min: u.getHours() * 60 + u.getMinutes(), allDay: false };
  }
  return { date: `${y}-${mo}-${d}`, min: Number(h) * 60 + Number(mi), allDay: false };
}

interface RawEvent {
  uid: string;
  summary: string;
  location: string;
  description: string;
  start: Stamp;
  end: Stamp | null;
  rrule: Record<string, string> | null;
  exdates: string[];
  recurrenceId: string | null;
  cancelled: boolean;
}

function parseRule(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of value.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return out;
}

/** Ein Termin aus der Datei, ohne Id und Fach (die ergänzt `planIcsImport`). */
export type ImportEvent = Omit<StudyEvent, 'id' | 'subjectId'>;

export interface IcsResult {
  events: ImportEvent[];
  /** Ganztägige, mehrtägige oder abgesagte Termine und Termine ohne lesbare Zeit */
  ignored: number;
  /** Mehr Termine als erlaubt: die überzähligen wurden weggelassen */
  truncated: boolean;
  /** Kein Kalender erkannt (zum Beispiel eine falsche Datei) */
  valid: boolean;
}

const DAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export function guessKind(title: string, description = ''): EventKind {
  const t = `${title} ${description}`.toLowerCase();
  if (/vorlesung|\bvl\b|lecture/.test(t)) return 'lecture';
  if (/übung|uebung|\bü\b|exercise|\bue\b/.test(t)) return 'exercise';
  if (/seminar/.test(t)) return 'seminar';
  if (/tutor/.test(t)) return 'tutorial';
  if (/praktikum|labor|\blab\b|practical/.test(t)) return 'lab';
  return 'other';
}

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function daysBetween(a: string, b: string): number {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  return Math.round((new Date(pb[0], pb[1] - 1, pb[2]).getTime() - new Date(pa[0], pa[1] - 1, pa[2]).getTime()) / 86_400_000);
}

/** Alle Tage einer Wiederholung (für Täglich, Monatlich, Jährlich und Wöchentlich mit COUNT), begrenzt. */
function expand(startDate: string, rule: Record<string, string>, cap: number): string[] {
  const freq = rule.FREQ;
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const until = rule.UNTIL ? parseStamp(rule.UNTIL, {})?.date ?? null : null;
  const limit = Math.min(cap, count);
  const maxDate = addDay(startDate, 366);
  const out: string[] = [];
  const [y, m, d] = startDate.split('-').map(Number);
  for (let i = 0; out.length < limit && i < 4000; i++) {
    let date: string;
    if (freq === 'DAILY') date = addDay(startDate, i * interval);
    else if (freq === 'WEEKLY') date = addDay(startDate, i * 7 * interval);
    else if (freq === 'MONTHLY') {
      const t = new Date(y, m - 1 + i * interval, d);
      if (t.getDate() !== d) continue; // den 31. gibt es nicht in jedem Monat
      date = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    } else if (freq === 'YEARLY') date = `${y + i * interval}-${pad(m)}-${pad(d)}`;
    else break;
    if ((until && date > until) || date > maxDate) break;
    out.push(date);
  }
  return out;
}

export function parseIcs(text: string): IcsResult {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const result: IcsResult = { events: [], ignored: 0, truncated: false, valid: false };
  if (!lines.some((l) => l.trim().toUpperCase() === 'BEGIN:VCALENDAR')) return result;
  result.valid = true;

  const raws: RawEvent[] = [];
  let cur: Record<string, Prop[]> | null = null;
  for (const line of lines) {
    const t = line.trim();
    if (t.toUpperCase() === 'BEGIN:VEVENT') cur = {};
    else if (t.toUpperCase() === 'END:VEVENT') {
      if (cur) {
        const get = (n: string) => cur?.[n]?.[0];
        const ds = get('DTSTART');
        const start = ds ? parseStamp(ds.value, ds.params) : null;
        if (!start) result.ignored++;
        else {
          const de = get('DTEND');
          const rid = get('RECURRENCE-ID');
          raws.push({
            uid: get('UID')?.value ?? '',
            summary: unescapeText(get('SUMMARY')?.value ?? '').trim(),
            location: unescapeText(get('LOCATION')?.value ?? '').trim(),
            description: unescapeText(get('DESCRIPTION')?.value ?? '').trim(),
            start,
            end: de ? parseStamp(de.value, de.params) : null,
            rrule: get('RRULE') ? parseRule(get('RRULE')!.value) : null,
            exdates: (cur['EXDATE'] ?? []).flatMap((p) => p.value.split(',').map((v) => parseStamp(v, p.params)?.date ?? '')).filter(Boolean),
            recurrenceId: rid ? parseStamp(rid.value, rid.params)?.date ?? null : null,
            cancelled: (get('STATUS')?.value ?? '').toUpperCase() === 'CANCELLED',
          });
        }
      }
      cur = null;
    } else if (cur) {
      const p = parseLine(t);
      if (p) (cur[p.name] ??= []).push(p);
    }
  }

  // Abweichende Einzeltermine einer Serie (RECURRENCE-ID): der Tag fällt in der Serie aus, der Einzeltermin ersetzt ihn
  const overrides = new Map<string, string[]>();
  for (const r of raws) if (r.recurrenceId) overrides.set(r.uid, [...(overrides.get(r.uid) ?? []), r.recurrenceId]);

  for (const r of raws) {
    if (r.cancelled || r.start.allDay || !r.end || r.end.allDay) {
      result.ignored++;
      continue;
    }
    if (r.end.date !== r.start.date || r.end.min <= r.start.min) {
      result.ignored++; // mehrtägig oder ohne sinnvolles Ende
      continue;
    }
    const base = {
      kind: guessKind(r.summary, r.description),
      title: r.summary || 'Termin',
      room: r.location.slice(0, 120),
      lecturer: '',
      startMin: r.start.min,
      endMin: r.end.min,
      uid: r.uid || null,
    };
    const skipped = [...r.exdates, ...(r.recurrenceId ? [] : overrides.get(r.uid) ?? [])];
    const weekly = r.rrule?.FREQ === 'WEEKLY' && [1, 2].includes(Number(r.rrule.INTERVAL) || 1);

    if (!r.rrule || r.recurrenceId) {
      result.events.push({ ...base, weekday: null, date: r.start.date, every: 1, validFrom: null, validTo: null, skipped: [] });
    } else if (weekly && r.rrule) {
      const every = (Number(r.rrule.INTERVAL) || 1) === 2 ? 2 : 1;
      const days = (r.rrule.BYDAY ? r.rrule.BYDAY.split(',').map((d) => DAYS[d.replace(/^[+-]?\d*/, '')]) : [weekdayOf(r.start.date)]).filter(
        (d) => d !== undefined,
      );
      let validTo: string | null = r.rrule.UNTIL ? parseStamp(r.rrule.UNTIL, {})?.date ?? null : null;
      if (r.rrule.COUNT) {
        // letzter Termin der Serie: COUNT zählt alle Tage der Woche zusammen
        const total = Number(r.rrule.COUNT);
        let found = 0;
        const sorted = days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
        let last = r.start.date;
        for (let w = 0; found < total && w < 300; w++) {
          const monday = addDay(mondayOf(r.start.date), w * 7 * every);
          for (const wd of sorted) {
            const d = addDay(monday, (wd + 6) % 7);
            if (d < r.start.date) continue;
            if (found >= total) break;
            found++;
            last = d;
          }
        }
        validTo = last;
      }
      if (!validTo) validTo = addDay(r.start.date, CONFIG.study.ics.unboundedWeeks * 7);
      for (const wd of days) {
        result.events.push({ ...base, weekday: wd, date: null, every, validFrom: r.start.date, validTo, skipped });
      }
    } else {
      // Täglich, monatlich, jährlich oder wöchentlich in anderem Rhythmus: einzelne Termine
      for (const date of expand(r.start.date, r.rrule, CONFIG.study.ics.maxExpand)) {
        if (skipped.includes(date)) continue;
        result.events.push({ ...base, weekday: null, date, every: 1, validFrom: null, validTo: null, skipped: [] });
      }
    }
  }
  if (result.events.length > CONFIG.study.ics.maxEvents) {
    result.events = result.events.slice(0, CONFIG.study.ics.maxEvents);
    result.truncated = true;
  }
  return result;
}

/** Schlüssel eines Termins, an dem ein erneuter Import ihn wiedererkennt. */
export function importKey(e: Pick<StudyEvent, 'uid' | 'weekday' | 'date' | 'startMin' | 'title'>): string {
  return `${e.uid ?? e.title}|${e.weekday !== null ? `w${e.weekday}` : e.date}|${e.startMin}`;
}

export interface ImportPlan {
  /** Neue und geänderte Termine, zum Speichern */
  write: StudyEvent[];
  added: number;
  updated: number;
  unchanged: number;
  /** Wegen der Obergrenze nicht angelegt */
  skippedForLimit: number;
}

/**
 * Verbindet die Termine aus der Datei mit den vorhandenen: Bekannte (gleiche Kennung, Wochentag oder Datum und Beginn) werden aktualisiert,
 * Fach und eigene Ausfälle bleiben erhalten; neue bekommen ein Fach, wenn ihr Titel zu einem Modulnamen passt.
 */
export function planIcsImport(
  existing: StudyEvent[],
  incoming: ImportEvent[],
  subjects: { id: string; name: string }[],
  makeId: () => string,
  max: number = CONFIG.study.maxEventsPerUser,
): ImportPlan {
  const byKey = new Map(existing.map((e) => [importKey(e), e]));
  const plan: ImportPlan = { write: [], added: 0, updated: 0, unchanged: 0, skippedForLimit: 0 };
  let total = existing.length;
  for (const inc of incoming) {
    const old = byKey.get(importKey(inc));
    if (old) {
      const next: StudyEvent = {
        ...old,
        title: inc.title,
        room: inc.room || old.room,
        kind: old.kind === 'blocked' ? old.kind : inc.kind === 'other' ? old.kind : inc.kind,
        endMin: inc.endMin,
        every: inc.every,
        validFrom: inc.validFrom,
        validTo: inc.validTo,
        skipped: [...new Set([...old.skipped, ...inc.skipped])].sort(),
        subjectId: old.subjectId ?? matchSubjectId(inc.title, subjects),
      };
      if (JSON.stringify(next) === JSON.stringify(old)) plan.unchanged++;
      else {
        plan.updated++;
        plan.write.push(next);
      }
    } else if (total >= max) {
      plan.skippedForLimit++;
    } else {
      total++;
      plan.added++;
      plan.write.push({ ...inc, id: makeId(), subjectId: matchSubjectId(inc.title, subjects) });
    }
  }
  return plan;
}
