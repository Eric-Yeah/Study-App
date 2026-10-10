import { DEFAULT_DIFFICULTY, type Difficulty, type Subject } from '@study/core';
import { Check, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { AutoTextarea } from './AutoTextarea';
import { DifficultyPicker } from './DifficultyPicker';

export interface NewCardInput {
  subjectId: string | null;
  front: string;
  back: string;
  difficulty: Difficulty;
}

/** Neue Karte anlegen: Fach, zwei Kartenseiten, Schwierigkeit. "Speichern und weitere" behält Fach und Stufe. */
export function CardForm({ subjects, defaultSubjectId, onSave, onClose }: { subjects: Subject[]; defaultSubjectId: string | null; onSave: (c: NewCardInput) => void; onClose: () => void }) {
  const [subjectId, setSubjectId] = useState<string | null>(defaultSubjectId);
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [saved, setSaved] = useState(0);
  const frontRef = useRef<HTMLDivElement>(null);
  const ready = front.trim() !== '' && back.trim() !== '';

  const save = (more: boolean) => {
    if (!ready) return;
    onSave({ subjectId, front: front.trim(), back: back.trim(), difficulty });
    setFront('');
    setBack('');
    setSaved((n) => n + 1);
    if (!more) onClose();
    else frontRef.current?.querySelector('textarea')?.focus();
  };

  return (
    <div className="card stack cardform">
      <div className="between">
        <h2>Neue Karte</h2>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Schließen" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <span className="form-label">Fach</span>
        <div className="row note-filter" role="group" aria-label="Fach der Karte">
          <button type="button" className="chip" aria-pressed={subjectId === null} onClick={() => setSubjectId(null)}>
            Ohne Fach
          </button>
          {subjects.map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={subjectId === s.id} onClick={() => setSubjectId(s.id)}>
              <i className="dot" style={{ background: s.color }} />
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="faces">
        <label className="face face-front" ref={frontRef as never}>
          <span className="form-label">Vorderseite · Frage</span>
          <AutoTextarea className="face-input" rows={2} value={front} maxLength={1000} placeholder="Was möchtest du abfragen?" onChange={(e) => setFront(e.target.value)} />
        </label>
        <label className="face face-back">
          <span className="form-label">Rückseite · Antwort</span>
          <AutoTextarea className="face-input" rows={2} value={back} maxLength={2000} placeholder="Die richtige Antwort, kurz und klar" onChange={(e) => setBack(e.target.value)} />
        </label>
      </div>

      <DifficultyPicker value={difficulty} onChange={setDifficulty} />

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => save(true)}>
          Speichern und weitere
        </button>
        <button type="button" className="btn" disabled={!ready} onClick={() => save(false)}>
          Speichern und schließen
        </button>
        {saved > 0 && (
          <span className="saved-flash" role="status">
            <Check size={16} aria-hidden="true" /> {saved === 1 ? '1 Karte gespeichert' : `${saved} Karten gespeichert`}
          </span>
        )}
      </div>
    </div>
  );
}
