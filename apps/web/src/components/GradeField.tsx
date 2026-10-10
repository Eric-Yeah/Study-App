import { CONFIG } from '@study/core';
import { useRef } from 'react';
import { formatNumber } from '../lib/format';
import { PlainSlider } from './PlainSlider';

const DEFAULT_POINTS = 9;

/**
 * Notenstand eines Fachs. Mit dem Haken zählt die Note nicht (noch keine Note oder nicht einbeziehen):
 * die Priorität rechnet dann neutral statt mit einer erfundenen Zahl.
 */
export function GradeField({ points, onChange }: { points: number | null; onChange: (points: number | null) => void }) {
  const last = useRef(points ?? DEFAULT_POINTS); // beim Abwählen des Hakens zurück zum letzten Wert
  if (points !== null) last.current = points;
  const unknown = points === null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {unknown ? (
        <div className="slider-row">
          <span>Notenstand</span>
          <output>keine Note</output>
        </div>
      ) : (
        <PlainSlider label="Notenstand" value={points} min={0} max={15} format={(v) => `${v} Punkte`} onChange={onChange} />
      )}
      <label className="check-row">
        <input type="checkbox" checked={unknown} onChange={(e) => onChange(e.target.checked ? null : last.current)} />
        <span>
          Noch keine Note oder nicht einbeziehen
          {unknown && (
            <span className="hint">
              {' '}
              Die Priorität rechnet neutral (wie {formatNumber(CONFIG.priority.unknownGradePoints)} Punkte), sobald du eine Note hast, trag sie hier ein.
            </span>
          )}
        </span>
      </label>
    </div>
  );
}
