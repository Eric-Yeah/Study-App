import { CONFIG, applySolutions, readPracticeContent, type Level, type PracticeContent, type PracticeMeta, type PracticeSolutions } from '@study/core';
import { supabase } from './supabase';
import { friendly } from './adminView';

/** Fehler mit deutscher Meldung für die Oberfläche. */
export class PracticeError extends Error {}

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
  return 'Die Übungsklausur konnte nicht erstellt werden. Ist die Funktion generate-exam in Supabase eingerichtet?';
}

export interface PracticeRequest {
  practiceId: string;
  subjectId: string;
  level: Level;
  noteIds: string[];
  topic: string;
  teacher: string;
  durationMin: number;
}

/** Schreibt Erwartungshorizont und Musterlösung zu einer fertigen Klausur (zweiter Schritt). */
export async function generateSolutions(practiceId: string, subjectId: string, exam: PracticeContent): Promise<PracticeContent> {
  const { data, error } = await supabase.functions.invoke<{ solutions: PracticeSolutions }>('generate-exam', {
    body: { mode: 'solutions', practiceId, subjectId, exam },
  });
  if (error || !data?.solutions) throw new PracticeError(friendly(await messageFrom(error)));
  return applySolutions(readPracticeContent(exam) ?? exam, data.solutions);
}

export interface Generated {
  content: PracticeContent;
  meta: PracticeMeta | null;
  solutionsError: string; // leer, wenn der Erwartungshorizont dabei ist
}

/**
 * Erstellt eine Übungsklausur in zwei Schritten: erst die Klausur, dann Erwartungshorizont und Musterlösung. Scheitert nur der
 * zweite Schritt, bleibt die Klausur erhalten (solutionsError sagt warum) und der Erwartungshorizont lässt sich nachholen.
 */
export async function generatePractice(req: PracticeRequest, onStep: (step: 1 | 2) => void): Promise<Generated> {
  onStep(1);
  const first = await supabase.functions.invoke<{ exam: PracticeContent; meta: PracticeMeta }>('generate-exam', {
    body: { mode: 'exam', ...req, topic: req.topic.slice(0, CONFIG.practice.maxTopicChars) },
  });
  if (first.error || !first.data?.exam) throw new PracticeError(friendly(await messageFrom(first.error)));
  const exam = readPracticeContent(first.data.exam); // sicher einlesen, damit alle Felder da sind
  if (!exam) throw new PracticeError('Die Antwort der KI konnte nicht gelesen werden. Versuche es noch einmal.');
  onStep(2);
  try {
    return { content: await generateSolutions(req.practiceId, req.subjectId, exam), meta: first.data.meta ?? null, solutionsError: '' };
  } catch (e) {
    return { content: exam, meta: first.data.meta ?? null, solutionsError: e instanceof Error ? e.message : 'Der Erwartungshorizont fehlt noch.' };
  }
}
