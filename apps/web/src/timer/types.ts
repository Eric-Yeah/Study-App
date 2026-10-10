export type TimerPhase = 'focus' | 'shortBreak' | 'longBreak';

/** Wird als JSON in der Tabelle timer_state (Supabase) gespeichert. */
export interface TimerState {
  status: 'idle' | 'running' | 'paused';
  phase: TimerPhase;
  subjectId: string | null;
  durationMs: number;
  startedAt: number | null; // Zeitpunkt des letzten Starts oder Fortsetzens
  elapsedMs: number; // bis zum letzten Pausieren angesammelte Zeit
  completedFocus: number;
  updatedAt: number;
  deviceId: string;
}

export const PHASE_LABELS: Record<TimerPhase, string> = {
  focus: 'Konzentrationsphase',
  shortBreak: 'Kurze Pause',
  longBreak: 'Lange Pause',
};
