import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTimer } from './TimerProvider';

/** Ein Tipp bis zum laufenden Timer: Fokus mit diesem Fach starten und zur Fokus-Seite wechseln. */
export function useStartFocus() {
  const timer = useTimer();
  const navigate = useNavigate();
  return useCallback(
    (subjectId: string | null) => {
      timer.startFocus(subjectId);
      navigate('/fokus');
    },
    [timer, navigate],
  );
}
