import { CONFIG, lastTeacher, sanitizeStyle, styleIsEmpty, teacherFor, toIsoDate, type StyleRecord, type TaskStyle } from '@study/core';
import { ArrowLeft, ChevronDown, GraduationCap, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PagePicker } from '../components/exam/PagePicker';
import { StyleEditor } from '../components/exam/StyleEditor';
import { useUserId } from '../lib/auth';
import { formatDateShort, uid } from '../lib/format';
import { learnStyle, StyleError } from '../lib/styleApi';
import { preparePages, type Progress } from '../lib/worksheetFiles';
import { useStore } from '../state/store';
import { useAccess } from '../lib/access';

const L = CONFIG.style;

/**
 * Stil der echten Aufgabenblätter eines Fachs: Blätter der Lehrkraft hochladen, die KI liest Aufbau und Formulierungen ab,
 * der Nutzer sieht und ändert das Ergebnis. Übungsklausuren folgen diesem Stil (Lehrkraft zuerst, sonst alle Blätter des Fachs).
 */
export function StylePage() {
  const { subjectId = '' } = useParams();
  const { state, dispatch, flush } = useStore();
  const access = useAccess();
  const userId = useUserId();
  const today = toIsoDate(new Date());
  const subject = state.subjects.find((s) => s.id === subjectId);
  const sheets = useMemo(() => state.taskStyles.filter((x) => x.subjectId === subjectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [state.taskStyles, subjectId]);

  const [files, setFiles] = useState<File[]>([]);
  const [teacher, setTeacher] = useState('');
  const [teacherTouched, setTeacherTouched] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [learned, setLearned] = useState<TaskStyle | null>(null);
  const [original, setOriginal] = useState<TaskStyle | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, TaskStyle>>({});

  useEffect(() => {
    if (subjectId && !teacherTouched) setTeacher(teacherFor(state.timetable, subjectId, state.subjects, today) || lastTeacher(state.examReviews, subjectId) || sheets[0]?.teacher || '');
  }, [subjectId, teacherTouched, state.timetable, state.subjects, state.examReviews, sheets, today]);

  if (!subject) {
    return (
      <div className="card stack">
        <p className="muted">Dieses Fach gibt es nicht mehr.</p>
        <Link className="btn" to="/notizen?ansicht=klausuren">
          Zu den Klausuren
        </Link>
      </div>
    );
  }
  const full = sheets.length >= L.maxSheets;

  const learn = async () => {
    setBusy(true);
    setError(null);
    setLearned(null);
    try {
      const prepared = (await preparePages(files, [], (p) => setProgress(p))).pages;
      if (prepared.length === 0) throw new StyleError('Auf den Seiten war nichts zu lesen.');
      if (prepared.length > L.maxPages) throw new StyleError(`Das sind ${prepared.length} Seiten, ein Blatt darf höchstens ${L.maxPages} haben. Lade weniger Seiten hoch und lerne den Rest als zweites Blatt.`);
      setProgress({ done: 0, total: 0, label: 'Die KI liest den Stil, das dauert etwa eine halbe Minute …' });
      const got = await learnStyle(userId, subjectId, teacher.trim(), prepared);
      setOriginal(got);
      setLearned(got);
    } catch (e) {
      setError(e instanceof StyleError || e instanceof Error ? e.message : 'Der Stil konnte nicht gelesen werden.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const saveLearned = async () => {
    if (!learned) return;
    const style = sanitizeStyle(learned, L);
    if (styleIsEmpty(style)) {
      setError('Der Stil ist leer. Trage etwas ein oder verwirf ihn.');
      return;
    }
    const record: StyleRecord = {
      id: uid(),
      subjectId,
      teacher: teacher.trim(),
      title: title.trim().slice(0, L.maxTitleChars) || `Blatt vom ${formatDateShort(today)}`,
      style,
      edited: original !== null && JSON.stringify(style) !== JSON.stringify(sanitizeStyle(original, L)),
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'upsertStyle', style: record });
    await flush();
    setLearned(null);
    setFiles([]);
    setTitle('');
    setOpen(record.id);
  };

  const saveSheet = (sheet: StyleRecord) => {
    const next = sanitizeStyle(draft[sheet.id] ?? sheet.style, L);
    if (styleIsEmpty(next)) return;
    dispatch({ type: 'upsertStyle', style: { ...sheet, style: next, edited: true } });
    setDraft((d) => {
      const { [sheet.id]: _gone, ...rest } = d;
      return rest;
    });
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Aufgabenstil · {subject.name}</h1>
          <p className="sub">Lade Aufgabenblätter deiner Lehrkraft hoch. Die KI liest ab, wie sie Aufgaben stellt, und Übungsklausuren folgen diesem Stil.</p>
        </div>
        <Link className="btn" to="/notizen?ansicht=klausuren">
          <ArrowLeft size={16} aria-hidden="true" /> Zurück
        </Link>
      </div>

      <section className="stack" style={{ gap: 8 }}>
        <h2 className="section-head">Gelernte Blätter</h2>
        {sheets.length === 0 ? (
          <div className="card empty stack" style={{ gap: 8 }}>
            <GraduationCap size={28} aria-hidden="true" />
            <p className="muted">Noch kein Blatt gelernt. Mit jedem Blatt wird der Stil genauer. Ohne Blätter nutzt die Übungsklausur den Standardaufbau und die Profile deiner echten Klausuren.</p>
          </div>
        ) : (
          <ul className="review-rows">
            {sheets.map((sh) => {
              const isOpen = open === sh.id;
              const value = draft[sh.id] ?? sh.style;
              const changed = draft[sh.id] !== undefined;
              return (
                <li key={sh.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : sh.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 16, border: 0, background: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}
                  >
                    <span className="review-row-main">
                      <strong>{sh.title}</strong>
                      <span className="hint">
                        {sh.teacher ? `${sh.teacher} · ` : ''}
                        {formatDateShort(sh.createdAt.slice(0, 10))}
                        {sh.edited ? ' · von dir geändert' : ''}
                      </span>
                    </span>
                    <ChevronDown size={18} aria-hidden="true" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} />
                  </button>
                  {isOpen && (
                    <div className="stack" style={{ gap: 12, padding: '0 16px 16px' }}>
                      <StyleEditor value={value} onChange={(next) => setDraft((d) => ({ ...d, [sh.id]: next }))} />
                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-primary" disabled={!changed} onClick={() => saveSheet(sh)}>
                          Änderungen speichern
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            if (window.confirm('Dieses Blatt aus dem Stil entfernen?')) dispatch({ type: 'deleteStyle', id: sh.id });
                          }}
                        >
                          <Trash2 size={16} aria-hidden="true" /> Entfernen
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h2 className="section-head">Neues Blatt lernen</h2>
        {learned ? (
          <div className="card stack">
            <h3 className="section-title">Das hat die KI abgelesen</h3>
            <StyleEditor value={learned} onChange={setLearned} />
            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => void saveLearned()}>
                Stil speichern
              </button>
              <button type="button" className="btn" onClick={() => setLearned(null)}>
                Verwerfen
              </button>
            </div>
          </div>
        ) : (
          <div className="card stack upload-card">
            <div className="grid cols-2">
              <label className="field">
                <span>Lehrkraft</span>
                <input
                  className="input"
                  value={teacher}
                  maxLength={40}
                  disabled={busy}
                  placeholder="zum Beispiel Müller"
                  onChange={(e) => {
                    setTeacher(e.target.value);
                    setTeacherTouched(true);
                  }}
                />
              </label>
              <label className="field">
                <span>Name des Blatts (freiwillig)</span>
                <input className="input" value={title} maxLength={L.maxTitleChars} disabled={busy} placeholder="zum Beispiel Klausur Q2" onChange={(e) => setTitle(e.target.value)} />
              </label>
            </div>
            <PagePicker id="stil" files={files} onChange={setFiles} disabled={busy || full} prompt="Aufgabenblatt oder Klausur hinzufügen" />
            <p className="hint">
              Es zählt nur die Aufgabenstellung, keine Lösung. Die KI liest höchstens {L.maxPages} Seiten{access.isAdmin ? ' (das günstige Haiku, etwa 1 bis 3 Cent)' : ''}. Die Seiten werden danach gelöscht, gespeichert wird nur der Stil, den du prüfen und ändern kannst.
              {full ? ` Du hast schon ${L.maxSheets} Blätter, entferne eines, um ein neues zu lernen.` : ''}
            </p>
            {busy && progress && (
              <div className="stack" style={{ gap: 6 }} role="status">
                <div className={`bar${progress.total === 0 ? ' bar-wait' : ''}`} aria-hidden="true">
                  <i style={{ width: progress.total ? `${Math.max(6, (progress.done / progress.total) * 100)}%` : undefined }} />
                </div>
                <p className="hint">{progress.label}</p>
              </div>
            )}
            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="btn btn-primary btn-wide" disabled={busy || full || files.length === 0} onClick={() => void learn()}>
              <Sparkles size={18} aria-hidden="true" /> {busy ? 'Einen Moment …' : 'Stil lernen'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
