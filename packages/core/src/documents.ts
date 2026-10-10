/**
 * Dokumente zu einem PDF zusammenfügen: Dateiname, Vorschläge aus dem Stundenplan, Seitengröße.
 * Reine Funktionen, das Zusammenfügen selbst macht die Web-App (apps/web/src/lib/mergePdf.ts).
 */
import { matchSubject } from './lanis';
import { lessonsOn, type Timetable } from './lanisPlans';

export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
export type Quarter = (typeof QUARTERS)[number];

export const isQuarter = (v: unknown): v is Quarter => typeof v === 'string' && (QUARTERS as readonly string[]).includes(v);

/** Q-Phase aus einem Kurscode: "Q1M03" -> Q1, "Q3POWI_LK01" -> Q3, "EF" -> null. */
export function quarterFromCourse(course: string): Quarter | null {
  const m = /^Q([1-4])/i.exec(course.trim());
  return m ? (`Q${m[1]}` as Quarter) : null;
}

/** Ein Teil des Dateinamens: ohne verbotene Zeichen, Leerraum wird zu "-". */
function part(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

/**
 * Dateiname nach Datum, Fach, Lehrkraft und Q-Phase: "2026-10-07_Physik_Mueller_Q1.pdf".
 * Fehlende Teile (zum Beispiel keine Lehrkraft) fallen weg, Umlaute bleiben erhalten.
 */
export function pdfFileName(meta: { date: string; subject: string; teacher: string; quarter: Quarter | null }): string {
  const parts = [meta.date, meta.subject, meta.teacher, meta.quarter ?? ''].map(part).filter(Boolean);
  const base = parts.join('_').slice(0, 120).replace(/[-_.]+$/, '');
  return `${base || 'Dokument'}.pdf`;
}

/** Lehrkraft aus dem Stundenplan: Stunden dieses Fachs, am Wochentag des Datums zuerst, sonst irgendeine. */
export function teacherFor(tt: Timetable | null, subjectId: string, subjects: { id: string; name: string }[], date: string): string {
  if (!tt || !subjectId) return '';
  const own = tt.lessons.filter((l) => l.teacher.trim() && matchSubject(l.abbr, subjects) === subjectId);
  const onDay = lessonsOn(tt, date).filter((l) => own.includes(l));
  return (onDay[0] ?? own[0])?.teacher.trim() ?? '';
}

/** Q-Phase aus dem Kurscode der Stunden dieses Fachs, sonst null. */
export function quarterFor(tt: Timetable | null, subjectId: string, subjects: { id: string; name: string }[]): Quarter | null {
  if (!tt || !subjectId) return null;
  for (const l of tt.lessons) {
    if (matchSubject(l.abbr, subjects) !== subjectId) continue;
    const q = quarterFromCourse(l.course);
    if (q) return q;
  }
  return null;
}

/**
 * Lage einer Seite auf A4: Hoch- oder Querformat nach dem Bild, das Bild wird eingepasst und zentriert, nie vergrößert
 * über die Seite hinaus. Maße in Punkten.
 */
export function fitOnA4(
  imageWidth: number,
  imageHeight: number,
  a4: { width: number; height: number },
): { pageWidth: number; pageHeight: number; x: number; y: number; width: number; height: number } {
  const landscape = imageWidth > imageHeight;
  const pageWidth = landscape ? a4.height : a4.width;
  const pageHeight = landscape ? a4.width : a4.height;
  const scale = Math.min(pageWidth / Math.max(imageWidth, 1), pageHeight / Math.max(imageHeight, 1));
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { pageWidth, pageHeight, x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height };
}

/** Größe zum Anzeigen: "1,4 MB", "820 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(Math.round((bytes / (1024 * 1024)) * 10) / 10).toString().replace('.', ',')} MB`;
}

/**
 * Dateiname eines Lernordners: "Lernordner_Physik_Q1.pdf", bei mehreren Q-Phasen "Lernordner_Physik_Q1-Q3.pdf",
 * ohne Fach "Lernordner_Alle-Fächer_Q1.pdf". Ohne Q-Phase an den Notizen fällt der Teil weg.
 */
export function folderFileName(subject: string | null, notes: readonly { quarter: Quarter | null }[]): string {
  const quarters = [...new Set(notes.map((n) => n.quarter).filter((q): q is Quarter => q !== null))].sort();
  const range = quarters.length === 0 ? '' : quarters.length === 1 ? quarters[0] : `${quarters[0]}-${quarters[quarters.length - 1]}`;
  return pdfFileName({ date: 'Lernordner', subject: subject?.trim() || 'Alle Fächer', teacher: range, quarter: null });
}
