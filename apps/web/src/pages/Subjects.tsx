import { LANGUAGE_LABELS, isLanguageSubject, priorityBreakdown, type Subject } from '@study/core';
import { ChevronDown, GraduationCap, ListChecks, NotebookPen, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { SubjectEditor } from '../components/SubjectEditor';
import { uid } from '../lib/format';
import { STATUS_LABELS, SUBJECT_COLORS, TYPE_LABELS } from '../state/defaults';
import { useStore } from '../state/store';

export function Subjects() {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const advanced = state.subjects.filter((s) => s.isAdvanced).length;
  const exam = state.subjects.filter((s) => s.isExamSubject).length;

  const add = () => {
    const s: Subject = {
      id: uid(),
      name: 'Neues Fach',
      color: SUBJECT_COLORS[state.subjects.length % SUBJECT_COLORS.length],
      isAdvanced: false,
      isExamSubject: false,
      status: 'active',
      type: 'knowledge',
      points: 9,
      difficulty: 3,
      language: 'de',
    };
    dispatch({ type: 'upsertSubject', subject: s });
    setOpen(s.id);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Fächer</h1>
          <p className="sub">
            {advanced} Leistungskurse · {exam} Prüfungsfächer
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/noten">
            <NotebookPen size={18} aria-hidden="true" /> Noten
          </Link>
          <Link className="btn" to="/abitur">
            <GraduationCap size={18} aria-hidden="true" /> Abiturrechner
          </Link>
          <button type="button" className="btn btn-primary" onClick={add}>
            <Plus size={18} aria-hidden="true" /> Fach hinzufügen
          </button>
        </div>
      </div>
      {(advanced > 2 || exam > 5) && (
        <p className="notice">In Hessen sind es zwei Leistungskurse und fünf Prüfungsfächer. Prüf deine Auswahl.</p>
      )}
      <div className="stack">
        {state.subjects.map((s) => {
          const p = priorityBreakdown(s);
          const isOpen = open === s.id;
          return (
            <div key={s.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : s.id)}
                aria-expanded={isOpen}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 16, border: 0, background: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <span className="dot" style={{ background: s.color, width: 12, height: 12 }} />
                <span style={{ flex: 1 }}>
                  <strong>{s.name}</strong>
                  <br />
                  <span className="hint">
                    {[s.isAdvanced && 'LK', s.isExamSubject && 'Prüfungsfach', TYPE_LABELS[s.type], s.language !== 'de' && (isLanguageSubject(s.name) ? LANGUAGE_LABELS[s.language] : `bilingual (${LANGUAGE_LABELS[s.language]})`), p.status !== 'active' && STATUS_LABELS[p.status]]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="big-num" style={{ fontSize: 22 }} aria-label={`Priorität ${p.auto}`}>
                  {p.auto}
                </span>
                <ChevronDown size={18} aria-hidden="true" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} />
              </button>
              {isOpen && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                  <SubjectEditor subject={s} onChange={(subject) => dispatch({ type: 'upsertSubject', subject })} />
                  <Link className="btn" style={{ marginTop: 12 }} to={`/korrektur/muster/${s.id}`}>
                    <ListChecks size={16} aria-hidden="true" /> Korrekturmuster
                  </Link>
                  <button
                    type="button"
                    className="btn btn-ghost btn-danger"
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      if (confirm(`${s.name} und alle zugehörigen Klausuren löschen?`)) dispatch({ type: 'deleteSubject', id: s.id });
                    }}
                  >
                    Fach löschen
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
