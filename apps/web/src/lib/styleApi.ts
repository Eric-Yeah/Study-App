import type { TaskStyle } from '@study/core';
import { uid } from './format';
import { supabase } from './supabase';
import type { PreparedPage } from './worksheetFiles';
import { friendly } from './adminView';

const BUCKET = 'exams';

/** Fehler mit deutscher Meldung für die Oberfläche. */
export class StyleError extends Error {}

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
  return 'Der Stil konnte nicht gelesen werden. Ist die Funktion learn-style in Supabase eingerichtet?';
}

/**
 * Lässt die KI den Stil von Aufgabenblättern ablesen. Bilder gehen kurz in den privaten Speicher "exams" (Ordner des Nutzers),
 * die Function löscht sie nach dem Lesen selbst, bei einem Fehler räumt auch der Browser auf. Text bleibt Text.
 */
export async function learnStyle(userId: string, subjectId: string, teacher: string, pages: PreparedPage[]): Promise<TaskStyle> {
  const paths: string[] = [];
  try {
    const body: ({ type: 'text'; text: string } | { type: 'image'; path: string })[] = [];
    for (const page of pages) {
      if (page.type === 'text') {
        body.push({ type: 'text', text: page.text });
        continue;
      }
      const path = `${userId}/${uid()}.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, page.blob, { contentType: 'image/jpeg' });
      if (error) throw new StyleError(friendly('Eine Seite konnte nicht hochgeladen werden. Ist der Speicher „exams“ in Supabase angelegt?'));
      paths.push(path);
      body.push({ type: 'image', path });
    }
    const { data, error } = await supabase.functions.invoke<{ style: TaskStyle }>('learn-style', { body: { subjectId, teacher, pages: body } });
    if (error || !data) throw new StyleError(friendly(await messageFrom(error)));
    return data.style;
  } finally {
    if (paths.length > 0) {
      try {
        await supabase.storage.from(BUCKET).remove(paths);
      } catch {
        /* die Function hat sie meist schon gelöscht */
      }
    }
  }
}
