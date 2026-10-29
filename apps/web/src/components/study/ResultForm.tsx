import { CONFIG, formatGrade, type ModuleResult, type Subject } from '@study/core';
import { useState } from 'react';
import { toIsoDate } from '@study/core';
import { uid } from '../../lib/format';

type Mode = 'grade' | 'passed' | 'failed';

/** Ein Ergebnis eintragen oder ändern: Note 1,0 bis 5,0 oder nur bestanden, Versuch, ECTS und Gewicht. */
export function ResultForm({
  modules,
  initial,
  onSave,
  onCancel,
}: {
  modules: Subject[];
  initial?: Partial<ModuleResult>;
  onSave: (r: ModuleResult) => void;
  onCancel: () => void;
}) {
  const first = modules.find((m) => m.id === initial?.subjectId) ?? modules[0];
  const [subjectId, setSubjectId] = useState(first?.id ?? '');
  const [title, setTitle] = useState(initial?.title ?? 'Klausur');
  const [mode, setMode] = useState<Mode>(initial?.grade === null && initial?.passed === false ? 'failed' : initial?.grade === null && initial?.passed === true ? 'passed' : 'grade');
  const [grade, setGrade] = useState<number>(initial?.grade ?? 2.0);
  const [attempt, setAttempt] = useState(initial?.attempt ?? 1);
  const [ects, setEcts] = useState<number>(initial?.ects ?? first?.ects ?? 6);
  const [weight, setWeight] = useState<number | null>(initial?.weight !== undefined && initial.weight !== (initial.ects ?? 0) ? initial.weight : null);
  const [date, setDate] = useState(initial?.date ?? toIsoDate(new Date()));
  const valid = subjectId !== '' && title.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(date) && ects >= 0;

  const pickSubject = (id: string) => {
    setSubjectId(id);
    const m = modules.find((x) => x.id === id);
    if (m?.ects) setEcts(m.ects);
  };

  const save = () => {
    if (!valid) return;
    onSave({
      id: initial?.id ?? uid(),
      subjectId,
      examId: initial?.examId ?? null,
      grade: mode === 'grade' ? grade : null,
      passed: mode === 'grade' ? null : mode === 'passed',
      attempt,
      ects,
      weight: weight ?? ects,
      date,
      title: title.trim(),
    });
  };

  return (
    <form
      className="card stack"
      style={{ gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h2>{initial?.id ? 'Ergebnis ändern' : 'Ergebnis eintragen'}</h2>
      <label className="field">
        <span>Modul</span>
        <select className="input" value={subjectId} onChange={(e) => pickSubject(e.target.value)}>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Prüfung</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        <span className="hint">Bei einem weiteren Versuch denselben Namen nehmen, dann zählt nur der bestandene.</span>
      </label>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label className="field">
          <span>Ergebnis</span>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="grade">Note</option>
            <option value="passed">Bestanden (ohne Note)</option>
            <option value="failed">Nicht bestanden (ohne Note)</option>
          </select>
        </label>
        {mode === 'grade' && (
          <label className="field">
            <span>Note</span>
            <select className="input" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
              {CONFIG.study.gradeSteps.map((g) => (
                <option key={g} value={g}>
                  {formatGrade(g)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <label className="field">
          <span>Versuch</span>
          <select className="input" value={attempt} onChange={(e) => setAttempt(Number(e.target.value))}>
            {[1, 2, 3].map((a) => (
              <option key={a} value={a}>
                {a}.
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>ECTS</span>
          <input className="input" type="number" inputMode="decimal" min={0} max={60} step={0.5} value={ects} onChange={(e) => setEcts(Math.min(60, Math.max(0, Number(e.target.value) || 0)))} />
        </label>
        <label className="field">
          <span>Gewicht</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0}
            max={60}
            step={0.5}
            value={weight ?? ects}
            onChange={(e) => setWeight(e.target.value === '' ? null : Math.min(60, Math.max(0, Number(e.target.value) || 0)))}
          />
        </label>
      </div>
      <p className="hint">Das Gewicht im Durchschnitt ist meist die Zahl der ECTS. Manche Prüfungsordnungen gewichten anders, dann hier ändern.</p>
      <label className="field">
        <span>Datum</span>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary" disabled={!valid}>
          Speichern
        </button>
      </div>
    </form>
  );
}
