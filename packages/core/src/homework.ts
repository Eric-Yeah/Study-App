import { CONFIG } from './config';
import { matchSubject } from './lanis';
import { lessonsOn, type Timetable } from './lanisPlans';

/**
 * Hausaufgaben und Anhänge aus den Kursmappen in Lanis (Schulportal Hessen, "Mein Unterricht"). Reine Funktionen ohne DOM.
 *
 * Quelle sind die Kursseiten (meinunterricht.php?a=sus_view&id=KURS), Aufbau an echten Seiten geprüft (22.10.2026):
 *   <h1 data-book="6829">Biologie GK 12 a <small><span class="label">1. Halbjahr</span></small></h1>
 *   <button ... title="Stauch, Saskia Katharina (Stc)">
 *   <tr data-entry="15"><td><a id="eintrag20260929"></a>29.09.2026<br/><small>5. Stunde</small></td>
 *     <td><b>Thema</b><br/>
 *       <i class="fas fa-home"></i> <span class="homework"><span class="done hidden">…</span><span class="undone ">…</span></span>
 *       <br/><span class="markup">Text der Hausaufgabe</span>
 *       <div class="alert alert-info"> … <div class="file" data-extension="pdf" data-file="Name.pdf"><a href="#">Name.pdf <small>(241,62 KB)</small></a></div></div>
 *     </td><td>…</td></tr>
 * "erledigt" steht im Span class="done" (sichtbar) oder class="done hidden" (nicht erledigt). Der Link zu einer Datei entsteht in
 * Lanis erst per Skript: meinunterricht.php?a=downloadFile&id=KURS&e=EINTRAG&f=DATEINAME (die Function baut ihn selbst).
 * Der Parser ist tolerant gegenüber anderen Reihenfolgen und fehlenden Teilen.
 */

export interface HomeworkFile {
  name: string;
  /** Dateiendung klein geschrieben, ohne Punkt (aus data-extension, sonst aus dem Namen) */
  ext: string;
  /** Größe in Bytes laut Anzeige, 0 wenn unbekannt */
  size: number;
}

export interface LanisEntry {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** zum Beispiel "5. - 6. Stunde" */
  slot: string;
  topic: string;
  /** Text der Hausaufgabe, null ohne Hausaufgabe */
  homework: string | null;
  /** In Lanis als erledigt markiert (null: unbekannt oder keine Hausaufgabe) */
  done: boolean | null;
  files: HomeworkFile[];
}

export interface CourseBook {
  /** Kursmappe in Lanis (data-book), steckt in jedem Dateilink */
  book: string;
  name: string;
  halfYear: string;
  teacher: string;
  teacherShort: string;
  entries: LanisEntry[];
}

/** Ein Eintrag mit Hausaufgabe und/oder Anhängen, flach und mit Kurs. */
export interface HomeworkItem {
  /** `KURS:EINTRAG`, eindeutig und stabil */
  key: string;
  book: string;
  entry: string;
  course: string;
  teacher: string;
  teacherShort: string;
  date: string;
  slot: string;
  topic: string;
  text: string;
  done: boolean;
  files: HomeworkFile[];
}

/** Gespeicherter Stand: die Einträge und alle Schlüssel, aus denen schon eine Aufgabe wurde (auch gelöschte kommen nicht wieder). */
export interface HomeworkSnapshot {
  items: HomeworkItem[];
  imported: string[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ndash: '–', mdash: '—', hellip: '…' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

const oneLine = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Text mit Zeilenumbrüchen: br und Absatzende werden zu Zeilen, Tags fallen weg. */
function multiLine(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, ''))
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Inhalt des Tags, das bei `open` beginnt (mit Zählung verschachtelter gleicher Tags), oder null. */
function innerOf(html: string, open: number, tag: string): string | null {
  const start = html.indexOf('>', open);
  if (start < 0) return null;
  const re = new RegExp(`<(/?)${tag}\\b`, 'gi');
  re.lastIndex = start;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start + 1, m.index);
  }
  return null;
}

const sizeOf = (text: string): number => {
  const m = /([\d.,]+)\s*(KB|MB|GB|B)\b/i.exec(text);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  const unit = m[2].toUpperCase();
  return Math.round(n * (unit === 'GB' ? 1024 ** 3 : unit === 'MB' ? 1024 ** 2 : unit === 'KB' ? 1024 : 1));
};

const extOf = (name: string) => /\.([a-z0-9]{1,6})$/i.exec(name)?.[1].toLowerCase() ?? '';

function parseFiles(cell: string): HomeworkFile[] {
  const files: HomeworkFile[] = [];
  const tags = [...cell.matchAll(/<[a-z]+\b[^>]*\bdata-file="([^"]*)"[^>]*>/gi)];
  tags.forEach((m, i) => {
    const name = decodeEntities(m[1]).trim();
    if (!name || files.some((f) => f.name === name)) return;
    const upto = tags[i + 1]?.index ?? cell.length;
    const after = cell.slice(m.index! + m[0].length, upto);
    const ext = /\bdata-extension="([^"]*)"/i.exec(m[0])?.[1]?.toLowerCase().replace(/^\./, '') || extOf(name);
    files.push({ name, ext, size: sizeOf(/<small>\s*\(([^)]*)\)\s*<\/small>/i.exec(after)?.[1] ?? '') });
  });
  return files;
}

const toIso = (d: string, m: string, y: string) => `${y}-${m}-${d}`;

function parseEntry(id: string, row: string): LanisEntry | null {
  const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
  if (cells.length < 2) return null;
  const date = /(\d{2})\.(\d{2})\.(\d{4})/.exec(oneLine(cells[0]));
  if (!date) return null;
  const slot = oneLine(/<small>([\s\S]*?)<\/small>/i.exec(cells[0])?.[1] ?? '');
  const main = cells[1];

  let topic = '';
  for (const b of main.matchAll(/<b\b[^>]*>([\s\S]*?)<\/b>/gi)) {
    const t = oneLine(b[1]);
    if (t && !/^anhänge:?$/i.test(t)) {
      topic = t;
      break;
    }
  }

  let homework: string | null = null;
  let done: boolean | null = null;
  const hw = /<span\b[^>]*class="[^"]*\bhomework\b[^"]*"[^>]*>/i.exec(main);
  if (hw) {
    const block = innerOf(main, hw.index, 'span') ?? '';
    const state = /<span\b[^>]*class="([^"]*\bdone\b[^"]*)"/i.exec(block)?.[1];
    if (state !== undefined) done = !/\bhidden\b/i.test(state);
    else if (/<span\b[^>]*class="[^"]*\bundone\b/i.test(block)) done = false;
    const markupAt = main.slice(hw.index).search(/<span\b[^>]*class="[^"]*\bmarkup\b[^"]*"/i);
    if (markupAt >= 0) {
      const text = multiLine(innerOf(main, hw.index + markupAt, 'span') ?? '');
      if (text) homework = text;
    }
    if (homework === null) done = null;
  }
  return { id, date: toIso(date[1], date[2], date[3]), slot, topic, homework, done, files: parseFiles(main) };
}

/** Liest eine Kursseite. Ohne erkennbare Kursmappe (data-book) null. */
export function parseCourseBook(html: string): CourseBook | null {
  const h1 = /<h1\b[^>]*\bdata-book="(\d+)"[^>]*>/i.exec(html);
  if (!h1) return null;
  const inner = innerOf(html, h1.index, 'h1') ?? '';
  const name = oneLine(inner.replace(/<small[\s\S]*?<\/small>/gi, ''));
  const halfYear = oneLine(/<small[^>]*>([\s\S]*?)<\/small>/i.exec(inner)?.[1] ?? '');
  const after = html.slice(h1.index);
  const t = /<button\b[^>]*\btitle="([^"]*\(([^)]*)\))"/i.exec(after);
  const teacher = t ? decodeEntities(t[1]).replace(/\s*\([^)]*\)\s*$/, '').trim() : '';
  const entries: LanisEntry[] = [];
  const seen = new Set<string>();
  for (const m of after.matchAll(/<tr\b[^>]*\bdata-entry="(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi)) {
    if (seen.has(m[1])) continue;
    const e = parseEntry(m[1], m[2]);
    if (e) {
      seen.add(m[1]);
      entries.push(e);
    }
  }
  return { book: h1[1], name, halfYear, teacher, teacherShort: t ? decodeEntities(t[2]).trim() : '', entries };
}

export interface HomeworkDiagnosis {
  courses: number;
  entries: number;
  withHomework: number;
  withFiles: number;
  /** Seiten ohne erkennbare Kursmappe */
  unreadable: number;
}

export function diagnoseBooks(pages: string[]): HomeworkDiagnosis {
  const books = pages.map(parseCourseBook);
  const read = books.filter((b): b is CourseBook => b !== null);
  const all = read.flatMap((b) => b.entries);
  return {
    courses: read.length,
    entries: all.length,
    withHomework: all.filter((e) => e.homework).length,
    withFiles: all.filter((e) => e.files.length > 0).length,
    unreadable: books.length - read.length,
  };
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Einträge mit Hausaufgabe oder Anhängen aus den Kursseiten, neueste zuerst, nicht älter als keepDays.
 * Doppelte Einträge (derselbe Kurs und Eintrag) zählen einmal.
 */
export function buildHomework(pages: string[], today: string, keepDays: number = CONFIG.homework.keepDays): HomeworkItem[] {
  const oldest = addDays(today, -keepDays);
  const items = new Map<string, HomeworkItem>();
  for (const page of pages) {
    const book = parseCourseBook(page);
    if (!book) continue;
    for (const e of book.entries) {
      if ((!e.homework && e.files.length === 0) || e.date < oldest) continue;
      const key = `${book.book}:${e.id}`;
      if (items.has(key)) continue;
      items.set(key, {
        key,
        book: book.book,
        entry: e.id,
        course: book.name,
        teacher: book.teacher,
        teacherShort: book.teacherShort,
        date: e.date,
        slot: e.slot,
        topic: e.topic,
        text: e.homework ?? '',
        done: e.done === true,
        files: e.files,
      });
    }
  }
  return [...items.values()].sort((a, b) => b.date.localeCompare(a.date) || Number(b.entry) - Number(a.entry));
}

/** Kurzname eines Kurses ohne Stufe und Kurscode: "Englisch LK 12 (Q1E_LK01-GYM)" wird "Englisch". */
export function courseBase(course: string): string {
  return course
    .replace(/\(.*$/, '')
    .replace(/\s+(GK|LK|Q[1-4]|E\d?|\d{1,2})\b.*$/i, '')
    .trim();
}

/** Fach der App zu einem Lanis-Kurs, nach dem Namen. Null, wenn nichts passt. */
export function subjectForCourse(course: string, subjects: { id: string; name: string }[]): string | null {
  const base = courseBase(course).toLowerCase();
  if (!base) return null;
  const exact = subjects.find((s) => s.name.trim().toLowerCase() === base);
  if (exact) return exact.id;
  const loose = subjects.find((s) => {
    const n = s.name.trim().toLowerCase();
    return n.length >= 3 && (n.startsWith(base) || base.startsWith(n));
  });
  return loose?.id ?? matchSubject(base, subjects);
}

/**
 * Abgabetag einer Hausaufgabe: die nächste Stunde des Fachs nach dem Eintrag (höchstens 14 Tage später),
 * ohne Stundenplan oder Fach der nächste Schultag. Immer nach dem Tag des Eintrags.
 */
export function dueDateFor(entryDate: string, subjectId: string | null, timetable: Timetable | null, subjects: { id: string; name: string }[]): string {
  if (timetable && subjectId) {
    for (let i = 1; i <= 14; i++) {
      const day = addDays(entryDate, i);
      if (lessonsOn(timetable, day).some((l) => matchSubject(l.abbr, subjects) === subjectId)) return day;
    }
  }
  for (let i = 1; i <= 3; i++) {
    const day = addDays(entryDate, i);
    const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) return day;
  }
  return addDays(entryDate, 1);
}

export interface HomeworkTaskDraft {
  externalId: string;
  title: string;
  subjectId: string | null;
  date: string;
}

export interface HomeworkPlan {
  add: HomeworkTaskDraft[];
  /** Aufgaben (ids), die in Lanis erledigt sind und in der App noch offen */
  complete: string[];
  /** neue Liste der schon verarbeiteten Schlüssel */
  imported: string[];
}

const taskTitle = (item: HomeworkItem, subjectKnown: boolean) => {
  const flat = item.text.replace(/\s+/g, ' ').trim();
  const text = flat.length > CONFIG.homework.titleMax ? `${flat.slice(0, CONFIG.homework.titleMax - 1).trimEnd()}…` : flat;
  return subjectKnown ? text : `${courseBase(item.course) || item.course}: ${text}`;
};

const IMPORTED_KEEP = 600;

/**
 * Was aus dem neuen Stand wird: neue offene Hausaufgaben der letzten taskDays Tage werden zu Aufgaben (jede nur einmal, auch wenn
 * sie später gelöscht wird), in Lanis erledigte schließen die zugehörige Aufgabe. Die App schreibt nie nach Lanis zurück.
 */
export function planHomework(
  items: HomeworkItem[],
  ctx: { imported: string[]; tasks: { id: string; done: boolean; externalId?: string | null }[]; subjects: { id: string; name: string }[]; timetable: Timetable | null; today: string },
): HomeworkPlan {
  const known = new Set(ctx.imported);
  const imported = [...ctx.imported];
  const add: HomeworkTaskDraft[] = [];
  const earliest = addDays(ctx.today, -CONFIG.homework.taskDays);
  for (const item of [...items].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!item.text || known.has(item.key)) continue;
    if (item.done || item.date < earliest) continue;
    const subjectId = subjectForCourse(item.course, ctx.subjects);
    add.push({ externalId: item.key, title: taskTitle(item, subjectId !== null), subjectId, date: dueDateFor(item.date, subjectId, ctx.timetable, ctx.subjects) });
    known.add(item.key);
    imported.push(item.key);
  }
  const doneKeys = new Set(items.filter((i) => i.done).map((i) => i.key));
  const complete = ctx.tasks.filter((t) => t.externalId && !t.done && doneKeys.has(t.externalId)).map((t) => t.id);
  return { add, complete, imported: imported.slice(-IMPORTED_KEEP) };
}

/** Eindeutiger Schlüssel einer Datei an einem Eintrag, damit die App weiß, was schon als Notiz übernommen wurde. */
export const fileKey = (item: Pick<HomeworkItem, 'book' | 'entry'>, file: Pick<HomeworkFile, 'name'>) => `${item.book}:${item.entry}:${file.name}`;

const IMAGE_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

/** MIME-Typ, mit dem die App die Datei in eine Notiz übernehmen kann (PDF und Bilder), sonst null. */
export function importableType(file: Pick<HomeworkFile, 'name' | 'ext'>): string | null {
  const ext = (file.ext || extOf(file.name)).toLowerCase();
  return ext === 'pdf' ? 'application/pdf' : IMAGE_TYPES[ext] ?? null;
}

/** Eintrag mit Anhängen, die sich übernehmen lassen und noch in keiner Notiz stehen. */
export function newFiles(item: HomeworkItem, takenKeys: Set<string>): HomeworkFile[] {
  return item.files.filter((f) => importableType(f) !== null && !takenKeys.has(fileKey(item, f)));
}

/** Aufbau der Anfrage an die Function (nur Zahlen und der Dateiname, die URL baut die Function selbst). */
export interface DownloadRequest {
  book: string;
  entry: string;
  name: string;
}

export const downloadRequest = (item: Pick<HomeworkItem, 'book' | 'entry'>, file: Pick<HomeworkFile, 'name'>): DownloadRequest => ({ book: item.book, entry: item.entry, name: file.name });

const isStr = (v: unknown): v is string => typeof v === 'string';

/** Gespeicherten Stand sicher lesen (die Spalte ist JSON, das Format kann sich ändern). Unbrauchbares gibt null. */
export function readHomework(raw: unknown): HomeworkSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { items?: unknown; imported?: unknown };
  if (!Array.isArray(r.items)) return null;
  const items: HomeworkItem[] = [];
  for (const x of r.items as Record<string, unknown>[]) {
    if (!x || !isStr(x.key) || !isStr(x.book) || !isStr(x.entry) || !isStr(x.date) || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) continue;
    const files = Array.isArray(x.files)
      ? (x.files as Record<string, unknown>[]).filter((f) => f && isStr(f.name)).map((f) => ({ name: f.name as string, ext: isStr(f.ext) ? f.ext : '', size: typeof f.size === 'number' ? f.size : 0 }))
      : [];
    items.push({
      key: x.key,
      book: x.book,
      entry: x.entry,
      course: isStr(x.course) ? x.course : '',
      teacher: isStr(x.teacher) ? x.teacher : '',
      teacherShort: isStr(x.teacherShort) ? x.teacherShort : '',
      date: x.date,
      slot: isStr(x.slot) ? x.slot : '',
      topic: isStr(x.topic) ? x.topic : '',
      text: isStr(x.text) ? x.text : '',
      done: x.done === true,
      files,
    });
  }
  return { items, imported: Array.isArray(r.imported) ? (r.imported as unknown[]).filter(isStr) : [] };
}

export type DueTone = 'late' | 'today' | 'soon' | 'later';

export interface DueInfo {
  /** Tage bis zur Abgabe (negativ: überfällig) */
  days: number;
  /** "heute fällig", "morgen fällig", "in 3 Tagen fällig", "seit 2 Tagen überfällig" */
  label: string;
  tone: DueTone;
}

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T12:00:00Z`) / 86_400_000);

/** Wie weit die Abgabe entfernt ist, in Worten und mit einer Stufe für die Farbe (soon: heute bis übermorgen). */
export function dueInfo(due: string, today: string): DueInfo {
  const days = dayNumber(due) - dayNumber(today);
  if (days < 0) return { days, label: days === -1 ? 'seit gestern überfällig' : `seit ${-days} Tagen überfällig`, tone: 'late' };
  if (days === 0) return { days, label: 'heute fällig', tone: 'today' };
  if (days === 1) return { days, label: 'morgen fällig', tone: 'soon' };
  return { days, label: `in ${days} Tagen fällig`, tone: days <= 2 ? 'soon' : 'later' };
}

/** Überschrift einer Gruppe nach Abgabetag: Überfällig, Heute, Morgen, sonst der Tag (die Seite schreibt das Datum dazu). */
export function dueGroup(due: string, today: string): 'late' | 'today' | 'tomorrow' | 'day' {
  const d = dayNumber(due) - dayNumber(today);
  return d < 0 ? 'late' : d === 0 ? 'today' : d === 1 ? 'tomorrow' : 'day';
}
