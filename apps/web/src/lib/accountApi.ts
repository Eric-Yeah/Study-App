import { supabase } from './supabase';

/** Löscht das eigene Konto mit allen Daten und Dateien (Edge Function delete-account). */
export async function deleteOwnAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>('delete-account', { body: { confirm: 'LÖSCHEN' } });
  if (error || !data?.ok) {
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = (await ctx.json()) as { message?: string };
        if (body.message) throw new Error(body.message);
      } catch (e) {
        if (e instanceof Error && e.message) throw e;
      }
    }
    throw new Error('Das Konto konnte gerade nicht gelöscht werden. Versuche es später noch einmal.');
  }
}
