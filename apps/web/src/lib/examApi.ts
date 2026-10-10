import type { ExamPage, ExamPageRole, LearnResult, StoredGrading } from '@study/core';
import { uid } from './format';
import { supabase } from './supabase';
import type { PreparedPage } from './worksheetFiles';
import { friendly } from './adminView';

const BUCKET = 'exams';

/** Fehler mit deutscher Meldung für die Oberfläche. */
export class ExamError extends Error {}

async function messageFrom(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as { message?: string };
      if (body.message) return body.message;
    } catch {
      /* weiter unten */
    }
  }
  return 'Die Korrektur ist fehlgeschlagen. Ist die Funktion correct-exam in Supabase eingerichtet?';
}

/**
 * Lädt die vorbereiteten Seiten einer Rolle hoch (Bilder in den privaten Speicher "exams", verknüpft mit der Korrektur)
 * und gibt die Seiten für die Edge Function zurück. Text bleibt Text und wird nicht gespeichert.
 */
export async function uploadExamPages(userId: string, reviewId: string, role: ExamPageRole, pages: PreparedPage[], offset = 0): Promise<ExamPage[]> {
  const paths: string[] = [];
  try {
    const out: ExamPage[] = [];
    for (const page of pages) {
      if (page.type === 'text') {
        out.push({ type: 'text', text: page.text, role });
        continue;
      }
      const path = `${userId}/${uid()}.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, page.blob, { contentType: 'image/jpeg' });
      if (error) throw new ExamError(friendly('Eine Seite konnte nicht hochgeladen werden. Ist der Speicher „exams“ in Supabase angelegt?'));
      paths.push(path);
      out.push({ type: 'image', path, role });
    }
    if (paths.length > 0) {
      const { error } = await supabase
        .from('exam_files')
        .insert(paths.map((storage_path, i) => ({ review_id: reviewId, user_id: userId, storage_path, role, position: offset + i })));
      if (error) throw new ExamError('Die Seiten konnten nicht mit der Korrektur verknüpft werden.');
    }
    return out;
  } catch (e) {
    if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
    throw e;
  }
}

/** Löscht die gespeicherten Seiten einer Korrektur. Das Ergebnis bleibt, die Seiten braucht danach niemand mehr. */
export async function removeExamFiles(reviewId: string): Promise<void> {
  const { data } = await supabase.from('exam_files').select('storage_path').eq('review_id', reviewId);
  const paths = (data ?? []).map((r) => r.storage_path as string);
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
  await supabase.from('exam_files').delete().eq('review_id', reviewId);
}

export interface Correction {
  main: StoredGrading;
  compare: StoredGrading | null;
  compareError: string;
}

/** Lässt die Klausur korrigieren. compare: zusätzlich mit dem Vergleichsmodell (CONFIG.exam.compareModel). */
export async function correctExam(reviewId: string, pages: ExamPage[], compare: boolean): Promise<Correction> {
  const { data, error } = await supabase.functions.invoke<Correction>('correct-exam', { body: { mode: 'grade', reviewId, pages, compare } });
  if (error || !data) throw new ExamError(friendly(await messageFrom(error)));
  return { main: data.main, compare: data.compare ?? null, compareError: data.compareError ?? '' };
}

/** Vergleicht die KI-Korrektur mit der von der Lehrkraft korrigierten Klausur: Punkte ablesen, Erfahrungen vorschlagen. */
export async function learnFromTeacher(reviewId: string, pages: ExamPage[]): Promise<LearnResult> {
  const { data, error } = await supabase.functions.invoke<{ learn: LearnResult }>('correct-exam', { body: { mode: 'learn', reviewId, pages } });
  if (error || !data) throw new ExamError(friendly(await messageFrom(error)));
  return data.learn;
}
