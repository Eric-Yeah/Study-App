import { useId } from 'react';

interface Props {
  label: string;
  value: number;
  auto: number;
  overridden: boolean;
  min: number;
  max: number;
  step?: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  onReset: () => void;
  autoNote?: string;
}

/** Regler mit Vorschlag der App: zeigt den Vorschlag, wenn der Nutzer ihn überschrieben hat. */
export function OverridableSlider({
  label,
  value,
  auto,
  overridden,
  min,
  max,
  step = 1,
  format,
  onChange,
  onReset,
  autoNote,
}: Props) {
  const id = useId();
  return (
    <div className="slider-row">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{format(value)}</output>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p className="note">
        {overridden ? (
          <>
            Von dir geändert. Vorschlag: {format(auto)}.{' '}
            <button type="button" className="link-btn" onClick={onReset}>
              Vorschlag übernehmen
            </button>
          </>
        ) : (
          autoNote ?? 'Vorschlag der App.'
        )}
      </p>
    </div>
  );
}
