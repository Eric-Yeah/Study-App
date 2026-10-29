import { CONFIG, EXAM_KINDS, EXAM_KIND_LABELS, dateIsOwn, isWritingKind, planExam, toIsoDate, writingSteps, type Exam, type ExamKind } from '@study/core';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { OverridableSlider } from '../components/OverridableSlider';
import { PlainSlider } from '../components/PlainSlider';
import { Segmented } from '../components/Segmented';
import { Timeline } from '../components/Timeline';
import { Topics } from '../components/Topics';
import { formatDateShort, formatDays, formatHours, formatMinutes, formatNumber, uid } from '../lib/format';
import { useStore } from '../state/store';
import { useAccess } from '../lib/access';
import { useMode } from '../lib/mode';

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
}

export function ExamEditor() {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const access = useAccess();
  const { isUni, terms } = useMode();
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
        ...(isUni ? { kind: 'written' as ExamKind, attempt: 1, freeAttempt: false, registerBy: null, withdrawBy: null, graded: true } : {}),
      },
  );
  const subject = state.subjects.find((s) => s.id === draft.subjectId);
  // Ein geleertes Datumsfeld würde den ganzen Plan ungültig machen (NaN): dann gibt es keine Berechnung und kein Speichern
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.date);
  const plan = useMemo(() => (subject && validDate ? planExam(subject, draft, state.plan) : null), [subject, validDate, draft, state.plan]);

  if (selectable.length === 0) {
    return (
      <div className="card stack">
        <h1>Erst {isUni ? 'ein Modul' : 'ein Fach'} anlegen</h1>
        <p className="muted">
          {isUni ? 'Für eine Prüfung braucht die App ein Modul mit ECTS und Schwierigkeit.' : 'Für eine Klausur braucht die App ein Fach mit Notenstand und Schwierigkeit.'}
        </p>
        <Link className="btn btn-primary" to="/faecher">
          {isUni ? 'Zu den Modulen' : 'Zu den Fächern'}
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
          <h1>{existing ? `${terms.exam} bearbeiten` : terms.newExam}</h1>
          <p className="sub">Die App schlägt alles vor, du kannst jeden Wert überschreiben.</p>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card stack" style={{ gap: 18 }}>
          <label className="field">
            <span>{terms.subject}</span>
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
            <input className="input" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder={isUni ? 'Klausur Analysis I' : 'Klausur Analysis'} />
          </label>
          <label className="field">
            <span>Datum</span>
            <input className="input" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value, startDaysManual: null })} />
            {validDate && dateIsOwn(draft) && (
              <span className="hint">
                Im Lanis-Kalender steht der {formatDateShort(draft.lanisDate ?? '')}. Dein Datum hat Vorrang, Lanis überschreibt es nicht.{' '}
                <button type="button" className="link-btn" onClick={() => set({ date: draft.lanisDate ?? draft.date, startDaysManual: null })}>
                  Lanis-Datum nehmen
                </button>
              </span>
            )}
          </label>

          {isUni && (
            <div className="stack" style={{ gap: 14 }}>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label className="field">
                  <span>Art der Prüfung</span>
                  <select
                    className="input"
                    value={draft.kind ?? 'written'}
                    onChange={(e) => set({ kind: e.target.value as ExamKind, totalHoursManual: null, startDaysManual: null })}
                  >
                    {EXAM_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {EXAM_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Versuch</span>
                  <select className="input" value={draft.attempt ?? 1} onChange={(e) => set({ attempt: Number(e.target.value), totalHoursManual: null })}>
                    {Array.from({ length: CONFIG.study.maxAttempts }, (_, i) => i + 1).map((a) => (
                      <option key={a} value={a}>
                        {a}. Versuch
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="chip" aria-pressed={draft.freeAttempt === true} onClick={() => set({ freeAttempt: !draft.freeAttempt })}>
                  Freiversuch
                </button>
                <button type="button" className="chip" aria-pressed={draft.graded === false} onClick={() => set({ graded: draft.graded === false })}>
                  Unbenotet (Studienleistung)
                </button>
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label className="field">
                  <span>Anmeldung bis</span>
                  <input className="input" type="date" value={draft.registerBy ?? ''} onChange={(e) => set({ registerBy: e.target.value || null })} />
                </label>
                <label className="field">
                  <span>Abmeldung bis</span>
                  <input className="input" type="date" value={draft.withdrawBy ?? ''} onChange={(e) => set({ withdrawBy: e.target.value || null })} />
                </label>
              </div>
              <p className="hint">Anmelde- und Abmeldefristen erscheinen unter Plan → Fristen, die App erinnert dich rechtzeitig. Die genauen Termine und die Zahl der Versuche stehen in deiner Prüfungsordnung.</p>
            </div>
          )}

          {plan && (
            <>
              <div className="tile">
                <div className="between">
                  <span className="muted">Priorität laut App</span>
                  <span className="big-num">{plan.priority.auto}</span>
                </div>
                <p className="hint" style={{ marginTop: 4 }}>
                  {plan.source === 'module' ? (
                    <>
                      Basis {CONFIG.study.priority.base}, ECTS +{formatNumber(plan.priority.breakdown.weighting)}, Schwierigkeit +{formatNumber(plan.priority.breakdown.difficultyBonus)}
                      {plan.priority.breakdown.gradeBonus > 0 && `, weiterer Versuch +${plan.priority.breakdown.gradeBonus}`}
                    </>
                  ) : (
                    <>
                      Basis 1, Gewichtung +{plan.priority.breakdown.weighting}, Note +{formatNumber(plan.priority.breakdown.gradeBonus)}
                      {!plan.priority.breakdown.gradeKnown && ' (neutral, ohne Note)'},
                      Schwierigkeit +{formatNumber(plan.priority.breakdown.difficultyBonus)}
                      {plan.priority.breakdown.status === 'drop_q3' && ', Abwahl ab Q3 −2'}
                      {plan.priority.breakdown.status === 'dropped' && ', abgewählt: Minimum'}
                    </>
                  )}
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
                max={plan.source === 'module' ? CONFIG.study.capHours : 40}
                step={plan.source === 'module' ? 1 : 0.5}
                format={formatHours}
                onChange={(v) => set({ totalHoursManual: v })}
                onReset={() => set({ totalHoursManual: null })}
                autoNote={plan.source === 'module' ? `Vorschlag aus den ECTS (${CONFIG.study.hoursPerEcts} Stunden je ECTS, Anteil für die Prüfungsvorbereitung je nach Art).` : plan.hasPlan ? 'Vorschlag aus der Priorität.' : 'Fach abgewählt, kein Lernplan.'}
              />
              <OverridableSlider
                label={`Start vor der ${terms.exam}`}
                value={plan.startDays.value}
                auto={plan.startDays.auto}
                overridden={plan.startDays.overridden}
                min={1}
                max={maxStart}
                format={formatDays}
                onChange={(v) => set({ startDaysManual: v })}
                onReset={() => set({ startDaysManual: null })}
                autoNote={plan.source === 'module' ? 'Vorschlag aus den ECTS: mehr Leistungspunkte, längerer Vorlauf.' : subject?.type === 'writing' ? 'Vorschlag, mit 3 Tagen Puffer für Feedback.' : 'Vorschlag aus der Priorität.'}
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
                max={isUni ? 480 : 240}
                step={15}
                format={formatMinutes}
                onChange={(dailyLimitMin) => dispatch({ type: 'setPlan', plan: { dailyLimitMin } })}
              />
              <p className="hint">Gilt für alle {terms.exams}.</p>
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
                    ? `Das sind ${formatMinutes(plan.minutesPerStudyDay)} pro Lerntag, über deinem Limit. Bis zur ${terms.exam} reicht die Zeit nicht ganz. Passe Gesamtzeit oder Limit an.`
                    : `Das sind ${formatMinutes(plan.minutesPerStudyDay)} pro Lerntag, über deinem Limit. Besser spätestens ${formatDays(plan.latestStart)} vorher starten.`}
                </p>
              )}
              {plan.hasPlan && plan.totalHours.value > 0 && (
                <p className="muted">Wiederholen etwa alle {formatDays(plan.reviewGap)}. Grobe Näherung aus Spacing-Studien.</p>
              )}
              <Timeline days={plan.timeline} />
              {isUni && isWritingKind(draft.kind ?? 'written') && existing && <WritingPlan examId={existing.id} title={draft.title || subject?.name || 'Abgabe'} subjectId={draft.subjectId} due={draft.date} />}
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
              if (confirm(`${terms.exam} löschen?`)) {
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

/** Hausarbeit oder Projekt: Arbeitsschritte rückwärts aus der Abgabe als Aufgaben anlegen (nur auf Knopfdruck). */
function WritingPlan({ examId, title, subjectId, due }: { examId: string; title: string; subjectId: string; due: string }) {
  const { state, dispatch } = useStore();
  const today = toIsoDate(new Date());
  const steps = writingSteps(today, due);
  const already = state.tasks.some((t) => t.externalId === `steps:${examId}`);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <h2>Arbeitsschritte</h2>
      <ul className="stack" style={{ gap: 4, paddingLeft: 18 }}>
        {steps.map((st) => (
          <li key={st.title}>
            {st.title} <span className="hint">· bis {formatDateShort(st.due)}</span>
          </li>
        ))}
      </ul>
      {already ? (
        <p className="hint">Die Schritte stehen schon als Aufgaben.</p>
      ) : (
        <button
          type="button"
          className="btn"
          style={{ alignSelf: 'flex-start' }}
          disabled={due <= today}
          onClick={() =>
            steps.forEach((st, i) =>
              dispatch({ type: 'addTask', task: { id: uid(), title: `${title}: ${st.title}`, subjectId, minutes: null, date: st.due, done: false, externalId: i === 0 ? `steps:${examId}` : null } }),
            )
          }
        >
          Als Aufgaben anlegen
        </button>
      )}
    </div>
  );
}
