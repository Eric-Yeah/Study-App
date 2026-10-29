import { moduleWorkloadHours, semesterNumber, subjectScope, type Subject } from '@study/core';
import { ChevronDown, Plus } from 'lucide-react';
import { useState } from 'react';
import { ModuleEditor } from '../components/study/ModuleEditor';
import { formatHours, uid } from '../lib/format';
import { SUBJECT_COLORS } from '../state/defaults';
import { useStore } from '../state/store';

/** Module im Studium (Bereich Studium): ECTS, Fachsemester, Pflicht oder Wahl. Ein Modul ist technisch ein Fach mit scope „uni“. */
export function Modules() {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const current = semesterNumber(state.study);
  const modules = state.subjects
    .filter((s) => subjectScope(s) === 'uni')
    .slice()
    .sort((a, b) => (a.semester ?? 999) - (b.semester ?? 999) || a.name.localeCompare(b.name, 'de'));
  const totalEcts = modules.reduce((s, m) => s + (m.ects ?? 0), 0);
  const thisSemester = modules.filter((m) => m.semester === current);

  const add = () => {
    const s: Subject = {
      id: uid(),
      name: 'Neues Modul',
      color: SUBJECT_COLORS[modules.length % SUBJECT_COLORS.length],
      isAdvanced: false,
      isExamSubject: false,
      status: 'active',
      type: 'knowledge',
      points: null,
      difficulty: 3,
      language: 'de',
      scope: 'uni',
      ects: 6,
      semester: current,
      required: true,
      lecturer: '',
    };
    dispatch({ type: 'upsertSubject', subject: s });
    setOpen(s.id);
  };

  const groups = [...new Set(modules.map((m) => m.semester))];

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Module</h1>
          <p className="sub">
            {modules.length} Module · {totalEcts} ECTS gesamt · {thisSemester.reduce((s, m) => s + (m.ects ?? 0), 0)} ECTS im {current}. Fachsemester
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={add}>
          <Plus size={18} aria-hidden="true" /> Modul hinzufügen
        </button>
      </div>
      {modules.length === 0 && <p className="notice">Noch keine Module. Lege die Module deines Semesters an, dann plant die App die Lernzeit für die Prüfungen aus den ECTS.</p>}
      {groups.map((semester) => (
        <div key={semester ?? 'none'} className="stack">
          <h2>{semester ? `${semester}. Fachsemester${semester === current ? ' (jetzt)' : ''}` : 'Ohne Semester'}</h2>
          {modules
            .filter((m) => m.semester === semester)
            .map((m) => {
              const isOpen = open === m.id;
              return (
                <div key={m.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : m.id)}
                    aria-expanded={isOpen}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 16, border: 0, background: 'none', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <span className="dot" style={{ background: m.color, width: 12, height: 12 }} />
                    <span style={{ flex: 1 }}>
                      <strong>{m.name}</strong>
                      <br />
                      <span className="hint">
                        {[m.required === false ? 'Wahlmodul' : 'Pflichtmodul', m.ects ? `ca. ${formatHours(moduleWorkloadHours(m.ects))} Arbeit` : null, m.lecturer || null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="big-num" style={{ fontSize: 22 }} aria-label={`${m.ects ?? 0} ECTS`}>
                      {m.ects ?? '–'}
                      <span className="hint"> ECTS</span>
                    </span>
                    <ChevronDown size={18} aria-hidden="true" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} />
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                      <ModuleEditor subject={m} onChange={(subject) => dispatch({ type: 'upsertSubject', subject })} />
                      <button
                        type="button"
                        className="btn btn-ghost btn-danger"
                        style={{ marginTop: 12 }}
                        onClick={() => {
                          if (confirm(`${m.name} mit allen Prüfungen und Ergebnissen löschen?`)) dispatch({ type: 'deleteSubject', id: m.id });
                        }}
                      >
                        Modul löschen
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
