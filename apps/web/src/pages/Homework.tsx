import {
  addDays,
  downloadRequest,
  dueDateFor,
  dueGroup,
  dueInfo,
  fileKey,
  formatBytes,
  importableType,
  isOwnHomework,
  subjectForCourse,
  toIsoDate,
  type HomeworkFile,
  type HomeworkItem,
} from '@study/core';
import { Check, Download, FileText, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatAgendaDay, formatDateShort } from '../lib/format';
import { useLanisAuto } from '../lib/lanisAuto';
import { setPendingUpload } from '../lib/lanisFiles';
import { HomeworkComposer } from '../components/HomeworkComposer';
import { useStore, type Task } from '../state/store';

const FILES_DAYS = 30; // so weit zurück zeigt die Liste der Arbeitsblätter zuerst
const HOMEWORK_DAYS = 21; // Hausaufgaben bleiben so lange sichtbar
const RECENT_DAYS = 3; // ohne Aufgabe in der App nur, wenn die Abgabe höchstens so lange her ist

const ago = (iso: string | null) => {
  if (!iso) return 'noch nie';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 2) return 'gerade eben';
  if (min < 60) return `vor ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `vor ${h} h` : `vor ${Math.round(h / 24)} Tagen`;
};

/** Gemeinsame Daten der beiden Seiten (Hausaufgaben, Arbeitsblätter). */
function useHomework() {
  const { state, dispatch } = useStore();
  const auto = useLanisAuto();
  const today = toIsoDate(new Date());

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
  /** Abgabetag: der der Aufgabe in der App, sonst berechnet aus dem Stundenplan */
  const dueOf = (item: HomeworkItem) => taskFor(item)?.date ?? dueDateFor(item.date, subjectForCourse(item.course, state.subjects), state.timetable, state.subjects);
  return { state, dispatch, auto, today, items, subjectOf, taskFor, dueOf };
}

function Header({ title, sub, auto, stand, children }: { title: string; sub: string; auto: ReturnType<typeof useLanisAuto>; stand: string | null; children?: ReactNode }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p className="sub">
            {sub}
            {auto.enabled ? ` Stand: ${ago(stand)}.` : ''}
          </p>
        </div>
        {auto.enabled && (
          <button type="button" className="btn" disabled={auto.busy} onClick={() => void auto.refresh(true)}>
            <RefreshCw size={18} aria-hidden="true" /> {auto.busy ? 'Aktualisiere …' : 'Jetzt aktualisieren'}
          </button>
        )}
      </div>

      {children}

      {!auto.enabled && (
        <div className="card stack">
          <h2>Mit Lanis verbinden (optional)</h2>
          <p className="muted">
            Damit die App Hausaufgaben und Arbeitsblätter auch aus Lanis holen kann, muss die automatische Aktualisierung an sein (beim Import „Auf diesem Gerät merken“ wählen). Dein Passwort bleibt verschlüsselt auf diesem Gerät.
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
    </>
  );
}

/** Eine Zeile der Liste: eine Hausaufgabe aus Lanis oder eine selbst eingetragene. */
interface Row {
  key: string;
  due: string;
  done: boolean;
  item: HomeworkItem | null; // aus Lanis
  task: Task | null; // Aufgabe in der App (eigene Hausaufgabe, oder die zur Lanis-Hausaufgabe)
}

/** Hausaufgaben: selbst eingetragene und aus den Kursmappen in Lanis, nach Abgabetag geordnet. */
export function Homework() {
  const { state, dispatch, auto, today, items, subjectOf, taskFor, dueOf } = useHomework();

  const cut = addDays(today, -HOMEWORK_DAYS);
  const lanis = items.filter((i) => i.text && i.date >= cut);
  const isDone = (i: HomeworkItem) => taskFor(i)?.done ?? i.done;
  const lanisRows: Row[] = lanis.map((i) => ({ key: i.key, due: dueOf(i), done: isDone(i), item: i, task: taskFor(i) ?? null }));
  const ownRows: Row[] = state.tasks.filter(isOwnHomework).map((t) => ({ key: t.id, due: t.date, done: t.done, item: null, task: t }));

  const subjectName = (r: Row) => (r.item ? subjectOf(r.item)?.name ?? r.item.course : state.subjects.find((s) => s.id === r.task?.subjectId)?.name ?? '');
  // Offen: Eigene immer, aus Lanis mit Aufgabe in der App oder wenn die Abgabe noch nicht lange her ist
  const open = [...lanisRows, ...ownRows]
    .filter((r) => !r.done && (r.task || r.due >= addDays(today, -RECENT_DAYS)))
    .sort((a, b) => a.due.localeCompare(b.due) || subjectName(a).localeCompare(subjectName(b)));
  const finished = [...lanisRows, ...ownRows]
    .filter((r) => r.done)
    .sort((a, b) => b.due.localeCompare(a.due))
    .slice(0, 60);

  const groups: { key: string; kind: ReturnType<typeof dueGroup>; due: string; rows: Row[] }[] = [];
  for (const row of open) {
    const kind = dueGroup(row.due, today);
    const key = kind === 'day' ? row.due : kind;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, kind, due: row.due, rows: [row] });
  }
  const groupTitle = (g: (typeof groups)[number]) => (g.kind === 'late' ? 'Überfällig' : g.kind === 'today' ? 'Heute' : g.kind === 'tomorrow' ? 'Morgen' : formatAgendaDay(g.due, today));

  const lateCount = open.filter((r) => r.due < today).length;
  const todayCount = open.filter((r) => r.due === today).length;

  const card = (r: Row) => {
    const { item, task, done, due } = r;
    const subject = item ? subjectOf(item) : state.subjects.find((s) => s.id === task?.subjectId) ?? null;
    const name = subject?.name ?? item?.course ?? 'Hausaufgabe';
    const info = dueInfo(due, today);
    return (
      <div key={r.key} className={`card hw-card${done ? ' is-done' : ''}`} style={{ '--subject': subject?.color ?? 'var(--accent)' } as CSSProperties}>
        {task ? (
          <button type="button" className="check" role="checkbox" aria-checked={done} aria-label={`Hausaufgabe ${name} erledigt`} onClick={() => dispatch({ type: 'toggleTask', id: task.id })}>
            {done && <Check size={14} aria-hidden="true" />}
          </button>
        ) : (
          <span className="check" aria-hidden="true" style={{ opacity: 0.4 }}>
            {done && <Check size={14} />}
          </span>
        )}
        <div className="hw-body">
          <div className="hw-head">
            <strong className="hw-subject">{name}</strong>
            {!done && <span className={`due ${info.tone}`}>{info.label}</span>}
          </div>
          {item ? (
            <>
              <span className="hw-meta">
                {done ? '' : `Fällig ${formatDateShort(due)} · `}Eintrag vom {formatDateShort(item.date)}
                {item.slot ? `, ${item.slot}` : ''}
                {item.topic ? ` · ${item.topic}` : ''}
              </span>
              <span className={`hw-text${done ? ' done-text' : ''}`}>{item.text}</span>
              {item.done && <span className="hw-meta">In Lanis als erledigt markiert.</span>}
            </>
          ) : (
            <>
              <span className={`hw-text${done ? ' done-text' : ''}`}>{task?.title}</span>
              <span className="hw-meta">Fällig {formatDateShort(due)} · selbst eingetragen</span>
            </>
          )}
        </div>
        {!item && task && (
          <button type="button" className="btn btn-ghost btn-icon" aria-label={`Hausaufgabe ${name} löschen`} onClick={() => dispatch({ type: 'deleteTask', id: task.id })}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Header title="Hausaufgaben" sub="Selbst eingetragen und aus Lanis, nach Abgabetag geordnet." auto={auto} stand={state.homeworkAt}>
        <div className="card">
          <HomeworkComposer />
        </div>
      </Header>

      {auto.enabled && !state.homework && !auto.busy && (
        <p className="notice" role="status">
          Aus Lanis ist noch nichts geladen. Tippe auf „Jetzt aktualisieren“, dann liest die App deine Kursmappen.
        </p>
      )}

      <div className="hw-summary">
        <div className="hw-stat">
          <strong>{open.length}</strong>
          <span>offen</span>
        </div>
        <div className={`hw-stat${lateCount > 0 ? ' late' : ''}`}>
          <strong>{lateCount}</strong>
          <span>überfällig</span>
        </div>
        <div className={`hw-stat${todayCount > 0 ? ' today' : ''}`}>
          <strong>{todayCount}</strong>
          <span>heute fällig</span>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <h2>Alles erledigt</h2>
          <p className="muted">Keine offenen Hausaufgaben. Neue trägst du oben in einer Zeile ein, sie erscheinen auch als Aufgaben auf Heute.</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="hw-group" aria-label={groupTitle(g)}>
            <h2 className={`hw-group-title ${g.kind}`}>
              {groupTitle(g)} <span className="hw-count">{g.rows.length}</span>
            </h2>
            {g.rows.map(card)}
          </section>
        ))
      )}

      {finished.length > 0 && (
        <details className="hw-group">
          <summary className="hw-group-title" style={{ cursor: 'pointer' }}>
            Erledigt <span className="hw-count">{finished.length}</span>
          </summary>
          <div className="hw-group" style={{ marginTop: 10 }}>
            {finished.map(card)}
          </div>
        </details>
      )}
    </div>
  );
}

/** Arbeitsblätter und Anhänge der Lehrkräfte aus Lanis, direkt als Notiz übernehmbar. */
export function Worksheets() {
  const { state, auto, today, items, subjectOf } = useHomework();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOlder, setShowOlder] = useState(false);
  const taken = useMemo(() => new Set(state.notes.flatMap((n) => n.lanisKeys)), [state.notes]);

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

  const fileRow = (item: HomeworkItem, file: HomeworkFile) => {
    const type = importableType(file);
    const isTaken = taken.has(fileKey(item, file));
    const id = `${item.key}:${file.name}`;
    return (
      <li key={file.name} className="ws-file">
        <FileText size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span className="ws-name">
          {file.name} {file.size > 0 && <span className="hint">({formatBytes(file.size)})</span>}
        </span>
        {isTaken ? (
          <span className="tag">in Notizen</span>
        ) : type ? (
          <button type="button" className="btn" disabled={busy !== null || !auto.enabled} onClick={() => void intoNotes(item, [file])}>
            {busy === id ? 'Lade …' : 'In Notizen übernehmen'}
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
      <div key={item.key} className="card hw-card" style={{ '--subject': subject?.color ?? 'var(--accent)' } as CSSProperties}>
        <div className="hw-body">
          <div className="hw-head">
            <strong className="hw-subject">{subject?.name ?? item.course}</strong>
            <span className="hw-meta">
              {formatDateShort(item.date)}
              {item.slot ? ` · ${item.slot}` : ''}
            </span>
          </div>
          {item.topic && <span className="hw-meta">{item.topic}</span>}
          <ul className="ws-files">{item.files.map((f) => fileRow(item, f))}</ul>
          {importable.length > 1 && (
            <div>
              <button type="button" className="btn btn-primary" disabled={busy !== null || !auto.enabled} onClick={() => void intoNotes(item, importable)}>
                {busy === `${item.key}:${importable.map((f) => f.name).join('|')}` ? 'Lade …' : `Alle ${importable.length} in einer Notiz übernehmen`}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Header title="Arbeitsblätter" sub="Anhänge deiner Lehrkräfte aus Lanis." auto={auto} stand={state.homeworkAt} />
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {state.homework && (
        <>
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
        </>
      )}
    </div>
  );
}
