import { CONFIG, CATEGORY_LABEL, categoryFor, computeAbitur, emptyPlan, suggestPicks, type AbiturPlan, type Check } from '@study/core';
import { AlertTriangle, ArrowLeft, Check as CheckIcon, GraduationCap, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatNumber } from '../lib/format';
import { useStore } from '../state/store';

const A = CONFIG.abitur;
const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];

const clampPoints = (raw: string): number | null => {
  const t = raw.replace(/\D/g, '').slice(0, 2);
  if (t === '') return null;
  return Math.min(15, Number(t));
};

function CheckRow({ c }: { c: Check }) {
  const Icon = c.status === 'ok' ? CheckIcon : c.status === 'fail' ? X : AlertTriangle;
  return (
    <li className={`abi-check abi-${c.status}`}>
      <Icon size={16} aria-hidden="true" />
      <span>
        {c.text}
        {c.predicted && <span className="hint"> (mit Prognose)</span>}
      </span>
    </li>
  );
}

/** Abiturrechner Hessen: Block I, Block II, Abiturnote und Prüfung der Einbringung. Eingaben liegen pro Konto in Supabase. */
export function Abitur() {
  const { state, dispatch } = useStore();
  const stored = state.abiturPlan;
  const [plan, setPlan] = useState<AbiturPlan>(stored);
  const baseRef = useRef(JSON.stringify(stored));

  // Änderungen von einem anderen Gerät übernehmen, solange hier nichts ungespeichert ist
  useEffect(() => {
    const incoming = JSON.stringify(stored);
    setPlan((cur) => (JSON.stringify(cur) === baseRef.current ? stored : cur));
    baseRef.current = incoming;
  }, [stored]);

  // Gespeichert wird kurz nach der letzten Eingabe
  useEffect(() => {
    const json = JSON.stringify(plan);
    if (json === baseRef.current) return;
    const t = window.setTimeout(() => {
      baseRef.current = json;
      dispatch({ type: 'setAbiturPlan', plan });
    }, 700);
    return () => window.clearTimeout(t);
  }, [plan, dispatch]);

  const subjects = state.subjects;
  const result = useMemo(() => computeAbitur(subjects, plan), [subjects, plan]);
  const byId = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const setCourse = (id: string, q: number, value: number | null) =>
    setPlan((p) => {
      const row = [...(p.courses[id] ?? Array<number | null>(A.quarters).fill(null))];
      row[q] = value;
      return { ...p, courses: { ...p.courses, [id]: row } };
    });
  const setPick = (id: string, q: number, on: boolean) =>
    setPlan((p) => {
      const row = [...(p.picks[id] ?? Array<boolean>(A.quarters).fill(false))];
      row[q] = on;
      return { ...p, picks: { ...p.picks, [id]: row } };
    });
  const setExamSubject = (i: number, id: string) => setPlan((p) => ({ ...p, examSubjects: p.examSubjects.map((x, k) => (k === i ? id || null : x)) }));
  const setExamPoints = (i: number, v: number | null) => setPlan((p) => ({ ...p, examPoints: p.examPoints.map((x, k) => (k === i ? v : x)) }));

  if (subjects.length === 0) {
    return (
      <div className="card stack">
        <p className="muted">Lege zuerst unter Fächer deine Fächer an, markiere die Leistungskurse und Prüfungsfächer.</p>
        <Link className="btn" to="/faecher">
          Zu den Fächern
        </Link>
      </div>
    );
  }

  const fails = result.checks.filter((c) => c.status === 'fail');
  const warns = result.checks.filter((c) => c.status === 'warn');
  const ordered = [...fails, ...warns, ...result.checks.filter((c) => c.status === 'ok')];
  const lkRows = subjects.filter((s) => s.isAdvanced);
  const gkRows = subjects.filter((s) => !s.isAdvanced);
  const gradeText = result.grade !== null ? formatNumber(result.grade, 1) : null;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Abiturrechner</h1>
          <p className="sub">Hessen, Gesamtqualifikation nach der OAVO (Fassung 2025): Block I aus den Kursen der Q-Phase, Block II aus den Prüfungen.</p>
        </div>
        <Link className="btn" to="/faecher">
          <ArrowLeft size={16} aria-hidden="true" /> Fächer
        </Link>
      </div>

      <div className="card stack abi-result">
        <div className="abi-grade-row">
          <div>
            <span className="hint">Abiturnote {result.predictedCourses > 0 ? '(Prognose)' : ''}</span>
            <div className="abi-grade">{gradeText ?? '–'}</div>
          </div>
          <div className="abi-points">
            <strong>{result.total}</strong>
            <span className="hint"> von {A.totalMax} Punkten</span>
            <div className="hint">
              Block I {result.blockI} · Block II {result.blockII}
            </div>
          </div>
        </div>
        <div className="bar" aria-hidden="true">
          <i style={{ width: `${Math.min(100, (result.total / A.totalMax) * 100)}%` }} />
        </div>
        {result.gkCount < A.gkRequired && (
          <p className="notice">
            Erst {result.gkCount} von {A.gkRequired} Grundkursen gewählt. Wähle die übrigen unter Block I, dann stimmt die Note.
          </p>
        )}
        {gradeText === null && <p className="notice">Unter {A.totalMin} Punkten ist die Abiturprüfung nicht bestanden.</p>}
        {result.nextGrade && (
          <p className="hint">
            Bis {formatNumber(result.nextGrade.grade, 1)} fehlen {result.nextGrade.missing} {result.nextGrade.missing === 1 ? 'Punkt' : 'Punkte'}.
          </p>
        )}
        <p className="hint">
          {fails.length > 0 ? `${fails.length} Regel${fails.length === 1 ? '' : 'n'} nicht erfüllt` : warns.length > 0 ? `${warns.length} Hinweis${warns.length === 1 ? '' : 'e'} offen` : 'Alle Regeln erfüllt'}
          {result.predictedCourses > 0 ? ` · ${result.predictedCourses} Kurse und Prüfungen sind Prognosen (aus deinen Noten)` : ''}.
        </p>
      </div>

      <section className="stack" style={{ gap: 8 }}>
        <h2 className="section-head">Block II: Prüfungen</h2>
        <div className="card stack">
          <p className="hint">Prüfungsfach 1 und 2 sind die Leistungskurse, 3 ist schriftlich, 4 und 5 mündlich, Präsentation oder besondere Lernleistung. Ergebnis in Punkten, vierfach gezählt.</p>
          <ul className="abi-exams">
            {result.exams.map((e, i) => (
              <li key={e.slot} className="abi-exam">
                <span className="abi-exam-nr">{e.slot}</span>
                <select
                  className="input"
                  aria-label={`Prüfungsfach ${e.slot}`}
                  value={plan.examSubjects[i] ?? e.subjectId ?? ''}
                  onChange={(ev) => setExamSubject(i, ev.target.value)}
                >
                  <option value="">Kein Fach</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.isAdvanced ? ' (LK)' : ''}
                    </option>
                  ))}
                </select>
                <input
                  className="input abi-pts"
                  inputMode="numeric"
                  aria-label={`Punkte Prüfung ${e.slot}`}
                  placeholder={e.subjectId ? String(e.points ?? '') : ''}
                  value={plan.examPoints[i] ?? ''}
                  disabled={!e.subjectId}
                  onChange={(ev) => setExamPoints(i, clampPoints(ev.target.value))}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <div className="between" style={{ gap: 8, flexWrap: 'wrap' }}>
          <h2 className="section-head">Block I: Kurse</h2>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => setPlan((p) => ({ ...p, picks: suggestPicks(subjects, p) }))}>
              <Sparkles size={16} aria-hidden="true" /> Beste Auswahl vorschlagen
            </button>
            <button type="button" className="btn" onClick={() => setPlan((p) => ({ ...p, picks: {} }))}>
              Auswahl leeren
            </button>
          </div>
        </div>
        <div className="card stack">
          <p className="hint">
            Trage die Punkte jedes Kurses ein (0 bis 15). Leere Felder rechnet die App als Prognose aus deinem Schnitt im Fach. Leistungskurse und die Grundkurse deiner Prüfungsfächer zählen immer, dazu wählst du freie Grundkurse. Gewählt: {result.gkCount} von {A.gkRequired} Grundkursen.
          </p>
          {[...lkRows, ...gkRows].map((s) => {
            const mine = result.courses.filter((c) => c.subjectId === s.id);
            return (
              <div key={s.id} className="abi-subject">
                <div className="between" style={{ gap: 8 }}>
                  <strong className="abi-name">
                    <i className="dot" style={{ background: s.color }} /> {s.name}
                  </strong>
                  <span className="pill">{s.isAdvanced ? 'Leistungskurs, zweifach' : mine.some((c) => c.forced) ? 'Prüfungsfach' : CATEGORY_LABEL[categoryFor(s.name)]}</span>
                </div>
                <div className="abi-cells">
                  {mine.map((c) => (
                    <div key={c.q} className={`abi-cell${c.included ? ' on' : ''}`}>
                      <span className="hint">{QUARTER_LABELS[c.q]}</span>
                      {c.available ? (
                        <>
                          <input
                            className="input abi-pts"
                            inputMode="numeric"
                            aria-label={`${s.name} ${QUARTER_LABELS[c.q]} Punkte`}
                            placeholder={c.points !== null ? String(c.points) : ''}
                            value={c.entered ?? ''}
                            onChange={(ev) => setCourse(s.id, c.q, clampPoints(ev.target.value))}
                          />
                          <label className="abi-pick">
                            <input
                              type="checkbox"
                              checked={c.included}
                              disabled={c.forced}
                              onChange={(ev) => setPick(s.id, c.q, ev.target.checked)}
                              aria-label={`${s.name} ${QUARTER_LABELS[c.q]} einbringen`}
                            />
                            <span className="hint">{c.forced ? 'Pflicht' : 'einbringen'}</span>
                          </label>
                        </>
                      ) : (
                        <span className="hint">abgewählt</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h2 className="section-head">Regeln</h2>
        <div className="card stack">
          <ul className="abi-checks">
            {ordered.map((c) => (
              <CheckRow key={c.id} c={c} />
            ))}
          </ul>
        </div>
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h2 className="section-head">Annahme</h2>
        <div className="card stack">
          <label className="field">
            <span>Punkte für Kurse ohne Eintrag, wenn am Fach keine Note steht</span>
            <input
              className="input abi-pts"
              inputMode="numeric"
              value={plan.assumption}
              onChange={(ev) => setPlan((p) => ({ ...p, assumption: clampPoints(ev.target.value) ?? A.assumption }))}
            />
          </label>
          <p className="hint">
            <GraduationCap size={14} aria-hidden="true" /> Der Rechner folgt der OAVO (Fassung 2025, §§ 24 und 26) und den Schulinformationen 2026. Die Notenumrechnung ist die der Kultusministerkonferenz (823 Punkte sind 1,0, 300 Punkte sind 4,0). Er ersetzt nicht die Beratung durch deine Studienleitung, besonders bei Fremdsprachen, die du neu begonnen hast, oder besonderen Lernleistungen.
          </p>
        </div>
      </section>
    </div>
  );
}
