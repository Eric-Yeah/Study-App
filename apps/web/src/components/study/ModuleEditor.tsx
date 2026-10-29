import { CONFIG, defaultLanguageFor, moduleHoursPerWeek, moduleWorkloadHours, type Subject, type SubjectType } from '@study/core';
import { formatHours } from '../../lib/format';
import { SUBJECT_COLORS, TYPE_LABELS } from '../../state/defaults';
import { LanguageField } from '../LanguageField';
import { PlainSlider } from '../PlainSlider';
import { Segmented } from '../Segmented';

const MODULE_TYPE_HINTS: Record<SubjectType, string> = {
  problems: 'Übungsblätter und Rechenaufgaben, kürzere Einheiten mit viel Üben',
  knowledge: 'Begriffe und Zusammenhänge, Wiederholen in wachsenden Abständen',
  writing: 'Texte und Hausarbeiten, früher starten, Feedback einplanen',
};

/** Ein Modul bearbeiten: Name, Farbe, ECTS, Semester, Pflicht oder Wahl, Dozent/in, Art, Schwierigkeit. */
export function ModuleEditor({ subject, onChange }: { subject: Subject; onChange: (s: Subject) => void }) {
  const set = (patch: Partial<Subject>) => onChange({ ...subject, ...patch });
  const ects = subject.ects ?? 0;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <label className="field">
        <span>Name des Moduls</span>
        <input
          className="input"
          value={subject.name}
          onChange={(e) => {
            const name = e.target.value;
            set(subject.language === defaultLanguageFor(subject.name) ? { name, language: defaultLanguageFor(name) } : { name });
          }}
        />
      </label>
      <div className="field">
        <span>Farbe</span>
        <div className="swatches" role="group" aria-label="Farbe">
          {SUBJECT_COLORS.map((c) => (
            <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={`Farbe ${c}`} aria-pressed={subject.color === c} onClick={() => set({ color: c })} />
          ))}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label className="field">
          <span>Leistungspunkte (ECTS)</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0.5}
            max={60}
            step={0.5}
            value={subject.ects ?? ''}
            onChange={(e) => set({ ects: e.target.value === '' ? null : Math.min(60, Math.max(0, Number(e.target.value))) })}
          />
        </label>
        <label className="field">
          <span>Fachsemester</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            step={1}
            value={subject.semester ?? ''}
            onChange={(e) => set({ semester: e.target.value === '' ? null : Math.min(30, Math.max(1, Math.round(Number(e.target.value)))) })}
          />
        </label>
      </div>
      {ects > 0 ? (
        <p className="hint">
          {ects} ECTS sind rund {formatHours(moduleWorkloadHours(ects))} Arbeit im Semester, etwa {formatHours(moduleHoursPerWeek(ects))} pro Woche ({CONFIG.study.hoursPerEcts} Stunden je ECTS laut Bologna-Richtwert).
        </p>
      ) : (
        <p className="hint">Ohne ECTS rechnet die App wie in der Schule mit Priorität und Schwierigkeit. Trage die Leistungspunkte aus deinem Modulhandbuch ein.</p>
      )}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="chip" aria-pressed={subject.required !== false} onClick={() => set({ required: true })}>
          Pflichtmodul
        </button>
        <button type="button" className="chip" aria-pressed={subject.required === false} onClick={() => set({ required: false })}>
          Wahlmodul
        </button>
      </div>
      <label className="field">
        <span>Dozentin oder Dozent</span>
        <input className="input" value={subject.lecturer ?? ''} onChange={(e) => set({ lecturer: e.target.value })} placeholder="Prof. Beispiel" />
      </label>
      <div className="field">
        <span>Art des Lernens</span>
        <Segmented<SubjectType>
          label="Art des Lernens"
          value={subject.type}
          onChange={(type) => set({ type })}
          options={(Object.keys(TYPE_LABELS) as SubjectType[]).map((v) => ({ value: v, label: TYPE_LABELS[v] }))}
        />
        <p className="hint">{MODULE_TYPE_HINTS[subject.type]}</p>
      </div>
      <LanguageField value={subject.language} subjectName={subject.name} onChange={(language) => set({ language })} />
      <PlainSlider label="Schwierigkeit" value={subject.difficulty} min={1} max={5} format={(v) => `${v} von 5`} onChange={(difficulty) => set({ difficulty })} />
    </div>
  );
}
