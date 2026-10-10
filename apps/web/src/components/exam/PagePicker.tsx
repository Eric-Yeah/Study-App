import { formatBytes } from '@study/core';
import { ArrowDown, ArrowUp, Camera, FileText, UploadCloud, X } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/** Fotos oder PDFs für einen Teil der Klausur wählen (Ablage, Kamera, Reihenfolge). */
export function PagePicker({
  id,
  files,
  onChange,
  disabled,
  prompt,
}: {
  id: string;
  files: File[];
  onChange: (files: File[]) => void;
  disabled: boolean;
  prompt: string;
}) {
  const [dragging, setDragging] = useState(false);
  const [previews, setPreviews] = useState<(string | null)[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urls = files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null));
    setPreviews(urls);
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [files]);

  const add = (list: FileList | File[] | null) => {
    const added = [...(list ?? [])].filter((f) => (f.type.startsWith('image/') || isPdf(f)) && !files.some((x) => sameFile(x, f)));
    if (added.length > 0) onChange([...files, ...added]);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) add(e.dataTransfer.files);
  };
  const move = (i: number, by: number) => {
    const next = [...files];
    const [f] = next.splice(i, 1);
    next.splice(i + by, 0, f);
    onChange(next);
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <label
        className={`dropzone dropzone-small${dragging ? ' over' : ''}${disabled ? ' disabled' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          id={id}
          type="file"
          multiple
          accept="image/*,application/pdf"
          disabled={disabled}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
        <UploadCloud size={26} aria-hidden="true" />
        <strong>{prompt}</strong>
        <span className="hint">Fotos oder PDFs, hierher ziehen oder tippen</span>
      </label>
      <button type="button" className="btn camera-btn" disabled={disabled} onClick={() => cameraRef.current?.click()}>
        <Camera size={16} aria-hidden="true" /> Foto aufnehmen
      </button>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          add(e.target.files);
          e.target.value = '';
        }}
      />
      {files.length > 0 && (
        <ol className="file-cards" aria-label="Gewählte Dateien in dieser Reihenfolge">
          {files.map((f, i) => (
            <li key={`${f.name}${f.size}${f.lastModified}`} className="file-card">
              <span className="file-num">{i + 1}</span>
              <span className="file-thumb" aria-hidden="true">
                {previews[i] ? <img src={previews[i]!} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} /> : <FileText size={22} />}
              </span>
              <span className="file-info">
                <span className="file-name">{f.name}</span>
                <span className="hint">
                  {isPdf(f) ? 'PDF' : 'Foto'} · {formatBytes(f.size)}
                </span>
              </span>
              <span className="file-actions">
                <button type="button" className="btn btn-ghost btn-icon" aria-label={`${f.name} nach oben`} disabled={disabled || i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={15} aria-hidden="true" />
                </button>
                <button type="button" className="btn btn-ghost btn-icon" aria-label={`${f.name} nach unten`} disabled={disabled || i === files.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown size={15} aria-hidden="true" />
                </button>
                <button type="button" className="btn btn-ghost btn-icon" aria-label={`${f.name} entfernen`} disabled={disabled} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                  <X size={15} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
