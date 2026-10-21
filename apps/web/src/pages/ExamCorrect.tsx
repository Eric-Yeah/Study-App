import { CONFIG, QUARTERS, hasSolutions, horizonPlainText, lastTeacher, practicePlainText, quarterFor, rubricFor, teacherFor, toIsoDate, type ExamPage, type ExamReview, type Quarter } from '@study/core';
import { ArrowLeft, ClipboardCheck, FileText, ListChecks } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AutoTextarea } from '../components/AutoTextarea';
import { PagePicker } from '../components/exam/PagePicker';
import { useUserId } from '../lib/auth';
import { correctExam, ExamError, removeExamFiles, uploadExamPages } from '../lib/examApi';
import { formatDateShort, uid } from '../lib/format';
import { preparePages, type Progress } from '../lib/worksheetFiles';
import { useStore } from '../state/store';
import { useAccess } from '../lib/access';

/**
 * Klausur korrigieren lassen: Fach und Klausur wählen, Aufgabenstellung, eigene Lösung und auf Wunsch den
 * Erwartungshorizont hochladen. Die KI korrigiert nach dem Korrekturmuster des Fachs, die Note rechnet die App.
 * Die Seiten werden nach der Korrektur wieder gelöscht, nur das Ergebnis bleibt.
 */
export function ExamCorrect() {
  const { state, dispatch, flush } = useStore();
  const access = useAccess();
  const userId = useUserId();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = toIsoDate(new Date());
  const preset = state.exams.find((e) => e.id === params.get('klausur'));
  // Lösung einer Übungsklausur: Aufgaben und Erwartungshorizont kommen aus der gespeicherten Klausur
  const practice = state.practiceExams.find((p) => p.id === params.get('uebung'));

  const [subjectId, setSubjectId] = useState(preset?.subjectId ?? practice?.subjectId ?? params.get('fach') ?? '');
  const [examId, setExamId] = useState(preset?.id ?? '');
  const [title, setTitle] = useState(preset?.title ?? (practice ? `Lösung: ${practice.title}` : ''));
  const [date, setDate] = useState(preset && preset.date <= today ? preset.date : today);
  const [teacher, setTeacher] = useState(practice?.teacher ?? '');
  const [quarter, setQuarter] = useState<Quarter | ''>('');
  const [touched, setTouched] = useState({ teacher: !!practice?.teacher, quarter: false });
  const [maxPoints, setMaxPoints] = useState(practice ? String(practice.content.gesamt_be) : '');
  const [taskFiles, setTaskFiles] = useState<File[]>([]);
  const [answerFiles, setAnswerFiles] = useState<File[]>([]);
  const [horizonFiles, setHorizonFiles] = useState<File[]>([]);
  const [horizonText, setHorizonText] = useState('');
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subject = state.subjects.find((s) => s.id === subjectId);
  const rubric = rubricFor(subject);
  const custom = state.rubrics.find((r) => r.subjectId === subjectId);
  const pastExams = useMemo(
    () => state.exams.filter((e) => e.subjectId === subjectId && e.date <= today).sort((a, b) => b.date.localeCompare(a.date)),
    [state.exams, subjectId, today],
  );

  // Lehrkraft und Q-Phase vorschlagen: Stundenplan, sonst die letzte Korrektur des Fachs. Eigene Eingaben bleiben.
  useEffect(() => {
    if (!subjectId) return;
    if (!touched.teacher) setTeacher(teacherFor(state.timetable, subjectId, state.subjects, date) || lastTeacher(state.examReviews, subjectId));
    if (!touched.quarter) {
      const last = [...state.examReviews].filter((r) => r.quarter).sort((a, b) => b.examDate.localeCompare(a.examDate))[0]?.quarter ?? '';
      setQuarter(quarterFor(state.timetable, subjectId, state.subjects) ?? last);
    }
  }, [subjectId, date, state.timetable, state.subjects, state.examReviews, touched]);

  const pickExam = (id: string) => {
    setExamId(id);
    const exam = state.exams.find((e) => e.id === id);
    if (exam) {
      setDate(exam.date);
      setTitle(exam.title);
    }
  };

  const run = async () => {
    if (!subject) return;
    setBusy(true);
    setError(null);
    const id = uid();
    let created = false;
    try {
      const prep = async (files: File[], label: string) =>
        files.length === 0 ? [] : (await preparePages(files, [], (p) => setProgress({ ...p, label: `${label}: ${p.label}` }))).pages;
      // Übungsklausur: Aufgaben als Text aus der gespeicherten Klausur, Erwartungshorizont ebenfalls
      const taskPages = practice ? practicePlainText(practice.content).map((text) => ({ type: 'text' as const, text })) : await prep(taskFiles, 'Aufgaben');
      const answerPages = await prep(answerFiles, 'Lösung');
      const horizonPages = practice ? [] : await prep(horizonFiles, 'Erwartungshorizont');
      if (answerPages.length === 0) throw new ExamError('Auf den Seiten deiner Lösung war nichts zu lesen.');
      const total = taskPages.length + answerPages.length + horizonPages.length;
      if (total > CONFIG.exam.maxPages) {
        throw new ExamError(`Das sind ${total} Seiten, in eine Korrektur passen höchstens ${CONFIG.exam.maxPages}. Lass leere Seiten weg oder teile die Klausur auf.`);
      }

      const points = Number(maxPoints.replace(',', '.'));
      let review: ExamReview = {
        id,
        subjectId,
        examId: examId || null,
        title: title.trim() || `Klausur ${subject.name}`,
        examDate: date,
        teacher: teacher.trim(),
        quarter: quarter || null,
        maxPoints: maxPoints.trim() && Number.isFinite(points) && points > 0 ? Math.min(1000, Math.round(points * 10) / 10) : null,
        horizonText: practice
          ? hasSolutions(practice.content)
            ? horizonPlainText(practice.content, CONFIG.exam.maxHorizonChars)
            : ''
          : horizonText.trim().slice(0, CONFIG.exam.maxHorizonChars),
        main: null,
        compare: null,
        teacherPoints: null,
        teacherTasks: null,
        learnedAt: null,
        practiceId: practice?.id ?? null,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'upsertReview', review });
      created = true;
      await flush(); // die Seiten verweisen auf die Korrektur, sie muss zuerst in der Datenbank stehen

      setProgress({ done: 0, total: 1, label: 'Seiten hochladen' });
      const pages: ExamPage[] = [
        ...(await uploadExamPages(userId, id, 'aufgabe', taskPages, 0)),
        ...(await uploadExamPages(userId, id, 'loesung', answerPages, 100)),
        ...(await uploadExamPages(userId, id, 'erwartung', horizonPages, 200)),
      ];
      setProgress({ done: 0, total: 0, label: 'Die KI korrigiert, das dauert etwa eine Minute …' });
      const c = await correctExam(id, pages, compare && access.isAdmin);
      review = { ...review, main: c.main, compare: c.compare };
      dispatch({ type: 'upsertReview', review });
      await removeExamFiles(id).catch(() => {}); // die Seiten braucht niemand mehr
      navigate(`/korrektur/${id}`, { replace: true, state: { compareError: c.compareError } });
    } catch (e) {
      // Nichts Halbfertiges stehen lassen. Die Auswahl bleibt, du kannst es noch einmal versuchen.
      if (created) {
        await removeExamFiles(id).catch(() => {});
        dispatch({ type: 'deleteReview', id });
      }
      setError(e instanceof Error ? e.message : 'Die Korrektur hat nicht geklappt.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const canRun = !!subject && answerFiles.length > 0 && !busy;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Klausur korrigieren lassen</h1>
          <p className="sub">Die KI korrigiert nach dem Korrekturmuster des Fachs, die Note rechnet die App nach den Regeln der OAVO.</p>
        </div>
        <Link className="btn" to={practice ? `/korrektur/uebung/${practice.id}` : '/notizen?ansicht=klausuren'}>
          <ArrowLeft size={16} aria-hidden="true" /> Zurück
        </Link>
      </div>
      {practice && (
        <div className="card compare-card">
          <FileText size={18} aria-hidden="true" />
          <span>
            Lösung zur Übungsklausur „{practice.title}“. Aufgaben{hasSolutions(practice.content) ? ' und Erwartungshorizont' : ''} sind schon dabei, du musst nur deine Lösung hinzufügen.
            {!hasSolutions(practice.content) && ' Der Erwartungshorizont fehlt noch, die KI schätzt die Erwartungen dann selbst.'}
          </span>
        </div>
      )}

      {state.subjects.length === 0 ? (
        <div className="card">
          <p className="muted">Lege zuerst unter Fächer ein Fach an.</p>
        </div>
      ) : (
        <div className="card stack upload-card">
          <section className="stack upload-section">
            <h3 className="section-title">Welche Klausur?</h3>
            <div className="stack" style={{ gap: 6 }}>
              <span className="form-label">Fach</span>
              <div className="chip-grid" role="group" aria-label="Fach">
                {state.subjects.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    className="chip"
                    aria-pressed={subjectId === sub.id}
                    disabled={busy || !!practice}
                    onClick={() => {
                      setSubjectId(sub.id);
                      setExamId('');
                    }}
                  >
                    <i className="dot" style={{ background: sub.color }} />
                    {sub.name}
                  </button>
                ))}
              </div>
            </div>
            {subject && (
              <Link className="rubric-link" to={`/korrektur/muster/${subject.id}`}>
                <ListChecks size={16} aria-hidden="true" />
                <span>
                  Korrekturmuster {rubric.label}
                  {custom?.teacherText.trim() ? ' mit Vorgaben deiner Lehrkraft' : ''}
                  {custom && custom.lessons.length > 0 ? `, ${custom.lessons.length} ${custom.lessons.length === 1 ? 'Erfahrung' : 'Erfahrungen'}` : ''}
                </span>
              </Link>
            )}
            {pastExams.length > 0 && !practice && (
              <label className="field">
                <span>Klausur aus dem Plan</span>
                <select className="input" value={examId} disabled={busy} onChange={(e) => pickExam(e.target.value)}>
                  <option value="">keine</option>
                  {pastExams.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({formatDateShort(e.date)})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid cols-2">
              <label className="field">
                <span>Titel</span>
                <input className="input" value={title} maxLength={120} placeholder={subject ? `Klausur ${subject.name}` : 'zum Beispiel 1. Klausur'} disabled={busy} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="field">
                <span>Datum</span>
                <input className="input" type="date" value={date} max={today} disabled={busy} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="field">
                <span>Lehrkraft</span>
                <input
                  className="input"
                  value={teacher}
                  maxLength={40}
                  placeholder="zum Beispiel Müller"
                  disabled={busy}
                  onChange={(e) => {
                    setTeacher(e.target.value);
                    setTouched({ ...touched, teacher: true });
                  }}
                />
              </label>
              <label className="field">
                <span>Erreichbare Punkte (wenn bekannt)</span>
                <input className="input" inputMode="decimal" value={maxPoints} placeholder="zum Beispiel 60" disabled={busy || !!practice} onChange={(e) => setMaxPoints(e.target.value.replace(/[^0-9.,]/g, ''))} />
              </label>
            </div>
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
                      setQuarter(quarter === q ? '' : q);
                      setTouched({ ...touched, quarter: true });
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="stack upload-section">
            <h3 className="section-title">Deine Lösung</h3>
            <PagePicker id="loesung" files={answerFiles} onChange={setAnswerFiles} disabled={busy} prompt="Deine Lösung hinzufügen" />
          </section>

          {!practice && (
          <section className="stack upload-section">
            <h3 className="section-title">
              Aufgabenstellung <span className="hint">empfohlen</span>
            </h3>
            <PagePicker id="aufgabe" files={taskFiles} onChange={setTaskFiles} disabled={busy} prompt="Aufgabenblatt hinzufügen" />
          </section>
          )}

          {!practice && (
          <section className="stack upload-section">
            <h3 className="section-title">
              Erwartungshorizont der Lehrkraft <span className="hint">wenn vorhanden</span>
            </h3>
            <p className="hint">Damit übernimmt die KI die Punkte und Erwartungen deiner Lehrkraft genau, statt sie selbst festzulegen. Das macht die Korrektur am genauesten.</p>
            <PagePicker id="erwartung" files={horizonFiles} onChange={setHorizonFiles} disabled={busy} prompt="Erwartungshorizont hinzufügen" />
            <AutoTextarea
              className="input"
              rows={3}
              value={horizonText}
              maxLength={CONFIG.exam.maxHorizonChars}
              disabled={busy}
              aria-label="Erwartungshorizont eintippen"
              placeholder="Oder hier eintippen, zum Beispiel: Aufgabe 1 (10 BE): Einleitung mit Autor, Titel, Thema …"
              onChange={(e) => setHorizonText(e.target.value)}
            />
          </section>
          )}

          {access.isAdmin && (
          <label className="option-card">
            <input type="checkbox" checked={compare} disabled={busy} onChange={(e) => setCompare(e.target.checked)} />
            <span>
              <strong>Zum Vergleich auch mit dem günstigen Modell korrigieren</strong>
              <span className="hint">
                Kostet etwa einen halben Cent mehr. Wenn du später die Note deiner Lehrkraft einträgst, zeigt das Admin-Protokoll, welches Modell näher dran war.
              </span>
            </span>
          </label>
          )}

          <p className="hint">
            {access.isAdmin ? 'Eine Klausur kostet etwa 5 bis 10 Cent vom Monatsbudget. ' : ''}Die Seiten werden nach der Korrektur gelöscht, nur das Ergebnis bleibt. Die Note der KI ist eine Einschätzung, keine Note.
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
          <button type="button" className="btn btn-primary btn-wide" disabled={!canRun} onClick={() => void run()}>
            <ClipboardCheck size={18} aria-hidden="true" /> {busy ? 'Einen Moment …' : 'Korrigieren lassen'}
          </button>
          {!canRun && !busy && (
            <p className="hint" style={{ textAlign: 'center' }}>
              {!subject ? 'Wähle ein Fach.' : 'Füge mindestens eine Seite deiner Lösung hinzu.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
