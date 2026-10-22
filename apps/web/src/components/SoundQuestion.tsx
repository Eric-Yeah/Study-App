import { Bell, BellOff } from 'lucide-react';

/** Tagesfrage vor dem ersten Fokus-Start: Ton am Ende des Timers? Beide Antworten starten den Timer. */
export function SoundQuestion({ onAnswer }: { onAnswer: (on: boolean) => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={() => onAnswer(false)}>
      <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="sound-title" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onAnswer(false)}>
        <h2 id="sound-title">Ton am Ende des Timers?</h2>
        <p className="muted">Soll ein kurzer Ton erklingen, wenn der Timer abläuft? Die App fragt dich einmal am Tag. Ändern kannst du es jederzeit in den Einstellungen.</p>
        <div className="stack" style={{ gap: 8 }}>
          <button type="button" className="btn btn-primary btn-block" onClick={() => onAnswer(true)} autoFocus>
            <Bell size={16} aria-hidden="true" /> Ja, mit Ton
          </button>
          <button type="button" className="btn btn-block" onClick={() => onAnswer(false)}>
            <BellOff size={16} aria-hidden="true" /> Nein, ohne Ton
          </button>
        </div>
      </div>
    </div>
  );
}
