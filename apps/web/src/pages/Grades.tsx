import {
  CONFIG,
  QUARTERS,
  byDateDesc,
  clampShare,
  courseGrade,
  courseGradesForAbitur,
  currentPoints,
  defaultWeight,
  examsWithoutGrade,
  forSubject,
  groupOf,
  kindLabel,
  pointsLabel,
  pointsToDecimalGrade,
  quarterOverview,
  shareFor,
  toIsoDate,
  type GradeEntry,
  type Quarter,
  type SubjectRow,
} from '@study/core';
import { AlertTriangle, ArrowLeft, ChevronDown, GraduationCap, Minus, Pencil, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GradeForm, draftOf, emptyDraft, type GradeDraft } from '../components/grades/GradeForm';
import { NeededCalc } from '../components/grades/NeededCalc';
import { Segmented } from '../components/Segmented';
import { formatDateShort, formatNumber, uid } from '../lib/format';
import { useStore } from '../state/store';

const G = CONFIG.grades;

function TrendIcon({ trend }: { trend: SubjectRow['trend'] }) {
  if (trend === 'up') return <TrendingUp size={16} aria-label="Trend steigend" style={{ color: 'var(--ok)' }} />;
  if (trend === 'down') return <TrendingDown size={16} aria-label="Trend fallend" style={{ color: 'var(--danger)' }} />;
  if (trend === 'flat') return <Minus size={16} aria-label="Trend gleichbleibend" style={{ color: 'var(--ink-3)' }} />;
  return null;
}

/** Verhältnis Klausuren zu sonstigen Leistungen eines Fachs. Gespeichert wird kurz nach der letzten Änderung. */
function ShareControl({ subjectId }: { subjectId: string }) {
  const { state, dispatch } = useStore();
  const stored = shareFor(subjectId, state.gradeSettings);
  const [draft, setDraft] = useState<number | null>(null); // nur gesetzt, solange eine eigene Änderung noch nicht gespeichert ist
  const value = draft ?? stored;

  useEffect(() => {
    if (draft === null) return;
    const t = window.setTimeout(() => {
      dispatch({ type: 'setGradeSettings', settings: { ...state.gradeSettings, writtenShare: { ...state.gradeSettings.writtenShare, [subjectId]: clampShare(draft) } } });
      setDraft(null);
    }, 600);
    return () => window.clearTimeout(t);
  }, [draft, subjectId, state.gradeSettings, dispatch]);

  return (
    <div className="stack tile" style={{ gap: 8 }}>
      <div className="slider-row">
        <label htmlFor={`share-${subjectId}`}>Klausuren zu sonstigen Leistungen</label>
        <output htmlFor={`share-${subjectId}`}>
          {value} : {100 - value}
        </output>
        <input id={`share-${subjectId}`} type="range" min={0} max={100} step={G.shareStep} value={value} onChange={(e) => setDraft(clampShare(Number(e.target.value)))} />
      </div>
      <p className="hint">
        Wie die Kursnote entsteht, bestimmt die Lehrkraft. Stell hier das Verhältnis deines Kurses ein (Standard {G.writtenShare} : {100 - G.writtenShare}). Gibt es nur
        eine Gruppe, zählt allein sie.
      </p>
    </div>
  );
}

function EntryRow({ g, onEdit, onDelete }: { g: GradeEntry; onEdit: () => void; onDelete: () => void }) {
  return (
    <li className="grade-entry">
      <span className="grade-pts" aria-label={`${g.points} Punkte`}>
        {g.points}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <strong>{g.title || kindLabel(g.kind)}</strong>
        <br />
        <span className="hint">
          {formatDateShort(g.date)} · {g.title ? `${kindLabel(g.kind)} · ` : ''}
          {pointsLabel(g.points)}
          {g.weight !== defaultWeight(g.kind) && ` · Gewicht ${String(g.weight).replace('.', ',')}`}
        </span>
      </span>
      <button type="button" className="btn btn-ghost btn-icon" onClick={onEdit} aria-label={`${g.title || kindLabel(g.kind)} ändern`}>
        <Pencil size={16} aria-hidden="true" />
      </button>
      <button type="button" className="btn btn-ghost btn-icon btn-danger" onClick={onDelete} aria-label={`${g.title || kindLabel(g.kind)} löschen`}>
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

/** Noten: Einzelnoten (Klausuren, mündlich, Tests, Referate ...) je Fach und Halbjahr, daraus die Kursnote. */
export function Grades() {
  const { state, dispatch } = useStore();
  const today = toIsoDate(new Date());
  const stage = state.profile?.stage;
  const [quarter, setQuarter] = useState<Quarter>(() => (stage && (QUARTERS as readonly string[]).includes(stage) ? (stage as Quarter) : 'Q1'));
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ subjectId: string; draft: GradeDraft } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const overview = useMemo(() => quarterOverview(state.subjects, state.grades, state.gradeSettings, quarter), [state.subjects, state.grades, state.gradeSettings, quarter]);
  const subjectIds = useMemo(() => new Set(state.subjects.map((s) => s.id)), [state.subjects]);
  const pending = useMemo(
    () => examsWithoutGrade(state.exams, state.grades, today).filter((e) => subjectIds.has(e.subjectId)),
    [state.exams, state.grades, today, subjectIds],
  );
  const subjectName = (id: string) => state.subjects.find((s) => s.id === id)?.name ?? '';

  const save = (subjectId: string, d: GradeDraft) => {
    const existing = d.id ? state.grades.find((g) => g.id === d.id) : undefined;
    dispatch({
      type: 'upsertGrade',
      grade: { id: d.id ?? uid(), subjectId, quarter: existing?.quarter ?? quarter, date: d.date, kind: d.kind, title: d.title.trim(), points: d.points, weight: d.weight, examId: d.examId },
    });
    setEditing(null);
    setMessage(null);
  };

  const toAbitur = () => {
    const r = courseGradesForAbitur(state.subjects, state.grades, state.gradeSettings, state.abiturPlan);
    if (r.changed === 0) {
      setMessage('Der Abiturrechner hat schon alle diese Kursnoten.');
      return;
    }
    dispatch({ type: 'setAbiturPlan', plan: { ...state.abiturPlan, courses: r.courses } });
    setMessage(`${r.changed} Kursnote${r.changed === 1 ? '' : 'n'} in den Abiturrechner übernommen.`);
  };

  const avg = overview.average;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Noten</h1>
          <p className="sub">Klausuren, mündliche Mitarbeit, Tests und mehr. Daraus entsteht deine Kursnote je Halbjahr.</p>
        </div>
        <Link className="btn btn-ghost" to="/faecher">
          <ArrowLeft size={16} aria-hidden="true" /> Fächer
        </Link>
      </div>

      <Segmented<Quarter> label="Halbjahr" value={quarter} onChange={(q) => { setQuarter(q); setMessage(null); }} options={QUARTERS.map((q) => ({ value: q, label: q }))} />

      <div className="card stack" style={{ gap: 12 }}>
        <div className="between">
          <div>
            <span className="hint">Schnitt {quarter} (Leistungskurse doppelt)</span>
            <div className="big-num">{avg === null ? '–' : `${formatNumber(avg)} Punkte`}</div>
            {avg !== null && <span className="muted">Note ≈ {formatNumber(pointsToDecimalGrade(avg))} · {overview.graded} {overview.graded === 1 ? 'Fach' : 'Fächer'} mit Note</span>}
          </div>
          <button type="button" className="btn" onClick={toAbitur} disabled={overview.graded === 0 && state.grades.length === 0}>
            <GraduationCap size={18} aria-hidden="true" /> In den Abiturrechner übernehmen
          </button>
        </div>
        {overview.deficits > 0 && (
          <p className="notice">
            <AlertTriangle size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {overview.deficits} {overview.deficits === 1 ? 'Kurs' : 'Kurse'} unter {CONFIG.abitur.deficitBelow} Punkten. Im Abitur dürfen höchstens{' '}
            {CONFIG.abitur.deficitMax} eingebrachte Kurse darunter liegen.
          </p>
        )}
        {message && <p className="notice ok" role="status">{message}</p>}
        <p className="hint">Die Übernahme überschreibt die Kursnoten der Halbjahre, zu denen du hier Noten hast. Alles andere im Abiturrechner bleibt.</p>
      </div>

      {pending.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="section-head">Klausuren ohne Note</h2>
          {pending.map((e) => (
            <div key={e.id} className="card between" style={{ padding: 14 }}>
              <span>
                <strong>{e.title}</strong>
                <br />
                <span className="hint">
                  {subjectName(e.subjectId)} · {formatDateShort(e.date)}
                </span>
              </span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setOpen(e.subjectId);
                  setEditing({ subjectId: e.subjectId, draft: { ...emptyDraft(e.date), kind: 'exam', weight: defaultWeight('exam'), title: e.title, examId: e.id } });
                }}
              >
                <Plus size={16} aria-hidden="true" /> Note eintragen
              </button>
            </div>
          ))}
        </section>
      )}

      {state.subjects.length === 0 && <p className="muted">Lege zuerst unter Fächer deine Fächer an.</p>}

      <div className="stack">
        {overview.rows.map(({ subject: s, grade, trend, deficit }) => {
          const isOpen = open === s.id;
          const entries = byDateDesc(forSubject(state.grades, s.id, quarter));
          const share = shareFor(s.id, state.gradeSettings);
          const current = currentPoints(state.grades, s.id, state.gradeSettings, quarter);
          const editingHere = editing?.subjectId === s.id ? editing.draft : null;
          return (
            <div key={s.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : s.id)}
                aria-expanded={isOpen}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 16, border: 0, background: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}
              >
                <span className="dot" style={{ background: s.color, width: 12, height: 12 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{s.name}</strong>
                  {s.isAdvanced && <span className="hint"> · LK</span>}
                  <br />
                  <span className="hint">
                    {grade.points === null
                      ? 'Noch keine Note'
                      : [
                          grade.written !== null && `Klausuren Ø ${formatNumber(grade.written)}`,
                          grade.other !== null && `Sonstige Ø ${formatNumber(grade.other)}`,
                          `${grade.writtenCount + grade.otherCount} ${grade.writtenCount + grade.otherCount === 1 ? 'Note' : 'Noten'}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  </span>
                </span>
                <TrendIcon trend={trend} />
                <span style={{ textAlign: 'right' }}>
                  <span className="big-num" style={{ fontSize: 22, color: deficit ? 'var(--danger)' : undefined }} aria-label={grade.points === null ? 'keine Kursnote' : `Kursnote ${grade.points} Punkte`}>
                    {grade.points ?? '–'}
                  </span>
                  {grade.points !== null && (
                    <>
                      <br />
                      <span className="hint">{pointsLabel(grade.points)}</span>
                    </>
                  )}
                </span>
                <ChevronDown size={18} aria-hidden="true" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} />
              </button>

              {isOpen && (
                <div className="stack" style={{ padding: '16px', borderTop: '1px solid var(--line)', gap: 16 }}>
                  {grade.exact !== null && (
                    <p className="muted">
                      Kursnote {quarter}: {formatNumber(grade.exact, 2)} Punkte, gerundet {grade.points}.
                      {grade.writtenCount > 0 && grade.otherCount > 0 && ` Klausuren zählen ${share} %, sonstige Leistungen ${100 - share} %.`}
                      {grade.writtenCount > 0 && grade.otherCount === 0 && ' Bisher nur Klausuren, sie zählen allein.'}
                      {grade.writtenCount === 0 && grade.otherCount > 0 && ' Bisher nur sonstige Leistungen, sie zählen allein.'}
                    </p>
                  )}

                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }} aria-label="Kursnoten aller Halbjahre">
                    {QUARTERS.map((q) => {
                      const p = courseGrade(forSubject(state.grades, s.id, q), share).points;
                      return (
                        <span key={q} className="chip-static" style={q === quarter ? { fontWeight: 700 } : undefined}>
                          {q}: {p ?? '–'}
                        </span>
                      );
                    })}
                  </div>

                  {entries.length === 0 ? (
                    <p className="hint">In {quarter} ist noch nichts eingetragen.</p>
                  ) : (
                    <ul className="grade-list">
                      {(['written', 'other'] as const).map((group) => {
                        const list = entries.filter((g) => (groupOf(g.kind) === 'written') === (group === 'written'));
                        if (list.length === 0) return null;
                        return (
                          <li key={group} style={{ listStyle: 'none' }}>
                            <span className="hint">{group === 'written' ? 'Klausuren' : 'Sonstige Leistungen'}</span>
                            <ul className="grade-list">
                              {list.map((g) => (
                                <EntryRow
                                  key={g.id}
                                  g={g}
                                  onEdit={() => setEditing({ subjectId: s.id, draft: draftOf(g) })}
                                  onDelete={() => {
                                    if (confirm(`${g.title || kindLabel(g.kind)} (${g.points} Punkte) löschen?`)) dispatch({ type: 'deleteGrade', id: g.id });
                                  }}
                                />
                              ))}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {editingHere ? (
                    <GradeForm key={editingHere.id ?? 'new'} draft={editingHere} quarter={quarter} onSave={(d) => save(s.id, d)} onCancel={() => setEditing(null)} />
                  ) : (
                    <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing({ subjectId: s.id, draft: emptyDraft(today) })}>
                      <Plus size={18} aria-hidden="true" /> Note eintragen
                    </button>
                  )}

                  <ShareControl subjectId={s.id} />
                  <NeededCalc entries={forSubject(state.grades, s.id, quarter)} share={share} current={grade.points} />

                  {current && s.points !== current.points && (
                    <div className="tile stack" style={{ gap: 8 }}>
                      <span>
                        Die App schlägt als Notenstand des Fachs <strong>{current.points} Punkte</strong> vor ({current.quarter}).{' '}
                        {s.points === null ? 'Bisher steht dort keine Note.' : `Bisher stehen dort ${s.points} Punkte.`}
                      </span>
                      <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => dispatch({ type: 'upsertSubject', subject: { ...s, points: current.points } })}>
                        Als Notenstand übernehmen
                      </button>
                      <span className="hint">Der Notenstand fließt in die Priorität und damit in die Lernzeit ein.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
