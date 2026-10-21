import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { combinedPlan, examsWithPlans, focusRecommendation } from '../state/selectors';
import { useStore } from '../state/store';
import { useTimer } from '../timer/TimerProvider';

/** Adresse /jetzt (Verknüpfung der installierten App): sucht das Fach laut Plan, startet den Timer und öffnet den Fokus. */
export function StartNow() {
  const { state } = useStore();
  const timer = useTimer();
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const now = new Date();
    const list = examsWithPlans(state, now);
    const rec = focusRecommendation(state, list, combinedPlan(state, list, now), timer.state.subjectId, now);
    // Läuft oder pausiert schon etwas, geht es dort weiter
    timer.startFocus(timer.state.status === 'idle' ? rec.subjectId : null);
    navigate('/fokus', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
