import type { ReactNode } from 'react';

/** Abschluss einer Lernrunde: Titel, Ergebnis, optional Details und Knöpfe. */
export function StudyDone({
  title,
  text,
  big,
  children,
  onClose,
  extra,
}: {
  title: string;
  text: string;
  big?: string;
  children?: ReactNode;
  onClose: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="card stack study-done" role="status">
      <h2>{title}</h2>
      {big && <div className="big-num study-score">{big}</div>}
      <p className="muted">{text}</p>
      {children}
      <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {extra}
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Fertig
        </button>
      </div>
    </div>
  );
}

/** Kopf einer Lernrunde: Fortschritt links, Beenden rechts, darunter der Balken. */
export function StudyHead({ label, progress, onClose }: { label: string; progress: number; onClose: () => void }) {
  return (
    <>
      <div className="between">
        <span className="hint">{label}</span>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Runde beenden" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
      </div>
    </>
  );
}
