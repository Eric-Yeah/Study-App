import { CONFIG, type CardDifficulty, type GeneratedCard } from '@study/core';
import { supabase } from './supabase';
import { friendly } from './adminView';

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
  return 'Die KI-Karten sind fehlgeschlagen. Ist die Funktion generate-cards in Supabase eingerichtet?';
}

/** Lässt die KI (Groq, über die Edge Function generate-cards) Karten zur Zusammenfassung einer Notiz vorschlagen. */
export async function generateCards(noteId: string, existingFronts: string[], difficulty: CardDifficulty | null = null): Promise<GeneratedCard[]> {
  const { data, error } = await supabase.functions.invoke<{ cards: GeneratedCard[] }>('generate-cards', {
    body: { noteId, existingFronts: existingFronts.slice(0, CONFIG.cardsAi.maxExistingFronts), ...(difficulty ? { difficulty } : {}) },
  });
  if (error || !data) throw new Error(friendly(await messageFrom(error)));
  return data.cards;
}
