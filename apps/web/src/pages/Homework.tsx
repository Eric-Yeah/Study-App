import {
  addDays,
  downloadRequest,
  fileKey,
  formatBytes,
  importableType,
  subjectForCourse,
  toIsoDate,
  type HomeworkFile,
  type HomeworkItem,
} from '@study/core';
import { Check, Download, FileText, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDateShort } from '../lib/format';
import { useLanisAuto } from '../lib/lanisAuto';
import { setPendingUpload } from '../lib/lanisFiles';
import { useStore } from '../state/store';

const FILES_DAYS = 30; // so weit zurück zeigt die Liste der Arbeitsblätter zuerst
const HOMEWORK_DAYS = 14;

const ago = (iso: string | null) => {
  if (!iso) return 'noch nie';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 2) return 'gerade eben';
  if (min < 60) return `vor ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `vor ${h} h` : `vor ${Math.round(h / 24)} Tagen`;
};

/** Hausaufgaben und Arbeitsblätter aus den Kursmappen in Lanis (Bereich Notizen, Reiter Hausaufgaben). */
export function Homework() {
  const { state, dispatch } = useStore();
  const auto = useLanisAuto();
  const navigate = useNavigate();
  const today = toIsoDate(new Date());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOlder, setShowOlder] = useState(false);

  // Noch nie geladen (zum Beispiel gerade erst mit Lanis verbunden): einmal beim Öffnen der Seite holen
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !auto.enabled || state.homework || auto.busy) return;
    asked.current = true;
    void auto.refresh(true);
  }, [auto, state.homework]);

  const items = state.homework?.items ?? [];
  const subjectOf = (item: HomeworkItem) => state.subjects.find((s) => s.id === subjectForCourse(item.course, state.subjects)) ?? null;
  const taskFor = (item: HomeworkItem) => state.tasks.find((t) => t.externalId === item.key);
  const taken = useMemo(() => new Set(state.notes.flatMap((n) => n.lanisKeys)), [state.notes]);

  const homeworkCut = addDays(today, -HOMEWORK_DAYS);
  const homework = items.filter((i) => i.text && i.date >= homeworkCut);
  const open = homework.filter((i) => !(taskFor(i)?.done ?? i.done));
  const finished = homework.filter((i) => taskFor(i)?.done ?? i.done);

  const filesCut = addDays(today, -FILES_DAYS);
  const withFiles = items.filter((i) => i.files.length > 0);
  const recentFiles = withFiles.filter((i) => i.date >= filesCut);
  const shownFiles = showOlder ? withFiles : recentFiles;

  /** Aus Lanis laden und in das Hochladen von Notizen übergeben (dort Seiten prüfen und bestätigen). */
  const intoNotes = async (item: HomeworkItem, files: HomeworkFile[]) => {
    const id = `${item.key}:${files.map((f) => f.name).join('|')}`;
    setBusy(id);
    setError(null);
    try {
      const { downloaded, failed } = await auto.downloadFiles(files.map((f) => downloadRequest(item, f)));
      if (downloaded.length === 0) throw new Error('Die Datei konnte nicht aus Lanis geladen werden.');
      setPendingUpload({
        files: downloaded.map((d) => d.file),
        keys: Object.fromEntries(downloaded.map((d) => [d.file.name, fileKey(item, d.request)])),
        subjectId: subjectForCourse(item.course, state.subjects),
        date: item.date,
        teacher: item.teacherShort,
      });
      if (failed.length > 0) setError(`${failed.length === 1 ? 'Eine Datei' : `${failed.length} Dateien`} konnte nicht geladen werden, der Rest ist im Upload.`);
      navigate('/notizen?neu=1');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Der Download aus Lanis hat nicht geklappt.');
    } finally {
      setBusy(null);
    }
  };

  /** Datei in Lanis laden und im Browser speichern (für alles, was keine Notiz werden kann, zum Beispiel PowerPoint). */
  const save = async (item: HomeworkItem, file: HomeworkFile) => {
    const id = `${item.key}:${file.name}`;
    setBusy(id);
    setError(null);
    try {
      const { downloaded } = await auto.downloadFiles([downloadRequest(item, file)]);
      if (downloaded.length === 0) throw new Error('Die Datei konnte nicht aus Lanis geladen werden.');
      const url = URL.createObjectURL(downloaded[0].file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Der Download aus Lanis hat nicht geklappt.');
    } finally {
      setBusy(null);
    }
  };

  const homeworkRow = (item: HomeworkItem) => {
    const task = taskFor(item);
    const done = task?.done ?? item.done;
    const subject = subjectOf(item);
    return (
      <div key={item.key} className="task" style={{ alignItems: 'flex-start' }}>
        {task ? (
          <button type="button" className="check" role="checkbox" aria-checked={done} aria-label={`Hausaufgabe ${subject?.name ?? item.course} erledigt`} onClick={() => dispatch({ type: 'toggleTask', id: task.id })}>
            {done && <Check size={14} aria-hidden="true" />}
          </button>
        ) : (
          <span className="check" aria-hidden="true" style={{ opacity: 0.4 }}>
            {done && <Check size={14} />}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }} className="stack">
          <div className="between" style={{ gap: 8, flexWrap: 'wrap' }}>
            <strong>{subject?.name ?? item.course}</strong>
            <span className="hint">
              {formatDateShort(item.date)}
              {item.slot ? ` · ${item.slot}` : ''}
              {task ? ` · fällig ${formatDateShort(task.date)}` : ''}
            </span>
          </div>
          {item.topic && <span className="hint">{item.topic}</span>}
          <span className={done ? 'done-text' : ''} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {item.text}
          </span>
          {item.done && <span className="hint">In Lanis als erledigt markiert.</span>}
        </div>
      </div>
    );
  };

  const fileRow = (item: HomeworkItem, file: HomeworkFile) => {
    const type = importableType(file);
    const key = fileKey(item, file);
    const isTaken = taken.has(key);
    const id = `${item.key}:${file.name}`;
    return (
      <li key={file.name} className="between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, flex: 1 }}>
          <FileText size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ overflowWrap: 'anywhere' }}>
            {file.name} {file.size > 0 && <span className="hint">({formatBytes(file.size)})</span>}
          </span>
        </span>
        {isTaken ? (
          <span className="tag">in Notizen</span>
        ) : type ? (
          <button type="button" className="btn" disabled={busy !== null || !auto.enabled} onClick={() => void intoNotes(item, [file])}>
            {busy === `${item.key}:${file.name}` ? 'Lade …' : 'In Notizen übernehmen'}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" disabled={busy !== null || !auto.enabled} onClick={() => void save(item, file)} aria-label={`${file.name} herunterladen`}>
            <Download size={16} aria-hidden="true" /> {busy === id ? 'Lade …' : 'Herunterladen'}
          </button>
        )}
      </li>
    );
  };

  const filesCard = (item: HomeworkItem) => {
    const subject = subjectOf(item);
    const importable = item.files.filter((f) => importableType(f) !== null && !taken.has(fileKey(item, f)));
    return (
      <div key={item.key} className="card stack" style={{ gap: 10 }}>
        <div className="between" style={{ gap: 8, flexWrap: 'wrap' }}>
          <strong>{subject?.name ?? item.course}</strong>
          <span className="hint">
            {formatDateShort(item.date)}
            {item.slot ? ` · ${item.slot}` : ''}
          </span>
        </div>
        {item.topic && <span className="muted">{item.topic}</span>}
        <ul className="stack" style={{ gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
          {item.files.map((f) => fileRow(item, f))}
        </ul>
        {importable.length > 1 && (
          <div>
            <button type="button" className="btn btn-primary" disabled={busy !== null || !auto.enabled} onClick={() => void intoNotes(item, importable)}>
              {busy === `${item.key}:${importable.map((f) => f.name).join('|')}` ? 'Lade …' : `Alle ${importable.length} in einer Notiz übernehmen`}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Hausaufgaben</h1>
          <p className="sub">Hausaufgaben und Arbeitsblätter aus deinen Kursmappen in Lanis. Stand: {ago(state.homeworkAt)}.</p>
        </div>
        {auto.enabled && (
          <button type="button" className="btn" disabled={auto.busy} onClick={() => void auto.refresh(true)}>
            <RefreshCw size={18} aria-hidden="true" /> {auto.busy ? 'Aktualisiere …' : 'Jetzt aktualisieren'}
          </button>
        )}
      </div>

      {!auto.enabled && (
        <div className="card stack">
          <h2>Mit Lanis verbinden</h2>
          <p className="muted">
            Damit die App Hausaufgaben und Arbeitsblätter aus Lanis holen kann, muss die automatische Aktualisierung an sein (beim Import „Auf diesem Gerät merken“ wählen). Dein Passwort bleibt verschlüsselt auf diesem Gerät.
          </p>
          <div>
            <Link className="btn btn-primary" to="/import">
              Lanis verbinden
            </Link>
          </div>
        </div>
      )}

      {auto.error && (
        <p className="notice" role="alert">
          {auto.error}
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {auto.enabled && !state.homework && !auto.busy && (
        <p className="notice" role="status">
          Noch nichts geladen. Tippe auf „Jetzt aktualisieren“, dann liest die App deine Kursmappen.
        </p>
      )}

      {state.homework && (
        <>
          <section className="stack" aria-labelledby="hw-open">
            <div className="between">
              <h2 id="hw-open">Offen</h2>
              <span className="tag">{open.length}</span>
            </div>
            {open.length === 0 ? (
              <p className="hint">Keine offenen Hausaufgaben aus den letzten {HOMEWORK_DAYS} Tagen. Neue Hausaufgaben legt die App auch als Aufgaben auf Heute an.</p>
            ) : (
              <div className="card stack">{open.map(homeworkRow)}</div>
            )}
            {finished.length > 0 && (
              <details className="card stack">
                <summary style={{ cursor: 'pointer' }}>Erledigt ({finished.length})</summary>
                <div className="stack">{finished.map(homeworkRow)}</div>
              </details>
            )}
          </section>

          <section className="stack" aria-labelledby="hw-files">
            <div className="between">
              <h2 id="hw-files">Arbeitsblätter und Anhänge</h2>
              <span className="tag">{shownFiles.length}</span>
            </div>
            <p className="hint">
              „In Notizen übernehmen“ lädt die Datei direkt aus Lanis und führt dich durch das gewohnte Hochladen (Seiten prüfen, bestätigen). PDFs und Fotos gehen in Notizen, anderes (zum Beispiel PowerPoint) kannst du herunterladen.
            </p>
            {shownFiles.length === 0 ? <p className="hint">Keine Anhänge in den letzten {FILES_DAYS} Tagen.</p> : shownFiles.map(filesCard)}
            {!showOlder && withFiles.length > recentFiles.length && (
              <div>
                <button type="button" className="btn btn-ghost" onClick={() => setShowOlder(true)}>
                  Ältere zeigen ({withFiles.length - recentFiles.length})
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
