import { CONFIG, GRADE_KINDS, clampWeight, defaultWeight, groupOf, kindLabel, pointsLabel, type GradeEntry, type GradeKind, type Quarter } from '@study/core';
import { useState } from 'react';
import { PlainSlider } from '../PlainSlider';

export interface GradeDraft {
  id: string | null; // null: neue Note
  kind: GradeKind;
  title: string;
  date: string;
  points: number;
  weight: number;
  examId: string | null;
}

export const draftOf = (g: GradeEntry): GradeDraft => ({ id: g.id, kind: g.kind, title: g.title, date: g.date, points: g.points, weight: g.weight, examId: g.examId });

export const emptyDraft = (date: string): GradeDraft => ({ id: null, kind: 'oral', title: '', date, points: 9, weight: defaultWeight('oral'), examId: null });

const G = CONFIG.grades;
const WEIGHTS = Array.from({ length: Math.round((G.weightMax - G.weightMin) / G.weightStep) + 1 }, (_, i) => G.weightMin + i * G.weightStep);

/** Eine Note eintragen oder ändern: Art, Titel, Datum, Punkte und Gewicht. */
export function GradeForm({
  draft,
  quarter,
  onSave,
  onCancel,
}: {
  draft: GradeDraft;
  quarter: Quarter;
  onSave: (draft: GradeDraft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState(draft);
  const [touchedWeight, setTouchedWeight] = useState(draft.id !== null);
  const set = (patch: Partial<GradeDraft>) => setD((cur) => ({ ...cur, ...patch }));

  return (
    <form
      className="stack tile"
      style={{ gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...d, weight: clampWeight(d.weight) });
      }}
    >
      <strong>{draft.id ? 'Note ändern' : `Neue Note in ${quarter}`}</strong>
      <label className="field">
        <span>Art</span>
        <select
          className="input"
          value={d.kind}
          onChange={(e) => {
            const kind = e.target.value as GradeKind;
            // Das Gewicht der Art vorschlagen, solange man es nicht selbst angefasst hat
            set({ kind, ...(touchedWeight ? {} : { weight: defaultWeight(kind) }) });
          }}
        >
          {(['written', 'other'] as const).map((group) => (
            <optgroup key={group} label={group === 'written' ? 'Klausuren' : 'Sonstige Leistungen'}>
              {GRADE_KINDS.filter((k) => groupOf(k) === group).map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="grade-two">
        <label className="field">
          <span>Titel (optional)</span>
          <input className="input" value={d.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} placeholder="Zum Beispiel Vokabeltest" />
        </label>
        <label className="field">
          <span>Datum</span>
          <input className="input" type="date" required value={d.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
      </div>
      <PlainSlider label="Punkte" value={d.points} min={0} max={15} format={(v) => `${v} Punkte (${pointsLabel(v)})`} onChange={(points) => set({ points })} />
      <label className="field">
        <span>Gewicht innerhalb der Gruppe</span>
        <select
          className="input"
          value={d.weight}
          onChange={(e) => {
            setTouchedWeight(true);
            set({ weight: Number(e.target.value) });
          }}
        >
          {WEIGHTS.map((w) => (
            <option key={w} value={w}>
              {String(w).replace('.', ',')}-fach{w === defaultWeight(d.kind) ? ' (Standard)' : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-primary">
          Speichern
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
