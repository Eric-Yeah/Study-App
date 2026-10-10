import {
  LEVEL_LABELS,
  afbShares,
  hasSolutions,
  pointsLabel,
  reviewView,
  reviewsOfPractice,
  rubricFor,
  taskOverview,
  toIsoDate,
} from '@study/core';
import { AlertTriangle, ArrowLeft, ClipboardCheck, Download, Eye, FileText, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { LevelRating } from '../components/exam/LevelRating';
import { buildExamPdf, buildHorizonPdf, loadExamFonts, practiceFileName, type ExamPdfInfo } from '../lib/examPdf';
import { saveBlob } from '../lib/folderPdf';
import { formatDateShort } from '../lib/format';
import { generateSolutions } from '../lib/practiceApi';
import { useStore } from '../state/store';
import { useAccess } from '../lib/access';

const num = (n: number) => String(n).replace('.', ',');
const shorten = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()} …` : s);

/** Eine Übungsklausur ansehen: Aufgaben, PDFs, Lösung korrigieren lassen, Rückmeldung zur Schwierigkeit. */
export function PracticeView() {
  const { id = '' } = useParams();
  const { state, dispatch } = useStore();
  const access = useAccess();
  const navigate = useNavigate();
  const location = useLocation();
  const [solutionsError, setSolutionsError] = useState((location.state as { solutionsError?: string } | null)?.solutionsError ?? '');
  const [busy, setBusy] = useState<'' | 'klausur' | 'erwartung' | 'solutions'>('');
  const [error, setError] = useState<string | null>(null);
  const practice = state.practiceExams.find((p) => p.id === id);
  const subject = state.subjects.find((s) => s.id === practice?.subjectId);
  const reviews = useMemo(() => reviewsOfPractice(state.examReviews, id), [state.examReviews, id]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  if (!practice) {
    return (
      <div className="card stack">
        <p className="muted">Diese Übungsklausur gibt es nicht mehr.</p>
        <Link className="btn" to="/notizen?ansicht=klausuren">
          Zu den Klausuren
        </Link>
      </div>
    );
  }
  const { content, meta } = practice;
  const tasks = taskOverview(content);
  const shares = afbShares(content);
  const solved = hasSolutions(content);
  const levelLabel = LEVEL_LABELS[practice.level];
  const date = practice.createdAt ? toIsoDate(new Date(practice.createdAt)) : toIsoDate(new Date());
  const info: ExamPdfInfo = {
    subject: subject?.name ?? 'Übung',
    levelLabel,
    quarter: null,
    teacher: practice.teacher,
    date: new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(practice.createdAt || Date.now())),
    basis: rubricFor(subject).basis,
  };

  const makePdf = async (kind: 'klausur' | 'erwartung', mode: 'open' | 'save') => {
    setBusy(kind);
    setError(null);
    try {
      const fonts = await loadExamFonts();
      const blob = kind === 'klausur' ? await buildExamPdf(content, info, fonts) : await buildHorizonPdf(content, info, fonts);
      if (mode === 'save') {
        saveBlob(blob, practiceFileName(date, info.subject, levelLabel, kind));
      } else {
        const url = URL.createObjectURL(blob);
        if (!window.open(url, '_blank', 'noopener')) saveBlob(blob, practiceFileName(date, info.subject, levelLabel, kind)); // Pop-up gesperrt
        window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Das PDF konnte nicht erstellt werden.');
    } finally {
      setBusy('');
    }
  };

  const makeSolutions = async () => {
    if (!practice.subjectId) return;
    setBusy('solutions');
    setError(null);
    try {
      const done = await generateSolutions(practice.id, practice.subjectId, content);
      dispatch({ type: 'upsertPractice', practice: { ...practice, content: done } });
      setSolutionsError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Der Erwartungshorizont konnte nicht erstellt werden.');
    } finally {
      setBusy('');
    }
  };

  const remove = () => {
    if (!window.confirm('Diese Übungsklausur löschen? Korrekturen deiner Lösungen bleiben erhalten.')) return;
    dispatch({ type: 'deletePractice', id: practice.id });
    navigate('/notizen?ansicht=klausuren', { replace: true });
  };

  const pdfButtons = (kind: 'klausur' | 'erwartung', disabled: boolean) => (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-primary" disabled={disabled || busy !== ''} onClick={() => void makePdf(kind, 'open')}>
        <Eye size={16} aria-hidden="true" /> {busy === kind ? 'Erstelle …' : 'PDF ansehen'}
      </button>
      <button type="button" className="btn" disabled={disabled || busy !== ''} onClick={() => void makePdf(kind, 'save')}>
        <Download size={16} aria-hidden="true" /> Speichern
      </button>
    </div>
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>{practice.title}</h1>
          <p className="sub">
            {subject?.name ?? 'Ohne Fach'} · Stufe {levelLabel} · {formatDateShort(date)} · {practice.durationMin} Minuten · {num(content.gesamt_be)} BE
          </p>
        </div>
        <Link className="btn" to="/notizen?ansicht=klausuren">
          <ArrowLeft size={16} aria-hidden="true" /> Klausuren
        </Link>
      </div>

      <div className="grid cols-2">
        <section className="card stack" style={{ gap: 12 }}>
          <h2 className="section-head">Klausur</h2>
          <p className="hint">So sieht sie aus wie eine echte Klausur: Kopf mit Zeit und Hilfsmitteln, Material mit Zeilenzählung, Aufgaben mit BE und eine Punktetabelle.</p>
          {pdfButtons('klausur', false)}
        </section>
        <section className="card stack" style={{ gap: 12 }}>
          <h2 className="section-head">Erwartungshorizont</h2>
          {solved ? (
            <>
              <p className="hint">Mit erwarteten Inhalten, Punkten und Musterlösung. Schau erst nach, wenn du fertig bist.</p>
              {pdfButtons('erwartung', false)}
            </>
          ) : (
            <>
              <p className="hint">Der Erwartungshorizont fehlt noch{solutionsError ? `: ${solutionsError}` : '.'} Er wird in einer zweiten Anfrage geschrieben.</p>
              {access.can('practice') && (
                <button type="button" className="btn btn-primary" disabled={busy !== '' || !practice.subjectId} onClick={() => void makeSolutions()}>
                  <Sparkles size={16} aria-hidden="true" /> {busy === 'solutions' ? 'Die KI schreibt …' : 'Erwartungshorizont erstellen'}
                </button>
              )}
            </>
          )}
        </section>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {(access.can('correct') || reviews.length > 0) && (
      <section className="card stack" style={{ gap: 12 }}>
        <h2 className="section-head">Gelöst? Lass es korrigieren</h2>
        <p className="hint">
          Schreib die Klausur auf Papier, fotografiere deine Lösung und lade sie hoch. Die Aufgaben und der Erwartungshorizont sind schon dabei, die Korrektur nutzt sie. Eine Note deiner Lehrkraft gibt es dafür nicht, trag keine ein.
        </p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {access.can('correct') && (
            <Link className="btn btn-primary" to={`/korrektur/neu?uebung=${practice.id}`}>
              <ClipboardCheck size={16} aria-hidden="true" /> Lösung korrigieren lassen
            </Link>
          )}
        </div>
        {reviews.length > 0 && (
          <ul className="review-rows">
            {reviews.map((r) => {
              const v = reviewView(r, state.examReviews, state.subjects);
              return (
                <li key={r.id}>
                  <Link className="review-row" to={`/korrektur/${r.id}`}>
                    <FileText size={18} aria-hidden="true" />
                    <span className="review-row-main">
                      <strong>{r.title}</strong>
                      <span className="hint">{formatDateShort(r.examDate)}</span>
                    </span>
                    <span className="review-row-points">
                      {v.shown !== null ? (
                        <>
                          <strong>{v.shown} P</strong>
                          <span className="hint">Note {pointsLabel(v.shown)}</span>
                        </>
                      ) : (
                        <span className="hint">ohne Ergebnis</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <LevelRating practiceId={practice.id} />
      </section>
      )}
      {!(access.can('correct') || reviews.length > 0) && (
        <section className="card stack">
          <LevelRating practiceId={practice.id} />
        </section>
      )}

      <section className="stack" style={{ gap: 10 }}>
        <h2 className="section-head">Aufgaben</h2>
        <ul className="task-list">
          {tasks.map((t) => (
            <li key={`${t.part}-${t.nr}`} className="task-card">
              <div className="task-head">
                <span className="task-nr">{t.nr}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong>{shorten(t.text, 150)}</strong>
                  <div className="pill-row" style={{ marginTop: 4 }}>
                    {t.operator && <span className="pill">{t.operator}</span>}
                    {t.afb && <span className="pill">AFB {['I', 'II', 'III'][t.afb - 1]}</span>}
                    {content.teile.length > 1 && <span className="pill">{shorten(t.part, 30)}</span>}
                  </div>
                </div>
                <div className="task-points">
                  <strong>{num(t.be)}</strong>
                  <span className="hint">BE</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack" style={{ gap: 8 }}>
        <h2 className="section-head">Wie sie entstanden ist</h2>
        <ul className="rubric-list">
          {meta && (
            <>
              <li>
                {meta.styleN ? `Stil nach ${meta.styleN === 1 ? 'einem gelernten Aufgabenblatt' : `${meta.styleN} gelernten Aufgabenblättern`}. ` : ''}
                {meta.profileN > 0
                  ? `Aufbau nach ${meta.profileN === 1 ? 'deiner echten Klausur' : `deinen ${meta.profileN} echten Klausuren`} in diesem Fach.`
                  : 'Standardaufbau, denn es war noch keine echte Klausur dieses Fachs korrigiert.'}
              </li>
              <li>
                Zielmischung der Anforderungsbereiche: I {meta.afb[0]} %, II {meta.afb[1]} %, III {meta.afb[2]} %
                {shares ? `. Tatsächlich: I ${shares[0]} %, II ${shares[1]} %, III ${shares[2]} %.` : '.'}
              </li>
              {meta.shift !== 0 && (
                <li>
                  {meta.shift > 0 ? 'Schwerer als sonst' : 'Leichter als sonst'}, weil Rückmeldung und Ergebnisse früherer Übungsklausuren dieser Stufe {meta.shift > 0 ? 'zu leicht' : 'zu schwer'} waren ({meta.shift > 0 ? '+' : ''}
                  {meta.shift} {Math.abs(meta.shift) === 1 ? 'Schritt' : 'Schritte'}).
                </li>
              )}
            </>
          )}
          <li>
            Material: {practice.noteIds.length > 0 ? `${practice.noteIds.length} ${practice.noteIds.length === 1 ? 'Notiz' : 'Notizen'} aus dem Unterricht` : 'kein Unterrichtsmaterial, üblicher Stoff der Qualifikationsphase'}
            {practice.topic ? `, Themenwunsch: ${practice.topic}` : ''}.
          </li>
        </ul>
        <p className="notice notice-soft">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Von der KI erstellt: Texte, Aufgaben und Lösungen können Fehler enthalten, vor allem Rechnungen. Prüfe sie nach, bevor du dich darauf verlässt.</span>
        </p>
      </section>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-danger" onClick={remove}>
          <Trash2 size={16} aria-hidden="true" /> Übungsklausur löschen
        </button>
      </div>
    </div>
  );
}
