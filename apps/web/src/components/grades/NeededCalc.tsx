import { GRADE_KINDS, defaultWeight, kindLabel, neededPoints, pointsLabel, type GradeEntry, type GradeKind } from '@study/core';
import { useState } from 'react';
import { PlainSlider } from '../PlainSlider';

/** Was brauche ich? Wie viele Punkte die nächste Leistung haben muss, damit die Kursnote ein Ziel erreicht. */
export function NeededCalc({ entries, share, current }: { entries: readonly GradeEntry[]; share: number; current: number | null }) {
  const [kind, setKind] = useState<GradeKind>('exam');
  const [target, setTarget] = useState(() => Math.min(15, (current ?? 8) + 1));
  const result = neededPoints(entries, share, { kind, weight: defaultWeight(kind) }, target);

  return (
    <div className="stack tile" style={{ gap: 12 }}>
      <strong>Was brauche ich?</strong>
      <PlainSlider label="Ziel für die Kursnote" value={target} min={1} max={15} format={(v) => `${v} Punkte (${pointsLabel(v)})`} onChange={setTarget} />
      <label className="field">
        <span>Nächste Leistung</span>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as GradeKind)}>
          {GRADE_KINDS.map((k) => (
            <option key={k} value={k}>
              {kindLabel(k)}
            </option>
          ))}
        </select>
      </label>
      {entries.length === 0 ? (
        <p className="hint">Trag zuerst eine Note ein, dann kann die App rechnen.</p>
      ) : result.status === 'safe' ? (
        <p className="notice ok">Das Ziel ist sicher: Selbst mit 0 Punkten in dieser Leistung bleibst du darüber.</p>
      ) : result.status === 'impossible' ? (
        <p className="notice">Mit einer einzelnen {kindLabel(kind)} ist das Ziel nicht mehr zu erreichen, auch nicht mit 15 Punkten.</p>
      ) : (
        <p className="notice ok">
          Du brauchst mindestens <strong>{result.points} Punkte</strong> ({pointsLabel(result.points ?? 0)}) in der nächsten {kindLabel(kind)}.
        </p>
      )}
      <p className="hint">Rechnung mit dem Standardgewicht der Art. Die Lehrkraft kann anders gewichten und runden.</p>
    </div>
  );
}
