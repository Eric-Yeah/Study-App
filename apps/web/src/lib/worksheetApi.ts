import {
  CONFIG,
  chunkPages,
  spentUsd,
  mergeSummaries,
  type Effort,
  type WorksheetPage,
  type WorksheetSummary,
} from '@study/core';
import { uid } from './format';
import { supabase } from './supabase';
import { friendly } from './adminView';

const BUCKET = 'worksheets';
const DOCUMENTS = 'documents';

/** Fehler mit deutscher Meldung für die Oberfläche. */
export class WorksheetError extends Error {}

const RANK: Record<Effort, number> = { low: 0, medium: 1, high: 2 };

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
  return 'Die Zusammenfassung ist fehlgeschlagen. Ist die Funktion summarize-worksheet in Supabase eingerichtet?';
}

/** Lädt die verkleinerten Bilder in den privaten Speicher und verknüpft sie mit der Notiz. Gibt die Pfade zurück. */
export async function uploadWorksheetImages(userId: string, noteId: string, blobs: Blob[]): Promise<string[]> {
  const paths: string[] = [];
  try {
    for (const blob of blobs) {
      const path = `${userId}/${uid()}.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
      if (error) throw new WorksheetError(friendly('Ein Bild konnte nicht hochgeladen werden. Ist der Speicher „worksheets“ in Supabase angelegt?'));
      paths.push(path);
    }
    if (paths.length > 0) {
      const { error } = await supabase
        .from('worksheet_files')
        .insert(paths.map((storage_path) => ({ lesson_note_id: noteId, user_id: userId, storage_path })));
      if (error) throw new WorksheetError('Die Bilder konnten nicht mit der Notiz verknüpft werden.');
    }
    return paths;
  } catch (e) {
    if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
    throw e;
  }
}

/**
 * Fasst die Seiten zusammen. Mehr als CONFIG.ai.maxImagesPerRequest Bilder gehen in Päckchen, die Ergebnisse
 * werden zusammengeführt. forceEffort 'high' liest genauer (für "Genauer lesen").
 */
export async function summarizeWorksheet(
  noteId: string,
  pages: WorksheetPage[],
  forceEffort?: 'medium' | 'high',
  onChunk?: (done: number, total: number) => void,
): Promise<{ summary: WorksheetSummary; effort: Effort }> {
  const chunks = chunkPages(pages, CONFIG.ai.maxImagesPerRequest);
  const summaries: WorksheetSummary[] = [];
  let effort: Effort = 'low';
  for (let i = 0; i < chunks.length; i++) {
    onChunk?.(i, chunks.length);
    const { data, error } = await supabase.functions.invoke<{ summary: WorksheetSummary; effort: Effort }>('summarize-worksheet', {
      body: { lessonNoteId: noteId, pages: chunks[i], forceEffort },
    });
    if (error || !data) throw new WorksheetError(friendly(await messageFrom(error)));
    summaries.push(data.summary);
    if (RANK[data.effort] > RANK[effort]) effort = data.effort;
  }
  onChunk?.(chunks.length, chunks.length);
  return { summary: mergeSummaries(summaries), effort };
}

/** Anteil des KI-Monatsbudgets, der schon verbraucht ist (0 bis 1, kann darüber liegen), oder null, wenn unbekannt. */
export async function budgetUsedShare(): Promise<number | null> {
  const month = new Date().toISOString().slice(0, 7);
  // Eine Zeile je Modell, jedes Modell hat seinen eigenen Preis
  const { data, error } = await supabase.from('ai_usage').select('model, input_tokens, output_tokens').eq('month', month);
  if (error) return null;
  return spentUsd(data ?? [], CONFIG.ai.prices) / CONFIG.ai.monthlyBudgetUsd;
}

/** Pfade der gespeicherten Bilder einer Notiz (für "Genauer lesen" und zum Löschen). */
export async function noteImagePaths(noteId: string): Promise<string[]> {
  const { data } = await supabase.from('worksheet_files').select('storage_path').eq('lesson_note_id', noteId).order('created_at');
  return (data ?? []).map((r) => r.storage_path as string);
}

/** Entfernt die Bilder einer Notiz aus dem Speicher. Die Zeilen in worksheet_files gehen mit der Notiz (cascade). */
export async function removeNoteImages(noteId: string): Promise<void> {
  const paths = await noteImagePaths(noteId);
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
}

/** Lädt das zusammengefügte PDF in den privaten Speicher "documents". Gibt den Pfad zurück. */
export async function uploadDocument(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/${uid()}.pdf`;
  const { error } = await supabase.storage.from(DOCUMENTS).upload(path, blob, { contentType: 'application/pdf' });
  if (error) throw new WorksheetError(friendly('Das PDF konnte nicht hochgeladen werden. Ist der Speicher „documents“ in Supabase angelegt?'));
  return path;
}

/** Entfernt ein PDF aus dem Speicher. Fehler sind hier egal, die Notiz ist dann ohnehin weg. */
export async function removeDocument(path: string): Promise<void> {
  await supabase.storage.from(DOCUMENTS).remove([path]);
}

/** Holt ein gespeichertes PDF zum Öffnen oder Speichern. */
export async function downloadDocument(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(DOCUMENTS).download(path);
  if (error || !data) throw new WorksheetError('Das PDF konnte nicht geladen werden.');
  return data;
}
