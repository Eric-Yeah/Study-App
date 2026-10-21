import { QUARTERS, folderFileName, formatBytes, groupNotesByWeek, highlightRanges, isQuarter, searchNotes, searchTokens, pdfFileName, toIsoDate, type Quarter, type Subject, type WorksheetPage, type WorksheetSummary } from '@study/core';
import { ChevronDown, Download, FolderDown, Search, Trash2, Upload, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { formatDateShort, formatNoteDay, formatWeekLabel } from '../lib/format';
import { budgetUsedShare, downloadDocument, dropImagesIfSure, noteImagePaths, removeDocument, removeNoteImages, summarizeWorksheet, WorksheetError } from '../lib/worksheetApi';
import { AutoTextarea } from '../components/AutoTextarea';
import { buildFolder, saveBlob } from '../lib/folderPdf';
import { Navigate, useSearchParams } from 'react-router-dom';
import { NoteUpload, type Created } from './NoteUpload';
import { useStore, type LessonNote } from '../state/store';
import { useAccess } from '../lib/access';

const LISTS = [
  { key: 'kernaussagen', label: 'Kernaussagen' },
  { key: 'begriffe', label: 'Begriffe' },
  { key: 'formeln', label: 'Formeln' },
  { key: 'offene_fragen', label: 'Offene Fragen' },
] as const;

type ListKey = (typeof LISTS)[number]['key'];

const toLines = (items: string[]) => items.join('\n');
const fromLines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** Text mit hervorgehobenen Suchwörtern. */
function Marked({ text, tokens }: { text: string; tokens: string[] }) {
  const ranges = highlightRanges(text, tokens);
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([from, to], i) => {
    if (from > at) parts.push(<Fragment key={`t${i}`}>{text.slice(at, from)}</Fragment>);
    parts.push(<mark key={`m${i}`}>{text.slice(from, to)}</mark>);
    at = to;
  });
  if (at < text.length) parts.push(<Fragment key="end">{text.slice(at)}</Fragment>);
  return <>{parts}</>;
}

/** Eine bearbeitbare Karte. Gespeichert wird, sobald ein Feld verlassen wird. */
function NoteCard({
  note,
  subject,
  highlight,
  open,
  onToggle,
  tokens = [],
  snippet = null,
}: {
  note: LessonNote;
  subject: Subject | undefined;
  highlight: boolean;
  open: boolean;
  onToggle: () => void;
  tokens?: string[]; // Suchwörter, werden hervorgehoben
  snippet?: { label: string; text: string } | null; // Fundstelle statt der ersten Aussage
}) {
  const { dispatch } = useStore();
  const access = useAccess();
  const [title, setTitle] = useState(note.title);
  const [lists, setLists] = useState<Record<ListKey, string>>(() => listsOf(note));
  const [teacher, setTeacher] = useState(note.teacher);
  const [quarter, setQuarter] = useState<Quarter | ''>(note.quarter ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);

  // Änderungen von einem anderen Gerät übernehmen, solange hier nicht gerade getippt wird.
  useEffect(() => {
    if (focused.current) return;
    setTitle(note.title);
    setLists(listsOf(note));
    setTeacher(note.teacher);
    setQuarter(note.quarter ?? '');
  }, [note]);

  // Speichert, wenn sich etwas geändert hat: beim Verlassen eines Feldes und eine Sekunde nach der letzten Eingabe.
  const commit = () => {
    const summary: WorksheetSummary = {
      thema: title.trim(),
      kernaussagen: fromLines(lists.kernaussagen),
      begriffe: fromLines(lists.begriffe),
      formeln: fromLines(lists.formeln),
      offene_fragen: fromLines(lists.offene_fragen),
      lesbarkeit: note.summary?.lesbarkeit ?? 'sicher',
    };
    const meta = { teacher: teacher.trim(), quarter: quarter || null };
    if (JSON.stringify(summary) === JSON.stringify(note.summary) && title.trim() === note.title && meta.teacher === note.teacher && meta.quarter === note.quarter) return;
    dispatch({ type: 'upsertNote', note: { ...note, title: title.trim(), summary, ...meta } });
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const save = () => {
    focused.current = false;
    commit();
  };
  useEffect(() => {
    const id = window.setTimeout(() => commitRef.current(), 1000);
    return () => window.clearTimeout(id);
  }, [title, lists, teacher, quarter]);

  const readCloser = async (ask = true) => {
    if (ask && !confirm('Die Zusammenfassung wird neu erstellt. Änderungen, die du daran gemacht hast, gehen dabei verloren.')) return;
    setBusy(true);
    setError(null);
    try {
      const paths = await noteImagePaths(note.id);
      if (paths.length === 0) throw new WorksheetError('Dieses Blatt wurde nur als Text gelesen, dafür gibt es keine Bilder zum genaueren Lesen.');
      const pages: WorksheetPage[] = paths.map((path) => ({ type: 'image', path }));
      const { summary, effort } = await summarizeWorksheet(note.id, pages, 'high');
      dispatch({
        type: 'upsertNote',
        note: { ...note, title: summary.thema || note.title, summary, legibility: summary.lesbarkeit, effort },
      });
      await dropImagesIfSure(note.id, summary.lesbarkeit);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Das genauere Lesen ist fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(note.pdfPath ? 'Diese Notiz mit dem PDF und den hochgeladenen Bildern löschen?' : 'Diese Notiz und die hochgeladenen Bilder löschen?')) return;
    await removeNoteImages(note.id);
    if (note.pdfPath) await removeDocument(note.pdfPath).catch(() => {});
    dispatch({ type: 'deleteNote', id: note.id });
  };

  const docName = pdfFileName({ date: note.lessonDate, subject: subject?.name ?? '', teacher: note.teacher, quarter: note.quarter });
  const saveDocument = async () => {
    if (!note.pdfPath) return;
    setBusy(true);
    setError(null);
    try {
      saveBlob(await downloadDocument(note.pdfPath), docName);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Das PDF konnte nicht geladen werden.');
    } finally {
      setBusy(false);
    }
  };

  const unsure = note.legibility === 'unsicher';

  // Noch ohne Zusammenfassung: wird gerade erstellt (auch auf einem anderen Gerät) oder ist nicht fertig geworden.
  if (!note.summary) {
    const stale = note.createdAt !== '' && Date.now() - Date.parse(note.createdAt) > 10 * 60_000;
    return (
      <article className="note-row" style={{ ['--c' as string]: subject?.color ?? 'var(--ink-3)' }} role="status">
        <div className="note-head static">
          <div className="note-main">
            <div className="note-title">{stale ? 'Nicht fertig geworden' : 'Wird zusammengefasst …'}</div>
            <div className="note-meta">{subject?.name ?? 'Ohne Fach'}</div>
          </div>
          {stale && (
            <button type="button" className="btn" disabled={busy} onClick={() => void readCloser(false)}>
              {busy ? 'Versuche es …' : 'Erneut versuchen'}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Notiz löschen" onClick={() => void remove()}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
      </article>
    );
  }

  const preview = note.summary.kernaussagen[0] ?? '';

  return (
    <article className={`note-row${open ? ' open' : ''}${highlight ? ' fresh' : ''}`} style={{ ['--c' as string]: subject?.color ?? 'var(--ink-3)' }}>
      <button type="button" className="note-head" aria-expanded={open} onClick={onToggle}>
        <div className="note-main">
          <div className="note-title">{note.title ? <Marked text={note.title} tokens={tokens} /> : 'Ohne Titel'}</div>
          <div className="note-meta">
            {subject?.name ?? 'Ohne Fach'}
            {note.quarter ? ` · ${note.quarter}` : ''}
            {!open && snippet ? (
              <>
                {' · '}
                {snippet.label}: <Marked text={snippet.text} tokens={tokens} />
              </>
            ) : (
              preview && !open && ` · ${preview}`
            )}
          </div>
        </div>
        {unsure && <span className="tag warn">unsicher</span>}
        <ChevronDown size={18} className="note-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="note-body stack">
          <p className="hint">
            {formatDateShort(note.lessonDate)}
            {note.effort ? ` · gelesen mit ${note.effort === 'low' ? 'Text' : note.effort === 'medium' ? 'Bild' : 'genauem Blick'}` : ''}
          </p>
          {note.pdfPath && (
            <div className="note-doc">
              <span className="file-name">{docName}</span>
              <button type="button" className="btn" disabled={busy} onClick={() => void saveDocument()}>
                <Download size={16} aria-hidden="true" /> PDF speichern
              </button>
            </div>
          )}
          <div className="grid cols-2">
            <label className="field">
              <span>Lehrkraft</span>
              <input
                className="input"
                value={teacher}
                maxLength={40}
                onFocus={() => (focused.current = true)}
                onChange={(e) => setTeacher(e.target.value)}
                onBlur={save}
              />
            </label>
            <label className="field">
              <span>Q-Phase</span>
              <select
                className="input"
                value={quarter}
                onChange={(e) => {
                  setQuarter(isQuarter(e.target.value) ? e.target.value : '');
                }}
                onBlur={save}
              >
                <option value="">–</option>
                {QUARTERS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Thema</span>
            <input
              className="input"
              value={title}
              placeholder="Thema des Blatts"
              onFocus={() => (focused.current = true)}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={save}
            />
          </label>
          <div className="note-fields">
            {LISTS.map(({ key, label }) => (
              <label key={key} className="field">
                <span>{label}</span>
                <AutoTextarea
                  className="input note-area"
                  rows={2}
                  value={lists[key]}
                  placeholder="Ein Eintrag pro Zeile"
                  onFocus={() => (focused.current = true)}
                  onChange={(e) => setLists({ ...lists, [key]: e.target.value })}
                  onBlur={save}
                />
              </label>
            ))}
          </div>
          {unsure && access.can('summarize') && (
            <div className="stack" style={{ gap: 6 }}>
              <p className="hint">Manches war schwer lesbar. „Genauer lesen“ schickt die Bilder noch einmal mit mehr Aufwand an die KI.</p>
              <button type="button" className="btn" disabled={busy} onClick={() => void readCloser()}>
                {busy ? 'Lese genauer …' : 'Genauer lesen'}
              </button>
            </div>
          )}
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
          <div>
            <button type="button" className="btn btn-ghost" onClick={() => void remove()}>
              <Trash2 size={16} aria-hidden="true" /> Notiz löschen
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

const listsOf = (n: LessonNote): Record<ListKey, string> => ({
  kernaussagen: toLines(n.summary?.kernaussagen ?? []),
  begriffe: toLines(n.summary?.begriffe ?? []),
  formeln: toLines(n.summary?.formeln ?? []),
  offene_fragen: toLines(n.summary?.offene_fragen ?? []),
});

/** Die Notizen-Ansicht (Reiter Notizen im Bereich Notizen). */
function NotesTab() {
  const { state } = useStore();
  const today = toIsoDate(new Date());
  const [params, setParams] = useSearchParams();

  const [open, setOpen] = useState(false);
  // /notizen?neu=1 (zum Beispiel aus dem Schnell-hinzufügen-Fenster) öffnet gleich das Hochladen
  const wantsNew = params.get('neu') === '1';
  useEffect(() => {
    if (!wantsNew) return;
    setOpen(true);
    setParams({}, { replace: true });
  }, [wantsNew, setParams]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const access = useAccess();
  const [used, setUsed] = useState<number | null>(null);
  const loadUsage = () => {
    if (access.isAdmin) void budgetUsedShare().then(setUsed);
  };
  useEffect(loadUsage, [access.isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ansicht: Fachfilter, nach Woche und Tag geordnet, ältere Wochen zugeklappt, eine Notiz offen.
  const [filter, setFilter] = useState<string | null>(null); // null = alle, '' = Notizen ohne Fach
  const [openId, setOpenId] = useState<string | null>(null);
  const [weekToggled, setWeekToggled] = useState<Record<string, boolean>>({});
  const subjectOf = useMemo(() => new Map(state.subjects.map((x) => [x.id, x])), [state.subjects]);
  const filterSubjects = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of state.notes) counts.set(n.subjectId ?? '', (counts.get(n.subjectId ?? '') ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count, name: subjectOf.get(id)?.name ?? 'Ohne Fach', color: subjectOf.get(id)?.color }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [state.notes, subjectOf]);
  const activeFilter = filter !== null && filterSubjects.some((x) => x.id === filter) ? filter : null;
  const [query, setQuery] = useState('');
  const [quarterFilter, setQuarterFilter] = useState<Quarter | null>(null);
  const quartersInNotes = useMemo(() => QUARTERS.filter((q) => state.notes.some((n) => n.quarter === q)), [state.notes]);
  const activeQuarter = quarterFilter && quartersInNotes.includes(quarterFilter) ? quarterFilter : null;
  const inFilter = useMemo(
    () =>
      state.notes.filter(
        (n) => (activeFilter === null || (n.subjectId ?? '') === activeFilter) && (activeQuarter === null || n.quarter === activeQuarter),
      ),
    [state.notes, activeFilter, activeQuarter],
  );
  const tokens = useMemo(() => searchTokens(query), [query]);
  const searching = tokens.length > 0;
  // Bei einer Suche: Treffer nach Wertung. Sonst: nach Woche und Tag.
  const hits = useMemo(() => {
    if (!searching) return [];
    const newestFirst = [...inFilter].sort((a, b) => b.lessonDate.localeCompare(a.lessonDate) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return searchNotes(newestFirst, query, (n) => subjectOf.get(n.subjectId ?? '')?.name ?? '');
  }, [searching, inFilter, query, subjectOf]);
  const weeks = useMemo(() => groupNotesByWeek(inFilter, today), [inFilter, today]);
  // Lernordner: alle PDFs der gerade sichtbaren Notizen (Fach, Q-Phase, Suche), älteste zuerst, als eine PDF
  const [folderBusy, setFolderBusy] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const folderNotes = useMemo(
    () =>
      (searching ? hits.map((h) => h.note) : inFilter)
        .filter((n) => n.pdfPath)
        .sort((a, b) => a.lessonDate.localeCompare(b.lessonDate) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
    [searching, hits, inFilter],
  );
  const saveFolder = async () => {
    setFolderError(null);
    setFolderBusy('Lade PDFs …');
    try {
      const { blob, pages } = await buildFolder(
        folderNotes.map((n) => n.pdfPath as string),
        (done, total) => setFolderBusy(`PDF ${Math.min(done + 1, total)} von ${total} …`),
      );
      const subjectName = activeFilter === null ? null : (subjectOf.get(activeFilter)?.name ?? 'Ohne Fach');
      saveBlob(blob, folderFileName(subjectName, folderNotes));
      setFolderBusy(null);
      setFolderError(null);
      setCreated({ noteId: '', message: `Lernordner gespeichert: ${pages} Seiten, ${formatBytes(blob.size)}.`, warn: false });
    } catch (e) {
      setFolderBusy(null);
      setFolderError(e instanceof Error ? e.message : 'Der Lernordner konnte nicht erstellt werden.');
    }
  };
  const weekOpen = (start: string, weeksAgo: number, ids: string[]) =>
    weekToggled[start] ?? (weeksAgo <= 1 || (fresh !== null && ids.includes(fresh)) || (openId !== null && ids.includes(openId)));

  
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Notizen</h1>
          <p className="sub">
            {access.can('summarize') ? 'Arbeitsblätter zu einem PDF zusammenfügen, hochladen und auf Wunsch von der KI zusammenfassen lassen.' : 'Arbeitsblätter zu einem PDF zusammenfügen, hochladen und wiederfinden.'}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => {
            setCreated(null);
            setOpen(!open);
          }}
          aria-expanded={open}>
          <Upload size={18} aria-hidden="true" /> Blatt hochladen
        </button>
      </div>

      {open && (
        <NoteUpload
          onCreated={(c) => {
            setFresh(c.noteId);
            setOpenId(c.noteId);
            setCreated(c);
            setOpen(false);
          }}
          onSettled={loadUsage}
        />
      )}

      {created?.message && (
        <p className={`notice${created.warn ? '' : ' ok'}`} role="status">
          {created.message}
        </p>
      )}

      {access.isAdmin && used !== null && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="between">
            <span className="hint">KI-Budget diesen Monat</span>
            <span className={`hint${used >= 0.9 ? ' warn-text' : ''}`}>
              {used >= 1 ? 'aufgebraucht' : `${Math.round(used * 100)} % verbraucht`}
            </span>
          </div>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(used * 100))} aria-label="KI-Budget diesen Monat">
            <i style={{ width: `${Math.min(100, used * 100)}%`, background: used >= 0.9 ? 'var(--warn)' : undefined }} />
          </div>
        </div>
      )}

      {state.notes.length === 0 && !open && (
        <div className="card empty">
          <p className="muted">Noch keine Notizen. Tippe auf „Blatt hochladen“ und wähle Fotos oder eine PDF.</p>
        </div>
      )}

      {state.notes.length > 0 && (
        <div className="note-search">
          <Search size={18} aria-hidden="true" className="note-search-icon" />
          <input
            className="input"
            type="search"
            value={query}
            placeholder="Notizen durchsuchen: Titel, Begriffe, Formeln, Lehrkraft …"
            aria-label="Notizen durchsuchen"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          />
          {query && (
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Suche leeren" onClick={() => setQuery('')}>
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {filterSubjects.length > 1 && (
        <div className="row note-filter" role="group" aria-label="Nach Fach filtern">
          <button type="button" className="chip" aria-pressed={activeFilter === null} onClick={() => setFilter(null)}>
            Alle
          </button>
          {filterSubjects.map((f) => (
            <button key={f.id} type="button" className="chip" aria-pressed={activeFilter === f.id} onClick={() => setFilter(f.id)}>
              <i className="dot" style={{ background: f.color ?? 'var(--ink-3)' }} />
              {f.name}
              <span className="hint">{f.count}</span>
            </button>
          ))}
        </div>
      )}

      {quartersInNotes.length > 1 && (
        <div className="row note-filter" role="group" aria-label="Nach Q-Phase filtern">
          <button type="button" className="chip" aria-pressed={activeQuarter === null} onClick={() => setQuarterFilter(null)}>
            Alle Q-Phasen
          </button>
          {quartersInNotes.map((q) => (
            <button key={q} type="button" className="chip" aria-pressed={activeQuarter === q} onClick={() => setQuarterFilter(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      {folderNotes.length >= 2 && (
        <div className="stack" style={{ gap: 6 }}>
          <button type="button" className="btn" disabled={folderBusy !== null} onClick={() => void saveFolder()}>
            <FolderDown size={16} aria-hidden="true" /> {folderBusy ?? `Lernordner als PDF speichern (${folderNotes.length} Dokumente)`}
          </button>
          {folderError && (
            <p className="notice" role="alert">
              {folderError}
            </p>
          )}
        </div>
      )}

      {searching && (
        <section className="stack" aria-live="polite">
          <p className="hint">{hits.length === 0 ? 'Keine Treffer.' : hits.length === 1 ? '1 Treffer' : `${hits.length} Treffer`}</p>
          {hits.length > 0 && (
            <div className="note-list">
              {hits.map(({ note: n, snippet }) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  subject={subjectOf.get(n.subjectId ?? '')}
                  highlight={n.id === fresh}
                  open={openId === n.id}
                  onToggle={() => setOpenId(openId === n.id ? null : n.id)}
                  tokens={tokens}
                  snippet={snippet}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {!searching && weeks.map((w) => {
        const ids = w.days.flatMap((d) => d.notes.map((n) => n.id));
        const isOpen = weekOpen(w.start, w.weeksAgo, ids);
        return (
          <section key={w.start} className="stack note-week">
            <button
              type="button"
              className="note-week-head"
              aria-expanded={isOpen}
              onClick={() => setWeekToggled({ ...weekToggled, [w.start]: !isOpen })}
            >
              <ChevronDown size={18} className="note-chevron" aria-hidden="true" />
              <h2>{formatWeekLabel(w)}</h2>
              <span className="hint">{w.count === 1 ? '1 Notiz' : `${w.count} Notizen`}</span>
            </button>
            {isOpen &&
              w.days.map((d) => (
                <div key={d.date} className="stack" style={{ gap: 6 }}>
                  <h3 className="note-day">{formatNoteDay(d.date, today)}</h3>
                  <div className="note-list">
                    {d.notes.map((n) => (
                      <NoteCard
                        key={n.id}
                        note={n}
                        subject={subjectOf.get(n.subjectId ?? '')}
                        highlight={n.id === fresh}
                        open={openId === n.id}
                        onToggle={() => setOpenId(openId === n.id ? null : n.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}

/** Notizen. Die alten Adressen /notizen?ansicht=karten und ?ansicht=klausuren führen zu den neuen Seiten. */
export function Notes() {
  const [params] = useSearchParams();
  const view = params.get('ansicht');
  if (view === 'karten') return <Navigate to="/karten" replace />;
  if (view === 'klausuren') return <Navigate to="/korrektur" replace />;
  return <NotesTab />;
}
