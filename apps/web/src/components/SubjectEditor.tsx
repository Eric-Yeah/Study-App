import { defaultLanguageFor, priorityBreakdown, type Subject, type SubjectStatus, type SubjectType } from '@study/core';
import { formatNumber } from '../lib/format';
import { STATUS_LABELS, SUBJECT_COLORS, TYPE_HINTS, TYPE_LABELS } from '../state/defaults';
import { GradeField } from './GradeField';
import { LanguageField } from './LanguageField';
import { PlainSlider } from './PlainSlider';
import { Segmented } from './Segmented';

export function SubjectEditor({ subject, onChange }: { subject: Subject; onChange: (s: Subject) => void }) {
  const p = priorityBreakdown(subject);
  const set = (patch: Partial<Subject>) => onChange({ ...subject, ...patch });
  return (
    <div className="stack" style={{ gap: 16 }}>
      <label className="field">
        <span>Name</span>
        <input
          className="input"
          value={subject.name}
          onChange={(e) => {
            const name = e.target.value;
            // Solange die Sprache noch dem Vorschlag zum alten Namen entspricht, folgt sie dem neuen Namen
            set(subject.language === defaultLanguageFor(subject.name) ? { name, language: defaultLanguageFor(name) } : { name });
          }}
        />
      </label>
      <div className="field">
        <span>Farbe</span>
        <div className="swatches" role="group" aria-label="Farbe">
          {SUBJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="swatch"
              style={{ background: c }}
              aria-label={`Farbe ${c}`}
              aria-pressed={subject.color === c}
              onClick={() => set({ color: c })}
            />
          ))}
        </div>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="chip" aria-pressed={subject.isAdvanced} onClick={() => set({ isAdvanced: !subject.isAdvanced })}>
          Leistungskurs
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={subject.isExamSubject}
          onClick={() => set({ isExamSubject: !subject.isExamSubject })}
        >
          Prüfungsfach
        </button>
      </div>
      <div className="field">
        <span>Status</span>
        <Segmented<SubjectStatus>
          label="Status"
          value={subject.status}
          onChange={(status) => set({ status })}
          options={(Object.keys(STATUS_LABELS) as SubjectStatus[]).map((v) => ({ value: v, label: STATUS_LABELS[v] }))}
        />
        {p.statusIgnored && (
          <p className="notice">Leistungskurse und Prüfungsfächer lassen sich nicht abwählen. Der Status wird ignoriert.</p>
        )}
      </div>
      <div className="field">
        <span>Fachtyp</span>
        <Segmented<SubjectType>
          label="Fachtyp"
          value={subject.type}
          onChange={(type) => set({ type })}
          options={(Object.keys(TYPE_LABELS) as SubjectType[]).map((v) => ({ value: v, label: TYPE_LABELS[v] }))}
        />
        <p className="hint">{TYPE_HINTS[subject.type]}</p>
      </div>
      <LanguageField value={subject.language} subjectName={subject.name} onChange={(language) => set({ language })} />
      <GradeField points={subject.points} onChange={(points) => set({ points })} />
      <PlainSlider
        label="Schwierigkeit"
        value={subject.difficulty}
        min={1}
        max={5}
        format={(v) => `${v} von 5`}
        onChange={(difficulty) => set({ difficulty })}
      />
      <div className="tile">
        <div className="between">
          <span className="muted">Priorität laut App</span>
          <span className="big-num">{p.auto}</span>
        </div>
        <p className="hint" style={{ marginTop: 4 }}>
          Basis 1, Gewichtung +{p.weighting}, Note +{formatNumber(p.gradeBonus)}{!p.gradeKnown && ' (neutral, ohne Note)'}, Schwierigkeit +{formatNumber(p.difficultyBonus)}
          {p.status === 'drop_q3' && ', Abwahl ab Q3 −2'}
          {p.status === 'dropped' && ', abgewählt: Minimum'}
        </p>
      </div>
    </div>
  );
}
