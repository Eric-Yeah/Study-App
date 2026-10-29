import { termsFor, type Terms } from '@study/core';
import { useStore } from '../state/store';

/** Schule oder Studium und die passenden Begriffe (Fach oder Modul, Klausur oder Prüfung). */
export function useMode(): { mode: 'school' | 'university'; isUni: boolean; terms: Terms } {
  const { mode } = useStore();
  return { mode, isUni: mode === 'university', terms: termsFor(mode) };
}
