import { defaultLanguageFor, type Language, type Role, type Stage, type Subject } from '@study/core';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GradeField } from '../components/GradeField';
import { LanguageField } from '../components/LanguageField';
import { PlainSlider } from '../components/PlainSlider';
import { Segmented } from '../components/Segmented';
import { uid } from '../lib/format';
import { DEFAULT_SUBJECTS, SUBJECT_COLORS, TYPE_LABELS } from '../state/defaults';
import { useStore } from '../state/store';

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: 'student_school', label: 'Schüler/in am Gymnasium', hint: 'Mit Leistungskursen und Abitur-Logik' },
  { value: 'student_university', label: 'Student/in', hint: 'Abitur-Logik wird ausgeblendet (folgt später)' },
  { value: 'other', label: 'Andere', hint: 'Nur Plan und Timer' },
];
const STAGES: Stage[] = ['E', 'Q1', 'Q2', 'Q3', 'Q4'];
const MAX_ADVANCED = 2;
const MAX_EXAM = 5;

interface Draft {
  name: string;
  type: Subject['type'];
  isAdvanced: boolean;
  isExamSubject: boolean;
  points: number | null;
  difficulty: number;
  language: Language;
}

export function Onboarding() {
  const { dispatch } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role>('student_school');
  const [stage, setStage] = useState<Stage>('Q1');
  const [name, setName] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [custom, setCustom] = useState('');

  const selected = (n: string) => drafts.some((d) => d.name === n);
  const toggleSubject = (n: string, type: Subject['type']) =>
    setDrafts((list) =>
      selected(n)
        ? list.filter((d) => d.name !== n)
        : [
            ...list,
            {
              name: n,
              type,
              isAdvanced: false,
              isExamSubject: n === 'Deutsch' || n === 'Mathematik',
              points: 9,
              difficulty: 3,
              language: defaultLanguageFor(n),
            },
          ],
    );
  const patch = (n: string, p: Partial<Draft>) => setDrafts((list) => list.map((d) => (d.name === n ? { ...d, ...p } : d)));
  const advancedCount = drafts.filter((d) => d.isAdvanced).length;
  const examCount = drafts.filter((d) => d.isExamSubject).length;

  const finish = () => {
    const subjects: Subject[] = drafts.map((d, i) => ({
      id: uid(),
      name: d.name,
      color: SUBJECT_COLORS[i % SUBJECT_COLORS.length],
      isAdvanced: d.isAdvanced,
      isExamSubject: d.isExamSubject,
      status: 'active',
      type: d.type,
      points: d.points,
      difficulty: d.difficulty,
      language: d.language,
    }));
    dispatch({
      type: 'completeOnboarding',
      profile: { name: name.trim(), role, federalState: 'Hessen', stage },
      subjects,
    });
    navigate('/');
  };

  const canNext = step !== 2 || drafts.length > 0;
  const steps = ['Wer bist du?', 'Wo und wann?', 'Deine Fächer', 'Leistungskurse und Prüfungsfächer', 'Noten und Schwierigkeit'];

  return (
    <main className="main" style={{ maxWidth: 640 }}>
      <div className="stack" style={{ gap: 20 }}>
        <div className="steps" aria-hidden="true">
          {steps.map((_, i) => (
            <i key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
        <div>
          <p className="muted">
            Schritt {step + 1} von {steps.length}
          </p>
          <h1>{steps[step]}</h1>
        </div>

        {step === 0 && (
          <div className="stack">
            <label className="field">
              <span>Wie sollen wir dich nennen?</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dein Vorname" />
            </label>
            {ROLES.map((r) => (
              <button key={r.value} type="button" className="option-card" aria-pressed={role === r.value} onClick={() => setRole(r.value)}>
                <strong>{r.label}</strong>
                <br />
                <span className="hint">{r.hint}</span>
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="stack" style={{ gap: 18 }}>
            <label className="field">
              <span>Bundesland</span>
              <select className="input" value="Hessen" onChange={() => undefined}>
                <option value="Hessen">Hessen</option>
              </select>
              <span className="hint">Weitere Bundesländer folgen. Die Abitur-Regeln sind pro Land verschieden.</span>
            </label>
            <div className="field">
              <span>Stufe</span>
              <Segmented<Stage> label="Stufe" value={stage} onChange={setStage} options={STAGES.map((s) => ({ value: s, label: s }))} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {DEFAULT_SUBJECTS.map((s) => (
                <button key={s.name} type="button" className="chip" aria-pressed={selected(s.name)} onClick={() => toggleSubject(s.name, s.type)}>
                  {s.name}
                </button>
              ))}
              {drafts
                .filter((d) => !DEFAULT_SUBJECTS.some((s) => s.name === d.name))
                .map((d) => (
                  <button key={d.name} type="button" className="chip" aria-pressed onClick={() => toggleSubject(d.name, d.type)}>
                    {d.name}
                  </button>
                ))}
            </div>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                const n = custom.trim();
                if (n && !selected(n)) toggleSubject(n, 'knowledge');
                setCustom('');
              }}
            >
              <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Weiteres Fach" aria-label="Weiteres Fach" />
              <button className="btn" type="submit">
                Hinzufügen
              </button>
            </form>
            {drafts.length === 0 && <p className="hint">Wähle mindestens ein Fach.</p>}
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <p className="muted">
              Leistungskurse zählen doppelt, Prüfungsfächer vierfach. Die Prüfungsfächer kannst du später noch ändern, verbindlich
              wählst du sie zu Beginn von Q4.
            </p>
            <p className="hint">
              {advancedCount} von {MAX_ADVANCED} Leistungskursen · {examCount} von {MAX_EXAM} Prüfungsfächern
            </p>
            {drafts.map((d) => (
              <div key={d.name} className="card between" style={{ padding: 14, flexWrap: 'wrap' }}>
                <strong>{d.name}</strong>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={d.isAdvanced}
                    onClick={() => (d.isAdvanced || advancedCount < MAX_ADVANCED) && patch(d.name, { isAdvanced: !d.isAdvanced })}
                  >
                    Leistungskurs
                  </button>
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={d.isExamSubject}
                    onClick={() => (d.isExamSubject || examCount < MAX_EXAM) && patch(d.name, { isExamSubject: !d.isExamSubject })}
                  >
                    Prüfungsfach
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="stack">
            {drafts.map((d) => (
              <div key={d.name} className="card stack" style={{ gap: 14 }}>
                <strong>{d.name}</strong>
                <GradeField points={d.points} onChange={(points) => patch(d.name, { points })} />
                <LanguageField value={d.language} subjectName={d.name} onChange={(language) => patch(d.name, { language })} />
                <PlainSlider
                  label="Schwierigkeit"
                  value={d.difficulty}
                  min={1}
                  max={5}
                  format={(v) => `${v} von 5`}
                  onChange={(difficulty) => patch(d.name, { difficulty })}
                />
                <Segmented
                  label="Fachtyp"
                  value={d.type}
                  onChange={(type) => patch(d.name, { type })}
                  options={(Object.keys(TYPE_LABELS) as Subject['type'][]).map((v) => ({ value: v, label: TYPE_LABELS[v] }))}
                />
              </div>
            ))}
          </div>
        )}

        <div className="between">
          <button className="btn btn-ghost" type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Zurück
          </button>
          {step < steps.length - 1 ? (
            <button className="btn btn-primary" type="button" disabled={!canNext} onClick={() => canNext && setStep((s) => s + 1)}>
              Weiter
            </button>
          ) : (
            <button className="btn btn-primary" type="button" onClick={finish}>
              Fertig
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
