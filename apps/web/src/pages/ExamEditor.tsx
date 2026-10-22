import { planExam, toIsoDate, type Exam } from '@study/core';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { OverridableSlider } from '../components/OverridableSlider';
import { PlainSlider } from '../components/PlainSlider';
import { Segmented } from '../components/Segmented';
import { Timeline } from '../components/Timeline';
import { Topics } from '../components/Topics';
import { formatDays, formatHours, formatMinutes, formatNumber, uid } from '../lib/format';
import { useStore } from '../state/store';
import { useAccess } from '../lib/access';

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
}

export function ExamEditor() {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const access = useAccess();
  const navigate = useNavigate();
  const existing = state.exams.find((e) => e.id === id);
  const selectable = state.subjects;

  const [draft, setDraft] = useState<Exam>(
    () =>
      existing ?? {
        id: uid(),
        subjectId: selectable[0]?.id ?? '',
        title: '',
        date: inDays(14),
        priorityManual: null,
        totalHoursManual: null,
        startDaysManual: null,
      },
  );
  const subject = state.subjects.find((s) => s.id === draft.subjectId);
  // Ein geleertes Datumsfeld würde den ganzen Plan ungültig machen (NaN): dann gibt es keine Berechnung und kein Speichern
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.date);
  const plan = useMemo(() => (subject && validDate ? planExam(subject, draft, state.plan) : null), [subject, validDate, draft, state.plan]);

  if (selectable.length === 0) {
    return (
      <div className="card stack">
        <h1>Erst ein Fach anlegen</h1>
        <p className="muted">Für eine Klausur braucht die App ein Fach mit Notenstand und Schwierigkeit.</p>
        <Link className="btn btn-primary" to="/faecher">
          Zu den Fächern
        </Link>
      </div>
    );
  }

  const set = (patch: Partial<Exam>) => setDraft((d) => ({ ...d, ...patch }));
  const maxStart = plan ? Math.max(1, Math.min(90, plan.daysLeft)) : 30;

  const save = () => {
    dispatch({ type: 'upsertExam', exam: draft });
    navigate('/plan');
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>{existing ? 'Klausur bearbeiten' : 'Klausur anlegen'}</h1>
          <p className="sub">Die App schlägt alles vor, du kannst jeden Wert überschreiben.</p>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card stack" style={{ gap: 18 }}>
          <label className="field">
            <span>Fach</span>
            <select
              className="input"
              value={draft.subjectId}
              onChange={(e) => set({ subjectId: e.target.value, priorityManual: null, totalHoursManual: null, startDaysManual: null })}
            >
              {selectable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Titel</span>
            <input className="input" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Klausur Analysis" />
          </label>
          <label className="field">
            <span>Datum</span>
            <input className="input" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value, startDaysManual: null })} />
          </label>

          {plan && (
            <>
              <div className="tile">
                <div className="between">
                  <span className="muted">Priorität laut App</span>
                  <span className="big-num">{plan.priority.auto}</span>
                </div>
                <p className="hint" style={{ marginTop: 4 }}>
                  Basis 1, Gewichtung +{plan.priority.breakdown.weighting}, Note +{formatNumber(plan.priority.breakdown.gradeBonus)}
                  {!plan.priority.breakdown.gradeKnown && ' (neutral, ohne Note)'},
                  Schwierigkeit +{formatNumber(plan.priority.breakdown.difficultyBonus)}
                  {plan.priority.breakdown.status === 'drop_q3' && ', Abwahl ab Q3 −2'}
                  {plan.priority.breakdown.status === 'dropped' && ', abgewählt: Minimum'}
                </p>
                {plan.priority.breakdown.statusIgnored && (
                  <p className="hint" style={{ color: 'var(--warn)', marginTop: 4 }}>
                    Leistungskurs oder Prüfungsfach: Der Abwahl-Status wird ignoriert.
                  </p>
                )}
              </div>
              <OverridableSlider
                label="Priorität"
                value={plan.priority.value}
                auto={plan.priority.auto}
                overridden={plan.priority.overridden}
                min={1}
                max={10}
                format={String}
                onChange={(v) => set({ priorityManual: v, totalHoursManual: null, startDaysManual: null })}
                onReset={() => set({ priorityManual: null })}
              />
              <OverridableSlider
                label="Gesamtzeit"
                value={plan.totalHours.value}
                auto={plan.totalHours.auto}
                overridden={plan.totalHours.overridden}
                min={0}
                max={40}
                step={0.5}
                format={formatHours}
                onChange={(v) => set({ totalHoursManual: v })}
                onReset={() => set({ totalHoursManual: null })}
                autoNote={plan.hasPlan ? 'Vorschlag aus der Priorität.' : 'Fach abgewählt, kein Lernplan.'}
              />
              <OverridableSlider
                label="Start vor der Klausur"
                value={plan.startDays.value}
                auto={plan.startDays.auto}
                overridden={plan.startDays.overridden}
                min={1}
                max={maxStart}
                format={formatDays}
                onChange={(v) => set({ startDaysManual: v })}
                onReset={() => set({ startDaysManual: null })}
                autoNote={subject?.type === 'writing' ? 'Vorschlag, mit 3 Tagen Puffer für Feedback.' : 'Vorschlag aus der Priorität.'}
              />
            </>
          )}
        </div>

        {!plan && subject && !validDate && (
          <div className="card stack">
            <p className="notice">Wähle ein Datum, dann rechnet die App den Plan.</p>
          </div>
        )}
        {plan && (
          <div className="stack">
            <div className="card stack" style={{ gap: 16 }}>
              <h2>Rahmen</h2>
              <div className="field">
                <span>Lernfreie Tage pro Woche</span>
                <Segmented<0 | 1 | 2>
                  label="Lernfreie Tage pro Woche"
                  value={state.plan.freeDaysPerWeek}
                  onChange={(freeDaysPerWeek) => dispatch({ type: 'setPlan', plan: { freeDaysPerWeek } })}
                  options={[
                    { value: 0, label: 'Keiner' },
                    { value: 1, label: 'Einer' },
                    { value: 2, label: 'Zwei' },
                  ]}
                />
              </div>
              <PlainSlider
                label="Tageslimit"
                value={state.plan.dailyLimitMin}
                min={60}
                max={240}
                step={15}
                format={formatMinutes}
                onChange={(dailyLimitMin) => dispatch({ type: 'setPlan', plan: { dailyLimitMin } })}
              />
              <p className="hint">Gilt für alle Klausuren.</p>
            </div>

            <div className="card stack">
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="tile">
                  <p className="muted">Lerntage</p>
                  <p className="big-num">{plan.hasPlan ? plan.studyDays : '–'}</p>
                </div>
                <div className="tile">
                  <p className="muted">Pro Lerntag</p>
                  <p className="big-num">{plan.hasPlan ? formatMinutes(plan.minutesPerStudyDay) : '–'}</p>
                </div>
              </div>
              {plan.overLimit && (
                <p className="notice">
                  {plan.notEnoughTime
                    ? `Das sind ${formatMinutes(plan.minutesPerStudyDay)} pro Lerntag, über deinem Limit. Bis zur Klausur reicht die Zeit nicht ganz. Passe Gesamtzeit oder Limit an.`
                    : `Das sind ${formatMinutes(plan.minutesPerStudyDay)} pro Lerntag, über deinem Limit. Besser spätestens ${formatDays(plan.latestStart)} vorher starten.`}
                </p>
              )}
              {plan.hasPlan && plan.totalHours.value > 0 && (
                <p className="muted">Wiederholen etwa alle {formatDays(plan.reviewGap)}. Grobe Näherung aus Spacing-Studien.</p>
              )}
              <Timeline days={plan.timeline} />
            </div>
            {existing && <Topics examId={existing.id} />}
          </div>
        )}
      </div>

      <div className="between">
        {existing ? (
          <button
            type="button"
            className="btn btn-ghost btn-danger"
            onClick={() => {
              if (confirm('Klausur löschen?')) {
                dispatch({ type: 'deleteExam', id: draft.id });
                navigate('/plan');
              }
            }}
          >
            Löschen
          </button>
        ) : (
          <span />
        )}
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {existing && existing.date <= toIsoDate(new Date()) && access.can('correct') && (
            <Link className="btn" to={`/korrektur/neu?klausur=${existing.id}`}>
              Korrigieren lassen
            </Link>
          )}
          <Link className="btn" to="/plan">
            Abbrechen
          </Link>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!validDate || !draft.subjectId}>
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
