import {
  CONFIG,
  addLessons,
  pointsLabel,
  reviewView,
  rubricFor,
  taskComparison,
  type ExamTask,
  type LearnResult,
  type SubjectRubric,
} from '@study/core';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, GraduationCap, ListChecks, Lightbulb, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { LevelRating } from '../components/exam/LevelRating';
import { PagePicker } from '../components/exam/PagePicker';
import { useUserId } from '../lib/auth';
import { ExamError, learnFromTeacher, removeExamFiles, uploadExamPages } from '../lib/examApi';
import { formatDateShort, formatNumber, uid } from '../lib/format';
import { preparePages, type Progress } from '../lib/worksheetFiles';
import { useStore } from '../state/store';
import { useAccess } from '../lib/access';

const num = (n: number) => formatNumber(n, 1).replace(/,0$/, '');
const modelName = (m: string) => (m.includes('haiku') ? 'Haiku' : m.includes('sonnet') ? 'Sonnet' : m.includes('opus') ? 'Opus' : m);

function TaskCard({ task, teacher }: { task: ExamTask; teacher: number | null }) {
  const share = task.max > 0 ? task.punkte / task.max : 0;
  return (
    <li className="task-card">
      <div className="task-head">
        <span className="task-nr">{task.nr}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong>{task.titel || `Aufgabe ${task.nr}`}</strong>
          <div className="pill-row" style={{ marginTop: 4 }}>
            {task.operator && <span className="pill">{task.operator}</span>}
            {task.afb && <span className="pill">AFB {['I', 'II', 'III'][task.afb - 1]}</span>}
            {task.max_geschaetzt && <span className="pill">Punkte geschätzt</span>}
            {task.unsicher && <span className="pill pill-warn">schwer lesbar</span>}
          </div>
        </div>
        <div className="task-points">
          <strong>{num(task.punkte)}</strong>
          <span className="hint">von {num(task.max)}</span>
          {teacher !== null && <span className="hint">Lehrkraft {num(teacher)}</span>}
        </div>
      </div>
      <div className="bar task-bar" aria-hidden="true">
        <i style={{ width: `${Math.max(3, share * 100)}%` }} />
      </div>
      {task.richtig.length > 0 && (
        <ul className="mark-list ok">
          {task.richtig.map((x) => (
            <li key={x}>
              <Check size={15} aria-hidden="true" /> {x}
            </li>
          ))}
        </ul>
      )}
      {task.fehlt.length > 0 && (
        <ul className="mark-list miss">
          {task.fehlt.map((x) => (
            <li key={x}>
              <X size={15} aria-hidden="true" /> {x}
            </li>
          ))}
        </ul>
      )}
      {task.tipp && (
        <p className="task-tip">
          <Lightbulb size={15} aria-hidden="true" /> {task.tipp}
        </p>
      )}
    </li>
  );
}

/** Ergebnis einer Korrektur, Note der Lehrkraft eintragen und aus ihrer Korrektur lernen. */
export function ExamReviewPage() {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const access = useAccess();
  const userId = useUserId();
  const navigate = useNavigate();
  const location = useLocation();
  const compareError = (location.state as { compareError?: string } | null)?.compareError ?? '';
  const review = state.examReviews.find((r) => r.id === id);
  const subject = state.subjects.find((s) => s.id === review?.subjectId);
  const view = useMemo(() => (review ? reviewView(review, state.examReviews, state.subjects) : null), [review, state.examReviews, state.subjects]);

  const [teacherPoints, setTeacherPoints] = useState<number | null>(review?.teacherPoints ?? null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [learn, setLearn] = useState<LearnResult | null>(null);
  const [lessonDrafts, setLessonDrafts] = useState<{ text: string; keep: boolean }[]>([]);
  const [saved, setSaved] = useState('');
  useEffect(() => {
    window.scrollTo(0, 0); // nach der Korrektur oben bei der Note anfangen
  }, [id]);

  if (!review || !view) {
    return (
      <div className="card stack">
        <p className="muted">Diese Korrektur gibt es nicht mehr.</p>
        <Link className="btn" to="/korrektur">
          Zu den Klausuren
        </Link>
      </div>
    );
  }
  const { grade, calibration: c, shown, compareGrade } = view;
  const rubric = rubricFor(subject);
  const tasks = taskComparison(review);
  const result = review.main?.result;
  const hasHorizon = !!review.horizonText.trim() || !!result?.erwartung_genutzt;

  const saveTeacherPoints = (p: number | null) => {
    setTeacherPoints(p);
    dispatch({ type: 'upsertReview', review: { ...review, teacherPoints: p } });
    setSaved(p === null ? '' : 'Gespeichert. Künftige Korrekturen in diesem Fach gleichen sich daran an.');
  };

  const runLearn = async () => {
    setBusy(true);
    setError(null);
    try {
      const prepared = await preparePages(files, [], setProgress);
      if (prepared.pages.length === 0) throw new ExamError('Auf den Seiten war nichts zu lesen.');
      if (prepared.pages.length > CONFIG.exam.maxPages) throw new ExamError(`Höchstens ${CONFIG.exam.maxPages} Seiten auf einmal.`);
      setProgress({ done: 0, total: 1, label: 'Seiten hochladen' });
      const pages = await uploadExamPages(userId, review.id, 'korrigiert', prepared.pages);
      setProgress({ done: 0, total: 0, label: 'Die KI vergleicht mit der Korrektur deiner Lehrkraft …' });
      const r = await learnFromTeacher(review.id, pages);
      setLearn(r);
      setLessonDrafts(r.lessons.map((text) => ({ text, keep: true })));
      if (r.teacherPoints !== null && teacherPoints === null) setTeacherPoints(r.teacherPoints);
      setFiles([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Der Vergleich hat nicht geklappt.');
    } finally {
      await removeExamFiles(review.id).catch(() => {});
      setBusy(false);
      setProgress(null);
    }
  };

  const applyLearn = () => {
    if (!learn) return;
    const now = new Date().toISOString();
    dispatch({
      type: 'upsertReview',
      review: { ...review, teacherPoints, teacherTasks: learn.tasks.length > 0 ? learn.tasks : review.teacherTasks, learnedAt: now },
    });
    const texts = lessonDrafts.filter((d) => d.keep && d.text.trim()).map((d) => d.text.trim().slice(0, CONFIG.exam.maxLessonChars));
    if (review.subjectId && texts.length > 0) {
      const current: SubjectRubric = state.rubrics.find((r) => r.subjectId === review.subjectId) ?? { subjectId: review.subjectId, teacherText: '', lessons: [], updatedAt: now };
      const added = texts.map((text) => ({ id: uid(), text, source: 'ki' as const, teacher: review.teacher, createdAt: now }));
      dispatch({ type: 'upsertRubric', rubric: { ...current, lessons: addLessons(current.lessons, added, CONFIG.exam.maxLessons), updatedAt: now } });
    }
    setLearn(null);
    setSaved(texts.length > 0 ? `${texts.length === 1 ? 'Eine Erfahrung' : `${texts.length} Erfahrungen`} ins Korrekturmuster übernommen.` : 'Gespeichert.');
  };

  const remove = async () => {
    if (!window.confirm('Diese Korrektur löschen?')) return;
    await removeExamFiles(review.id).catch(() => {});
    dispatch({ type: 'deleteReview', id: review.id });
    navigate('/korrektur', { replace: true });
  };

  const bar = busy && progress && (
    <div className="stack" style={{ gap: 6 }} role="status">
      <div className={`bar${progress.total === 0 ? ' bar-wait' : ''}`} aria-hidden="true">
        <i style={{ width: progress.total ? `${Math.max(6, (progress.done / progress.total) * 100)}%` : undefined }} />
      </div>
      <p className="hint">{progress.label}</p>
    </div>
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>{review.title}</h1>
          <p className="sub">
            {subject?.name ?? 'Ohne Fach'} · {formatDateShort(review.examDate)}
            {review.teacher ? ` · ${review.teacher}` : ''}
            {review.quarter ? ` · ${review.quarter}` : ''}
          </p>
        </div>
        <Link className="btn" to="/korrektur">
          <ArrowLeft size={16} aria-hidden="true" /> Klausuren
        </Link>
      </div>

      {!grade || !result ? (
        <div className="card">
          <p className="muted">Für diese Klausur gibt es noch kein Ergebnis. Die Korrektur ist vermutlich abgebrochen, lösche sie und versuche es noch einmal.</p>
        </div>
      ) : (
        <>
          <div className="card score-card">
            <div className="score-main">
              <span className="score-num">{shown}</span>
              <span className="score-label">
                <strong>{shown === 1 ? 'Punkt' : 'Punkte'}</strong>
                <span className="hint">Note {pointsLabel(shown ?? 0)} · Einschätzung der KI</span>
              </span>
            </div>
            <div className="score-facts">
              <span>
                {num(grade.achieved)} von {num(grade.max)} Punkten der Aufgaben{grade.percent !== null ? ` (${num(grade.percent)} %)` : ''}
              </span>
              {c.n > 0 && c.shift !== 0 && (
                <span className="hint">
                  Ohne Abgleich {grade.points} Punkte. Angepasst um {c.shift > 0 ? '+' : ''}
                  {num(c.shift)}, weil {c.basis === 'lehrkraft' ? 'diese Lehrkraft' : 'die Lehrkraft in diesem Fach'} in {c.n}{' '}
                  {c.n === 1 ? 'früheren Klausur' : 'früheren Klausuren'} {c.meanDiff < 0 ? 'strenger' : 'milder'} bewertet hat.
                </span>
              )}
              {review.teacherPoints !== null && (
                <span className="score-teacher">
                  <GraduationCap size={16} aria-hidden="true" /> Lehrkraft: {review.teacherPoints} Punkte (Note {pointsLabel(review.teacherPoints)})
                </span>
              )}
            </div>
            <details className="steps">
              <summary>
                So rechnet die App <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <ol>
                {grade.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </details>
          </div>

          {(result.lesbarkeit === 'unsicher' || !hasHorizon || result.aufgaben.some((a) => a.max_geschaetzt)) && (
            <div className="notice notice-soft">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>
                {result.lesbarkeit === 'unsicher' && 'Einige Stellen waren schwer lesbar, dort hat die KI nur bewertet, was sie sicher lesen konnte. '}
                {result.aufgaben.some((a) => a.max_geschaetzt) && 'Die Punkte je Aufgabe hat die KI selbst verteilt. '}
                {!hasHorizon && 'Ohne Erwartungshorizont ist die Einschätzung ungenauer.'}
              </span>
            </div>
          )}
          {access.isAdmin && compareError && <p className="notice">Der Vergleich mit dem günstigen Modell hat nicht geklappt: {compareError}</p>}

          <section className="stack" style={{ gap: 10 }}>
            <h2 className="section-head">Aufgaben</h2>
            <ul className="task-list">
              {result.aufgaben.map((t, i) => (
                <TaskCard key={`${t.nr}-${i}`} task={t} teacher={tasks[i]?.teacher ?? null} />
              ))}
            </ul>
          </section>

          {(result.staerken.length > 0 || result.schwaechen.length > 0 || result.naechste_schritte.length > 0) && (
            <div className="grid cols-2">
              {result.staerken.length > 0 && (
                <div className="card stack" style={{ gap: 8 }}>
                  <h3 className="section-title">Stärken</h3>
                  <ul className="mark-list ok">
                    {result.staerken.map((x) => (
                      <li key={x}>
                        <Check size={15} aria-hidden="true" /> {x}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.schwaechen.length > 0 && (
                <div className="card stack" style={{ gap: 8 }}>
                  <h3 className="section-title">Schwächen</h3>
                  <ul className="mark-list miss">
                    {result.schwaechen.map((x) => (
                      <li key={x}>
                        <X size={15} aria-hidden="true" /> {x}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.naechste_schritte.length > 0 && (
                <div className="card stack" style={{ gap: 8 }}>
                  <h3 className="section-title">Als Nächstes üben</h3>
                  <ul className="mark-list">
                    {result.naechste_schritte.map((x) => (
                      <li key={x}>
                        <Lightbulb size={15} aria-hidden="true" /> {x}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {access.isAdmin && review.compare && compareGrade && (
            <div className="card compare-card">
              <Sparkles size={18} aria-hidden="true" />
              <span>
                Vergleich: {modelName(review.compare.model)} gibt {compareGrade.points} Punkte, {modelName(review.main!.model)} {grade.points} Punkte
                {review.teacherPoints !== null ? `, die Lehrkraft ${review.teacherPoints}` : ''}.
              </span>
            </div>
          )}
        </>
      )}

      {review.practiceId && state.practiceExams.some((p) => p.id === review.practiceId) && (
        <section className="card stack" style={{ gap: 10 }}>
          <h2 className="section-head">Übungsklausur</h2>
          <LevelRating practiceId={review.practiceId} />
          <Link className="btn" to={`/korrektur/uebung/${review.practiceId}`}>
            Zur Übungsklausur
          </Link>
        </section>
      )}

      <section className="card stack" style={{ gap: 14 }}>
        <div>
          <h2 className="section-head">Klausur zurückbekommen?</h2>
          <p className="hint">
            Trag die Note deiner Lehrkraft ein. Lädst du die korrigierte Klausur hoch, liest die KI die Punkte ab und lernt, worauf deine Lehrkraft achtet. So wird das Korrekturmuster für {subject?.name ?? 'das Fach'} mit jeder Klausur genauer.
          </p>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="form-label">Note der Lehrkraft (Notenpunkte)</span>
          <div className="points-pick" role="group" aria-label="Note der Lehrkraft">
            {Array.from({ length: 16 }, (_, p) => 15 - p).map((p) => (
              <button key={p} type="button" className="diff-pill" aria-pressed={teacherPoints === p} disabled={busy} onClick={() => saveTeacherPoints(teacherPoints === p ? null : p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
        {review.main && access.can('correct') && (
          <>
            <PagePicker id="korrigiert" files={files} onChange={setFiles} disabled={busy} prompt="Korrigierte Klausur hinzufügen" />
            {files.length > 0 && (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void runLearn()}>
                <Sparkles size={16} aria-hidden="true" /> {busy ? 'Einen Moment …' : 'Mit der Korrektur der Lehrkraft vergleichen'}
              </button>
            )}
          </>
        )}
        {bar}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {learn && (
          <div className="stack learn-box" style={{ gap: 10 }}>
            <strong>Das hat die KI gefunden</strong>
            <p className="hint">
              {learn.teacherPoints !== null ? `Note der Lehrkraft: ${learn.teacherPoints} Punkte. ` : 'Eine Note war nicht zu erkennen. '}
              {learn.tasks.length > 0 ? `Punkte je Aufgabe: ${learn.tasks.map((t) => `${t.nr}: ${num(t.punkte)}`).join(', ')}.` : ''}
            </p>
            {lessonDrafts.length > 0 ? (
              <>
                <span className="form-label">Erfahrungen fürs Korrekturmuster (abwählen oder ändern)</span>
                <ul className="lesson-drafts">
                  {lessonDrafts.map((d, i) => (
                    <li key={i}>
                      <input
                        type="checkbox"
                        checked={d.keep}
                        aria-label="Übernehmen"
                        onChange={(e) => setLessonDrafts(lessonDrafts.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))}
                      />
                      <input
                        className="input"
                        value={d.text}
                        maxLength={CONFIG.exam.maxLessonChars}
                        onChange={(e) => setLessonDrafts(lessonDrafts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="hint">Keine neuen Erfahrungen, die Korrektur passte zu dem, was schon bekannt ist.</p>
            )}
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-primary" onClick={applyLearn}>
                <Check size={16} aria-hidden="true" /> Übernehmen
              </button>
              <button type="button" className="btn" onClick={() => setLearn(null)}>
                Verwerfen
              </button>
            </div>
          </div>
        )}
        {saved && <p className="saved-flash">{saved}</p>}
        {review.learnedAt && !learn && <p className="hint">Aus der Korrektur der Lehrkraft gelernt am {formatDateShort(review.learnedAt.slice(0, 10))}.</p>}
      </section>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {review.subjectId && (
          <Link className="btn" to={`/korrektur/muster/${review.subjectId}`}>
            <ListChecks size={16} aria-hidden="true" /> Korrekturmuster {rubric.label}
          </Link>
        )}
        <button type="button" className="btn btn-danger" onClick={() => void remove()}>
          <Trash2 size={16} aria-hidden="true" /> Korrektur löschen
        </button>
      </div>
    </div>
  );
}
