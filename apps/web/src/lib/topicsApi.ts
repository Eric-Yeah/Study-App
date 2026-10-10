import type { SuggestedTopic } from '@study/core';
import { supabase } from './supabase';
import { friendly } from './adminView';

/** Fehler mit deutscher Meldung für die Oberfläche. */
export class TopicsError extends Error {}

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
  return 'Die Themen konnten nicht vorgeschlagen werden. Ist die Funktion suggest-topics in Supabase eingerichtet?';
}

export interface TopicSuggestions {
  topics: SuggestedTopic[];
  notes: { id: string; title: string }[]; // in der Reihenfolge, auf die sich "sources" (ab 1) beziehen
}

/** Lässt die KI (Haiku, über die Edge Function suggest-topics) Themen für eine Klausur aus den gewählten Notizen vorschlagen. */
export async function suggestTopics(examId: string, noteIds: string[], existing: string[]): Promise<TopicSuggestions> {
  const { data, error } = await supabase.functions.invoke<TopicSuggestions>('suggest-topics', { body: { examId, noteIds, existing } });
  if (error || !data) throw new TopicsError(friendly(await messageFrom(error)));
  return { topics: data.topics, notes: data.notes };
}
