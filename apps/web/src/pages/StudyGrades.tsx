import {
  CONFIG,
  attemptsLeft,
  averageByTerm,
  countedResults,
  formatGrade,
  gradeLabel,
  isPassed,
  neededGrade,
  parseGradeInput,
  roundAverage,
  studyProgress,
  termLabel,
  toIsoDate,
  weightedAverage,
  type ModuleResult,
} from '@study/core';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ResultForm } from '../components/study/ResultForm';
import { formatDateShort, formatNumber } from '../lib/format';
import { useStore } from '../state/store';

const PACE_TEXT = {
  ahead: 'Du liegst vor dem Soll.',
  ontrack: 'Du liegst im Soll.',
  behind: 'Du liegst hinter dem Soll.',
} as const;

/** „Was brauche ich?“ im Studium: Welche Note braucht die nächste Prüfung für einen Zielschnitt? */
function NeededCalc({ results }: { results: ModuleResult[] }) {
  const [target, setTarget] = useState('2,0');
  const [ects, setEcts] = useState(6);
  const t = parseGradeInput(target);
  const need = t === null ? null : neededGrade(results, t, ects);
  const text =
    need === null
      ? 'Gib einen Zielschnitt zwischen 1,0 und 5,0 ein.'
      : need.kind === 'sure'
        ? 'Du erreichst den Zielschnitt auch mit der schlechtesten bestandenen Note (4,0).'
        : need.kind === 'impossible'
          ? 'Der Zielschnitt ist mit dieser Prüfung allein nicht mehr zu erreichen, selbst mit einer 1,0.'
          : need.kind === 'grade'
            ? `Du brauchst mindestens eine ${formatGrade(need.grade)} (${gradeLabel(need.grade)}).`
            : 'Trag zuerst Ergebnisse ein.';
  return (
    <div className="card stack" style={{ gap: 12 }}>
      <h2>Was brauche ich?</h2>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label className="field">
          <span>Zielschnitt</span>
          <input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Zielschnitt" />
        </label>
        <label className="field">
          <span>ECTS der nächsten Prüfung</span>
          <input className="input" type="number" inputMode="decimal" min={0.5} max={60} step={0.5} value={ects} onChange={(e) => setEcts(Math.max(0, Number(e.target.value) || 0))} />
        </label>
      </div>
      <p>{text}</p>
      <p className="hint">Gerechnet mit dem genauen Schnitt. Die Rundung und welche Leistungen zählen, regelt deine Prüfungsordnung.</p>
    </div>
  );
}

/** Studium → Noten: Fortschritt in ECTS, Schnitt nach ECTS, Ergebnisse je Semester, Versuche. Die Schulnoten sind davon getrennt. */
export function StudyGrades() {
  const { state, dispatch } = useStore();
  const today = new Date();
  const todayIso = toIsoDate(today);
  const modules = state.subjects.filter((s) => s.scope === 'uni');
  const [form, setForm] = useState<{ initial?: Partial<ModuleResult> } | null>(null);

  const progress = studyProgress(state.results, state.study, today);
  const avg = weightedAverage(state.results);
  const terms = averageByTerm(state.results);
  const counted = new Set(countedResults(state.results).map((r) => r.id));
  const moduleName = (id: string) => state.subjects.find((s) => s.id === id)?.name ?? 'Modul';
  const pendingExams = state.exams.filter((e) => e.date <= todayIso && (e.graded ?? true) && !state.results.some((r) => r.examId === e.id));
  const failedModules = modules.filter((m) => state.results.some((r) => r.subjectId === m.id && !isPassed(r)));

  const byTerm = [...state.results].sort((a, b) => b.date.localeCompare(a.date));
  const termOrder = [...new Set(byTerm.map((r) => termLabel(r.date)))];

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Studium</h1>
          <p className="sub">
            {state.study.program || 'Dein Studium'} · {progress.semester}. Fachsemester von {state.study.regularSemesters} in der Regelstudienzeit
          </p>
        </div>
        {modules.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => setForm({})}>
            <Plus size={18} aria-hidden="true" /> Ergebnis eintragen
          </button>
        )}
      </div>

      {modules.length === 0 && (
        <p className="notice">
          Lege zuerst Module an, dann kannst du Ergebnisse eintragen. <Link to="/faecher">Zu den Modulen</Link>
        </p>
      )}

      <div className="grid cols-2 match">
        <div className="card stack" style={{ gap: 10 }}>
          <div className="between">
            <h2>Fortschritt</h2>
            <strong>
              {formatNumber(progress.earned, 1)} / {progress.goal} ECTS
            </strong>
          </div>
          <div className="bar">
            <i style={{ width: `${progress.share * 100}%` }} />
          </div>
          <p className="hint">
            {PACE_TEXT[progress.pace]} Nach {progress.semester - 1} abgeschlossenen Semestern sind rund {progress.expected} ECTS üblich ({CONFIG.study.ectsPerSemester} je Semester), du hast {formatNumber(progress.earned, 1)}.
            {progress.forecastSemesters !== null ? ` Im bisherigen Tempo fehlen noch etwa ${progress.forecastSemesters} Semester.` : progress.semester > 1 && progress.earned < progress.goal ? ' Für eine Prognose bis zum Abschluss reichen die bisherigen Ergebnisse noch nicht.' : ''}
          </p>
          {progress.failed > 0 && <p className="notice">{progress.failed === 1 ? 'Eine Prüfung ist' : `${progress.failed} Prüfungen sind`} noch nicht bestanden.</p>}
        </div>

        <div className="card stack" style={{ gap: 8 }}>
          <h2>Durchschnitt</h2>
          {avg.value === null ? (
            <p className="muted">Noch keine benoteten Ergebnisse.</p>
          ) : (
            <>
              <p className="big-num" style={{ fontSize: 40 }}>
                {formatGrade(avg.rounded ?? avg.value)}
              </p>
              <p className="muted">
                {gradeLabel(avg.value)} · aus {avg.count} {avg.count === 1 ? 'Ergebnis' : 'Ergebnissen'}, gewichtet nach ECTS
              </p>
              <p className="hint">
                Genau: {formatGrade(avg.value, 2)}. Die App {CONFIG.study.averageRounding === 'truncate' ? 'streicht weitere Stellen ohne zu runden' : 'rundet auf eine Stelle'} ({formatGrade(roundAverage(avg.value, 1, 'round'))} gerundet). Was in deiner Prüfungsordnung gilt, steht dort.
              </p>
            </>
          )}
          {terms.length > 1 && (
            <div className="stack" style={{ gap: 4, marginTop: 4 }}>
              {terms.map((t) => (
                <div key={t.term} className="between">
                  <span className="muted">{t.term}</span>
                  <span>
                    {t.average === null ? '–' : formatGrade(roundAverage(t.average))} · {formatNumber(t.ects, 1)} ECTS
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {form && (
        <ResultForm
          modules={modules}
          initial={form.initial}
          onCancel={() => setForm(null)}
          onSave={(result) => {
            dispatch({ type: 'upsertResult', result });
            setForm(null);
          }}
        />
      )}

      {pendingExams.length > 0 && !form && (
        <div className="card stack" style={{ gap: 8 }}>
          <h2>Prüfungen ohne Ergebnis</h2>
          <p className="hint">Diese Prüfungen liegen hinter dir. Trag das Ergebnis ein, sobald es da ist.</p>
          {pendingExams.slice(0, 5).map((e) => (
            <div key={e.id} className="between">
              <span>
                {e.title || moduleName(e.subjectId)} <span className="hint">· {moduleName(e.subjectId)} · {formatDateShort(e.date)}</span>
              </span>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setForm({ initial: { subjectId: e.subjectId, examId: e.id, title: e.title || 'Klausur', attempt: e.attempt ?? 1, date: e.date, ects: modules.find((m) => m.id === e.subjectId)?.ects ?? undefined } })
                }
              >
                Eintragen
              </button>
            </div>
          ))}
        </div>
      )}

      {byTerm.length > 0 && (
        <div className="stack">
          {termOrder.map((term) => (
            <div key={term} className="card">
              <h2 style={{ marginBottom: 8 }}>{term}</h2>
              {byTerm
                .filter((r) => termLabel(r.date) === term)
                .map((r) => (
                  <div key={r.id} className="grade-entry" style={{ opacity: counted.has(r.id) ? 1 : 0.6 }}>
                    <span className="grade-pts" aria-label={r.grade !== null ? `Note ${formatGrade(r.grade)}` : isPassed(r) ? 'bestanden' : 'nicht bestanden'}>
                      {r.grade !== null ? formatGrade(r.grade) : isPassed(r) ? '✓' : '✗'}
                    </span>
                    <span style={{ flex: 1 }}>
                      <strong>{moduleName(r.subjectId)}</strong> <span className="hint">· {r.title}</span>
                      <br />
                      <span className="hint">
                        {formatDateShort(r.date)} · {formatNumber(r.ects, 1)} ECTS · {r.attempt}. Versuch
                        {!isPassed(r) && ' · nicht bestanden'}
                        {isPassed(r) && !counted.has(r.id) && ' · ersetzt durch einen späteren Versuch'}
                      </span>
                    </span>
                    <button type="button" className="btn btn-ghost btn-icon" aria-label="Ergebnis ändern" onClick={() => setForm({ initial: r })}>
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label="Ergebnis löschen"
                      onClick={() => {
                        if (confirm('Ergebnis löschen?')) dispatch({ type: 'deleteResult', id: r.id });
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}

      {failedModules.length > 0 && (
        <div className="card stack" style={{ gap: 8 }}>
          <h2>Versuche</h2>
          {failedModules.map((m) => {
            const own = state.results.filter((r) => r.subjectId === m.id);
            const left = attemptsLeft(own);
            return (
              <p key={m.id}>
                <strong>{m.name}</strong>: {left.passed ? 'inzwischen bestanden' : left.left > 0 ? `noch ${left.left} ${left.left === 1 ? 'Versuch' : 'Versuche'} (von ${CONFIG.study.maxAttempts})` : 'keine Versuche mehr übrig laut Standardregel'}
              </p>
            );
          })}
          <p className="hint">Freiversuche und die Zahl der Versuche regelt deine Prüfungsordnung. Zähl im Zweifel dort nach.</p>
        </div>
      )}

      {state.results.length > 0 && <NeededCalc results={state.results} />}
    </div>
  );
}
