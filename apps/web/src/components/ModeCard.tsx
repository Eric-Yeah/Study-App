import { CONFIG, roleFor, type AppMode } from '@study/core';
import { Link } from 'react-router-dom';
import { useStore } from '../state/store';
import { Segmented } from './Segmented';

/**
 * Schule oder Studium umschalten. Die Daten der anderen Seite bleiben erhalten, die App zeigt immer nur eine. Timer, Notizen,
 * Karteikarten, Aufgaben und der Konzentrationsscore laufen in beiden Modi gleich.
 */
export function ModeCard() {
  const { state, mode, dispatch } = useStore();
  if (!state.profile) return null;
  const hasUni = state.subjects.some((s) => s.scope === 'uni');

  const switchTo = (next: AppMode) => {
    if (next === mode) return;
    dispatch({ type: 'updateProfile', profile: { role: roleFor(next) } });
    // Das Tageslimit nur mitnehmen, wenn es noch dem Standard der bisherigen Seite entspricht (sonst hat der Nutzer es selbst gewählt)
    const from = next === 'university' ? CONFIG.plan.defaultDailyLimitMin : CONFIG.study.plan.defaultDailyLimitMin;
    const to = next === 'university' ? CONFIG.study.plan.defaultDailyLimitMin : CONFIG.plan.defaultDailyLimitMin;
    if (state.plan.dailyLimitMin === from) dispatch({ type: 'setPlan', plan: { dailyLimitMin: to } });
  };

  return (
    <div className="card stack">
      <h2>Schule oder Studium</h2>
      <Segmented<AppMode>
        label="Modus"
        value={mode}
        onChange={switchTo}
        options={[
          { value: 'school', label: 'Schule' },
          { value: 'university', label: 'Studium' },
        ]}
      />
      {mode === 'university' ? (
        <>
          <p className="muted">
            Module mit ECTS, Prüfungen mit Anmeldefristen, Noten von 1,0 bis 5,0, Stundenplan und Fristen. Lanis, Abiturrechner und die Hessen-Korrektur sind ausgeblendet. Deine Schuldaten bleiben erhalten.
          </p>
          {!hasUni && (
            <p className="notice">
              Fang mit dem <Link to="/studiengang">Studiengang</Link> an und lege dann deine <Link to="/faecher">Module</Link> an.
            </p>
          )}
        </>
      ) : (
        <p className="muted">Fächer, Klausuren, Lanis und Abitur. Deine Daten aus dem Studium bleiben erhalten, wenn du wieder dorthin wechselst.</p>
      )}
      <p className="hint">Timer, Notizen, Karteikarten, Aufgaben und Erinnerungen funktionieren in beiden Modi gleich.</p>
    </div>
  );
}
