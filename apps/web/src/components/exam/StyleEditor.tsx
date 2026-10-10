import { STYLE_LABELS, STYLE_LISTS, type TaskStyle } from '@study/core';
import { AutoTextarea } from '../AutoTextarea';

const toLines = (items: string[]) => items.join('\n');
const fromLines = (text: string) => text.split('\n');

/** Gelernter Stil zum Ansehen und Ändern: eine Zeile je Eintrag. Leere Zeilen räumt das Speichern auf. */
export function StyleEditor({ value, onChange, disabled }: { value: TaskStyle; onChange: (next: TaskStyle) => void; disabled?: boolean }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <label className="field">
        <span>Gesamteindruck</span>
        <AutoTextarea className="input" rows={2} value={value.zusammenfassung} disabled={disabled} onChange={(e) => onChange({ ...value, zusammenfassung: e.target.value })} />
      </label>
      {STYLE_LISTS.map((k) => (
        <label key={k} className="field">
          <span>{STYLE_LABELS[k]}</span>
          <AutoTextarea className="input" rows={2} value={toLines(value[k])} disabled={disabled} onChange={(e) => onChange({ ...value, [k]: fromLines(e.target.value) })} />
        </label>
      ))}
      <p className="hint">Eine Zeile je Eintrag. Streiche, was nicht stimmt, und ergänze, was dir auffällt. Die Übungsklausur folgt dem, was hier steht.</p>
    </div>
  );
}
