import {
  CONFIG,
  QUARTERS,
  formatBytes,
  initialPages,
  isUnchanged,
  matchSubject,
  movePage,
  pdfFileName,
  quarterFor,
  recentLesson,
  removePage,
  rotatePage,
  skippedSummary,
  teacherFor,
  toIsoDate,
  type PageEdit,
  type Quarter,
  type WorksheetPage,
  type WorksheetSummary,
} from '@study/core';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, Check, ExternalLink, FileText, RotateCw, UploadCloud, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useUserId } from '../lib/auth';
import { formatDateShort, uid } from '../lib/format';
import { mergeToPdf, type MergedPdf } from '../lib/mergePdf';
import { applyPageEdits, renderThumbnails } from '../lib/pdfEdit';
import { dropImagesIfSure, removeDocument, removeNoteImages, summarizeWorksheet, uploadDocument, uploadWorksheetImages } from '../lib/worksheetApi';
import { preparePages, type Progress } from '../lib/worksheetFiles';
import { useMode } from '../lib/mode';
import { useStore, type LessonNote } from '../state/store';
import { useAccess } from '../lib/access';
import { clearPendingUpload, peekPendingUpload } from '../lib/lanisFiles';

export const EMPTY_SUMMARY: WorksheetSummary = { thema: '', kernaussagen: [], begriffe: [], formeln: [], offene_fragen: [], lesbarkeit: 'sicher' };

const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/** Drei Schritte: Dateien wählen, Seiten prüfen, hochladen. */
function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = ['Dateien', 'Prüfen', 'Hochladen'];
  return (
    <ol className="stepper" aria-label="Schritte">
      {items.map((label, i) => {
        const n = i + 1;
        const state = n < step ? 'done' : n === step ? 'current' : 'todo';
        return (
          <li key={label} className={`step ${state}`} aria-current={n === step ? 'step' : undefined}>
            <span className="step-dot">{state === 'done' ? <Check size={14} aria-hidden="true" /> : n}</span>
            <span className="step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

const isPdfFile = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

export interface Created {
  noteId: string;
  message: string;
  warn: boolean;
}

/**
 * Arbeitsblätter hochladen in zwei Schritten: erst Dateien wählen und im Browser zu einem PDF zusammenfügen
 * (ohne KI), dann bestätigen. Erst danach wird hochgeladen, auf Wunsch zusätzlich mit KI zusammengefasst.
 */
export function NoteUpload({ onCreated, onSettled }: { onCreated: (c: Created) => void; onSettled: () => void }) {
  const { state, dispatch, flush } = useStore();
  const { isUni, terms } = useMode();
  const userId = useUserId();
  const today = toIsoDate(new Date());

  // Fach aus dem Stundenplan: die laufende oder zuletzt beendete Stunde.
  const guess = useMemo(() => {
    if (!state.timetable) return '';
    const lesson = recentLesson(state.timetable, today, new Date().toTimeString().slice(0, 5));
    return (lesson && matchSubject(lesson.abbr, state.subjects)) || '';
  }, [state.timetable, state.subjects, today]);

  // Anhänge aus Lanis (Seite Hausaufgaben): Dateien, Fach, Datum und Lehrkraft sind schon gewählt, der Rest läuft wie gewohnt
  const [fromLanis] = useState(peekPendingUpload);
  useEffect(() => clearPendingUpload(), []);

  const [subjectId, setSubjectId] = useState(fromLanis?.subjectId ?? guess);
  const [date, setDate] = useState(fromLanis?.date ?? today);
  const [teacher, setTeacher] = useState(fromLanis?.teacher ?? '');
  const [quarter, setQuarter] = useState<Quarter | ''>('');
  const [files, setFiles] = useState<File[]>(fromLanis?.files ?? []);
  const access = useAccess();
  const [useAi, setUseAi] = useState(access.can('summarize'));
  const [built, setBuilt] = useState<(MergedPdf & { url: string }) | null>(null);
  // Seiten bearbeiten (drehen, verschieben, löschen), das fertige PDF entsteht daraus
  const [edits, setEdits] = useState<PageEdit[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [finalPdf, setFinalPdf] = useState<(MergedPdf & { url: string }) | null>(null);
  const [updating, setUpdating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ teacher: Boolean(fromLanis?.teacher), quarter: false });
  const [dragging, setDragging] = useState(false);
  const [previews, setPreviews] = useState<(string | null)[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Vorschaubilder für die gewählten Fotos
  useEffect(() => {
    const urls = files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null));
    setPreviews(urls);
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [files]);

  useEffect(() => {
    if (!subjectId && guess) setSubjectId(guess);
  }, [guess, subjectId]);

  // Lehrkraft und Q-Phase vorschlagen: aus dem Stundenplan, sonst die Q-Phase der neuesten Notiz. Eigene Eingaben bleiben.
  useEffect(() => {
    if (!touched.teacher) setTeacher(isUni ? state.subjects.find((x) => x.id === subjectId)?.lecturer ?? '' : teacherFor(state.timetable, subjectId, state.subjects, date));
    if (!touched.quarter && !isUni) {
      const lastQuarter = [...state.notes].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).find((n) => n.quarter)?.quarter ?? '';
      setQuarter(quarterFor(state.timetable, subjectId, state.subjects) ?? lastQuarter);
    }
  }, [subjectId, date, state.timetable, state.subjects, state.notes, touched, isUni]);

  useEffect(() => () => void (built && URL.revokeObjectURL(built.url)), [built]);

  // Vorschaubilder der Seiten, eine nach der anderen
  useEffect(() => {
    if (!built) return;
    let stop = false;
    setThumbs([]);
    renderThumbnails(
      built.blob,
      160,
      (i, url) => !stop && setThumbs((t) => Object.assign([...t], { [i]: url })),
      () => stop,
    ).catch(() => {}); // ohne Vorschaubilder geht alles andere weiter
    return () => {
      stop = true;
    };
  }, [built]);

  // Das fertige PDF aus den bearbeiteten Seiten bauen (gleich geblieben: das zusammengefügte PDF selbst)
  useEffect(() => {
    if (!built) {
      setFinalPdf(null);
      return;
    }
    if (isUnchanged(edits, built.pages)) {
      setFinalPdf({ blob: built.blob, pages: built.pages, url: built.url });
      setUpdating(false);
      return;
    }
    if (edits.length === 0) {
      setFinalPdf(null);
      setUpdating(false);
      return;
    }
    let stop = false;
    setUpdating(true);
    const id = window.setTimeout(() => {
      applyPageEdits(built.blob, edits)
        .then((blob) => {
          if (stop) return;
          const url = URL.createObjectURL(blob);
          setFinalPdf((prev) => {
            if (prev && prev.url !== built.url) URL.revokeObjectURL(prev.url);
            return { blob, pages: edits.length, url };
          });
        })
        .catch(() => !stop && setError('Die Seiten konnten nicht geändert werden.'))
        .finally(() => !stop && setUpdating(false));
    }, 250);
    return () => {
      stop = true;
      window.clearTimeout(id);
    };
  }, [built, edits]);

  const subject = state.subjects.find((s) => s.id === subjectId);
  const name = pdfFileName({ date, subject: subject?.name ?? '', teacher, quarter: quarter || null });

  const addFiles = (list: FileList | File[] | null) => {
    const added = [...(list ?? [])].filter((f) => (f.type.startsWith('image/') || isPdfFile(f)) && !files.some((x) => sameFile(x, f)));
    setFiles([...files, ...added]);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!busy) addFiles(e.dataTransfer.files);
  };
  const move = (i: number, by: number) => {
    const next = [...files];
    const [f] = next.splice(i, 1);
    next.splice(i + by, 0, f);
    setFiles(next);
  };

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      const merged = await mergeToPdf(files, (done, total, label) => setProgress({ done, total, label }), isUni ? CONFIG.study.pdf.maxPages : undefined);
      setBuilt({ ...merged, url: URL.createObjectURL(merged.blob) });
      setEdits(initialPages(merged.pages));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Das PDF konnte nicht erstellt werden.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  // Aus Lanis geladene Dateien gleich zusammenfügen: der Nutzer landet direkt beim Prüfen der Seiten
  const autoBuilt = useRef(false);
  useEffect(() => {
    if (!fromLanis || autoBuilt.current || files.length === 0) return;
    autoBuilt.current = true;
    void build();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async () => {
    if (!built || !finalPdf || (!isUni && !quarter)) return;
    setBusy(true);
    setError(null);
    const noteId = uid();
    let created = false;
    let pdfPath: string | null = null;
    try {
      // Für die KI: bekannte Dateien, leere und doppelte Seiten fallen heraus (siehe preparePages).
      let prepared = null as Awaited<ReturnType<typeof preparePages>> | null;
      let message = '';
      if (useAi && access.can('summarize')) {
        try {
          prepared = await preparePages(files, state.notes.flatMap((n) => n.fileHashes), setProgress);
          message = skippedSummary(prepared.skipped);
          if (prepared.pages.length === 0) {
            prepared = null;
            message = `Nichts an die KI geschickt: ${message || 'auf den Seiten war nichts zu lesen.'}`;
          }
        } catch (e) {
          // Skripte sind oft länger, als die KI auf einmal liest: Im Studium bleibt die Notiz mit dem PDF, nur ohne Zusammenfassung
          if (!isUni) throw e;
          prepared = null;
          message = `${e instanceof Error ? e.message : 'Die KI-Zusammenfassung ging nicht.'} Die Notiz wird ohne Zusammenfassung gespeichert.`;
        }
      }

      let note: LessonNote = {
        id: noteId,
        subjectId,
        lessonDate: date,
        title: `${subject?.name ?? 'Notiz'} · ${formatDateShort(date)}`,
        summary: prepared ? null : EMPTY_SUMMARY,
        legibility: null,
        effort: null,
        teacher: teacher.trim(),
        quarter: quarter || null,
        pdfPath: null,
        fileHashes: prepared?.fileHashes ?? [],
        lanisKeys: files.map((f) => fromLanis?.keys[f.name]).filter((k): k is string => Boolean(k)),
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'upsertNote', note });
      created = true;
      await flush(); // die Dateizeilen verweisen auf die Notiz, sie muss zuerst in der Datenbank stehen

      setProgress({ done: 0, total: 1, label: 'PDF hochladen' });
      pdfPath = await uploadDocument(userId, finalPdf.blob);
      note = { ...note, pdfPath };
      dispatch({ type: 'upsertNote', note });

      let warn = false;
      if (prepared) {
        try {
          setProgress({ done: 0, total: 1, label: 'Hochladen' });
          const paths = await uploadWorksheetImages(userId, noteId, prepared.pages.flatMap((p) => (p.type === 'image' ? [p.blob] : [])));
          let next = 0;
          const pages: WorksheetPage[] = prepared.pages.map((p) => (p.type === 'text' ? p : { type: 'image', path: paths[next++] }));
          const { summary, effort } = await summarizeWorksheet(noteId, pages, undefined, (done, total) =>
            setProgress({ done, total, label: total > 1 ? `Zusammenfassen (Päckchen ${Math.min(done + 1, total)} von ${total})` : 'Zusammenfassen' }),
          );
          note = { ...note, title: summary.thema || note.title, summary, legibility: summary.lesbarkeit, effort };
          await dropImagesIfSure(noteId, summary.lesbarkeit); // spart Speicher: sicher gelesene Bilder braucht nichts mehr
        } catch (e) {
          // Das PDF ist gespeichert und bleibt. Nur die Zusammenfassung fehlt, die Hashes zählen dann nicht als verarbeitet.
          await removeNoteImages(noteId).catch(() => {});
          note = { ...note, summary: EMPTY_SUMMARY, fileHashes: [] };
          warn = true;
          message = `Das PDF ist gespeichert, aber die Zusammenfassung hat nicht geklappt: ${e instanceof Error ? e.message : 'unbekannter Fehler'}`;
        }
        dispatch({ type: 'upsertNote', note });
      }
      onCreated({ noteId, message, warn });
    } catch (e) {
      // Nichts Halbfertiges stehen lassen. Die Auswahl bleibt, du kannst es noch einmal versuchen.
      if (created) {
        await removeNoteImages(noteId).catch(() => {});
        dispatch({ type: 'deleteNote', id: noteId });
      }
      if (pdfPath) await removeDocument(pdfPath).catch(() => {});
      setError(e instanceof Error ? e.message : 'Das Dokument konnte nicht hochgeladen werden.');
    } finally {
      setBusy(false);
      setProgress(null);
      onSettled();
    }
  };

  const bar = busy && progress && (
    <div className="stack" style={{ gap: 6 }} role="status">
      <div className="bar" aria-hidden="true">
        <i style={{ width: `${progress.total ? Math.max(6, (progress.done / progress.total) * 100) : 6}%` }} />
      </div>
      <p className="hint">{progress.label}</p>
    </div>
  );
  const errorBox = error && (
    <p className="notice" role="alert">
      {error}
    </p>
  );

  // Schritt 2: Seiten prüfen und bestätigen
  if (built) {
    const changed = !isUnchanged(edits, built.pages);
    const shown = finalPdf ?? built;
    return (
      <div className="card stack doc-confirm upload-card" data-no-reload>
        <Stepper step={busy ? 3 : 2} />
        <div className="doc-head">
          <span className="doc-icon" aria-hidden="true">
            <FileText size={26} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p className="doc-name">{name}</p>
            <div className="pill-row">
              <span className="pill">{changed ? `${edits.length} von ${built.pages} Seiten` : built.pages === 1 ? '1 Seite' : `${built.pages} Seiten`}</span>
              {finalPdf && <span className="pill">{formatBytes(finalPdf.blob.size)}</span>}
              <span className="pill">{files.length === 1 ? '1 Datei' : `${files.length} Dateien`}</span>
            </div>
          </div>
        </div>
        <ul className="page-grid" aria-label="Seiten des PDFs">
          {edits.map((e, i) => (
            <li key={e.source} className="page-cell">
              <div className="page-thumb">
                {thumbs[e.source] ? (
                  <img src={thumbs[e.source]} alt={`Seite ${i + 1}`} style={{ transform: `rotate(${e.rotation}deg)` }} />
                ) : (
                  <span className="hint">…</span>
                )}
                <span className="page-no">{i + 1}</span>
              </div>
              <div className="page-actions">
                <button type="button" className="btn btn-ghost btn-icon" aria-label={`Seite ${i + 1} nach vorn`} disabled={busy || i === 0} onClick={() => setEdits(movePage(edits, i, -1))}>
                  <ArrowLeft size={14} aria-hidden="true" />
                </button>
                <button type="button" className="btn btn-ghost btn-icon" aria-label={`Seite ${i + 1} nach hinten`} disabled={busy || i === edits.length - 1} onClick={() => setEdits(movePage(edits, i, 1))}>
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
                <button type="button" className="btn btn-ghost btn-icon" aria-label={`Seite ${i + 1} drehen`} disabled={busy} onClick={() => setEdits(rotatePage(edits, i))}>
                  <RotateCw size={14} aria-hidden="true" />
                </button>
                <button type="button" className="btn btn-ghost btn-icon" aria-label={`Seite ${i + 1} löschen`} disabled={busy} onClick={() => setEdits(removePage(edits, i))}>
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
        {edits.length === 0 && <p className="notice">Es muss mindestens eine Seite bleiben. Geh zurück und wähle Dateien neu.</p>}
        {changed && (
          <button type="button" className="link-btn" disabled={busy} onClick={() => setEdits(initialPages(built.pages))}>
            Änderungen zurücksetzen
          </button>
        )}
        <a className="btn" href={shown.url} target="_blank" rel="noopener" aria-disabled={updating}>
          <ExternalLink size={16} aria-hidden="true" /> Vorschau ansehen
        </a>
        {access.can('summarize') && (
        <label className="option-card">
          <input type="checkbox" checked={useAi} disabled={busy} onChange={(e) => setUseAi(e.target.checked)} />
          <span>
            <strong>Zusätzlich mit KI zusammenfassen</strong>
            <span className="hint">{access.isAdmin ? 'Nimmt etwas vom Monatsbudget, leere' : 'Leere'} und doppelte Seiten werden dabei ausgelassen.</span>
            {useAi && changed && <span className="hint">Die KI liest die Originaldateien, auch Seiten, die du aus dem PDF gelöscht hast.</span>}
          </span>
        </label>
        )}
        {bar}
        {errorBox}
        <div className="upload-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => setBuilt(null)}>
            Zurück
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || updating || !finalPdf} onClick={() => void upload()}>
            <UploadCloud size={18} aria-hidden="true" /> {busy ? 'Einen Moment …' : updating ? 'Aktualisiere …' : 'Jetzt hochladen'}
          </button>
        </div>
      </div>
    );
  }

  // Schritt 1: Stunde angeben, Dateien wählen und zusammenfügen
  const canBuild = subjectId !== '' && (isUni || quarter !== '') && files.length > 0 && !busy;
  if (state.subjects.length === 0) {
    return (
      <div className="card stack upload-card" data-no-reload>
        <p className="muted">{isUni ? 'Lege zuerst unter Studium → Module ein Modul an.' : 'Lege zuerst unter Fächer ein Fach an.'}</p>
      </div>
    );
  }
  return (
    <div className="card stack upload-card" data-no-reload>
      <Stepper step={1} />

      <section className="stack upload-section">
        <h3 className="section-title">Zu welcher Stunde?</h3>
        <div className="stack" style={{ gap: 6 }}>
          <span className="form-label">{terms.subject}</span>
          <div className="chip-grid" role="group" aria-label={terms.subject}>
            {state.subjects.map((sub) => (
              <button key={sub.id} type="button" className="chip" aria-pressed={subjectId === sub.id} disabled={busy} onClick={() => setSubjectId(sub.id)}>
                <i className="dot" style={{ background: sub.color }} />
                {sub.name}
                {guess === sub.id && <span className="hint">aus Stundenplan</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="grid cols-2">
          <label className="field">
            <span>Datum der Stunde</span>
            <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} disabled={busy} />
          </label>
          <label className="field">
            <span>{isUni ? 'Dozent/in' : 'Lehrkraft'}</span>
            <input
              className="input"
              value={teacher}
              placeholder={isUni ? 'zum Beispiel Prof. Müller' : 'zum Beispiel Müller'}
              maxLength={40}
              onChange={(e) => {
                setTeacher(e.target.value);
                setTouched({ ...touched, teacher: true });
              }}
              disabled={busy}
            />
          </label>
        </div>
        {!isUni && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="form-label">Q-Phase</span>
            <div className="diff-pick quarter-pick" role="group" aria-label="Q-Phase">
              {QUARTERS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="diff-pill quarter-pill"
                  aria-pressed={quarter === q}
                  disabled={busy}
                  onClick={() => {
                    setQuarter(q);
                    setTouched({ ...touched, quarter: true });
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="stack upload-section">
        <h3 className="section-title">Fotos oder PDFs</h3>
        <label
          className={`dropzone${dragging ? ' over' : ''}${busy ? ' disabled' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            disabled={busy}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <UploadCloud size={34} aria-hidden="true" />
          <strong>Hierher ziehen oder tippen</strong>
          <span className="hint">Mehrere Dateien möglich, du kannst später noch welche hinzufügen.</span>
        </label>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn camera-btn" disabled={busy} onClick={() => cameraRef.current?.click()}>
            <Camera size={16} aria-hidden="true" /> Foto aufnehmen
          </button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {files.length > 0 && (
          <ol className="file-cards" aria-label="Gewählte Dateien, in dieser Reihenfolge zusammengefügt">
            {files.map((f, i) => (
              <li key={`${f.name}${f.size}${f.lastModified}`} className="file-card">
                <span className="file-num">{i + 1}</span>
                <span className="file-thumb" aria-hidden="true">
                  {previews[i] ? <img src={previews[i]!} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} /> : <FileText size={22} />}
                </span>
                <span className="file-info">
                  <span className="file-name">{f.name}</span>
                  <span className="hint">
                    {isPdfFile(f) ? 'PDF' : 'Foto'} · {formatBytes(f.size)}
                  </span>
                </span>
                <span className="file-actions">
                  <button type="button" className="btn btn-ghost btn-icon" aria-label={`${f.name} nach oben`} disabled={busy || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp size={15} aria-hidden="true" />
                  </button>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label={`${f.name} nach unten`} disabled={busy || i === files.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown size={15} aria-hidden="true" />
                  </button>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label={`${f.name} entfernen`} disabled={busy} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    <X size={15} aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {subjectId !== '' && files.length > 0 && (
        <div className="name-pill" title="So heißt das PDF">
          <FileText size={16} aria-hidden="true" />
          <span>{name}</span>
        </div>
      )}
      {bar}
      {errorBox}
      <button type="button" className="btn btn-primary btn-wide" disabled={!canBuild} onClick={() => void build()}>
        {busy ? 'Füge zusammen …' : 'Zu PDF zusammenfügen'}
      </button>
      {!canBuild && !busy && (
        <p className="hint" style={{ textAlign: 'center' }}>
          {subjectId === '' ? (isUni ? 'Wähle ein Modul.' : 'Wähle ein Fach.') : !isUni && quarter === '' ? 'Wähle die Q-Phase, sie gehört in den Dateinamen.' : files.length === 0 ? 'Füge mindestens eine Datei hinzu.' : ''}
        </p>
      )}
    </div>
  );
}
