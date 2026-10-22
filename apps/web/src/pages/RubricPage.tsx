import { CONFIG, lastTeacher, rubricFor, subjectCalibration, type Lesson, type SubjectRubric } from '@study/core';
import { ArrowLeft, Check, ChevronDown, ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AutoTextarea } from '../components/AutoTextarea';
import { formatNumber, uid } from '../lib/format';
import { useStore } from '../state/store';

/**
 * Korrekturmuster eines Fachs: der Standard aus den hessischen Regeln und dem Fach, darüber die Vorgaben der Lehrkraft
 * (überschreiben den Standard) und die Erfahrungen aus zurückgegebenen Klausuren.
 */
export function RubricPage() {
  const { subjectId = '' } = useParams();
  const { state, dispatch } = useStore();
  const subject = state.subjects.find((s) => s.id === subjectId);
  const stored = state.rubrics.find((r) => r.subjectId === subjectId);
  const [teacherText, setTeacherText] = useState(stored?.teacherText ?? '');
  const [newLesson, setNewLesson] = useState('');
  const [saved, setSaved] = useState(false);

  // Änderungen von einem anderen Gerät übernehmen, solange hier nichts ungespeichert ist
  const storedText = stored?.teacherText ?? '';
  const [base, setBase] = useState(storedText);
  useEffect(() => {
    if (teacherText === base) setTeacherText(storedText);
    setBase(storedText);
  }, [storedText]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!subject) {
    return (
      <div className="card stack">
        <p className="muted">Dieses Fach gibt es nicht mehr.</p>
        <Link className="btn" to="/korrektur">
          Zu den Klausuren
        </Link>
      </div>
    );
  }

  const rubric = rubricFor(subject);
  const lessons = stored?.lessons ?? [];
  const teacher = lastTeacher(state.examReviews, subject.id);
  const c = subjectCalibration(subject.id, teacher, state.examReviews, state.subjects);
  const reviews = state.examReviews.filter((r) => r.subjectId === subject.id);
  const now = () => new Date().toISOString();
  const current = (): SubjectRubric => stored ?? { subjectId: subject.id, teacherText: '', lessons: [], updatedAt: now() };
  const save = (patch: Partial<SubjectRubric>) => dispatch({ type: 'upsertRubric', rubric: { ...current(), ...patch, updatedAt: now() } });
  const dirty = teacherText.trim() !== storedText.trim();
  const [operators, ...rules] = rubric.rules;

  const addOwn = () => {
    const text = newLesson.trim().slice(0, CONFIG.exam.maxLessonChars);
    if (!text) return;
    const lesson: Lesson = { id: uid(), text, source: 'eigene', teacher: '', createdAt: now() };
    save({ lessons: [...lessons, lesson].slice(-CONFIG.exam.maxLessons) });
    setNewLesson('');
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Korrekturmuster {subject.name}</h1>
          <p className="sub">
            {rubric.label}. Danach korrigiert die KI. Vorgaben deiner Lehrkraft gehen vor, Erfahrungen aus zurückgegebenen Klausuren machen es mit der Zeit genauer.
          </p>
        </div>
        <Link className="btn" to="/korrektur">
          <ArrowLeft size={16} aria-hidden="true" /> Klausuren
        </Link>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Link className="btn btn-primary" to={`/korrektur/neu?fach=${subject.id}`}>
          <ClipboardCheck size={16} aria-hidden="true" /> Klausur in {subject.name} korrigieren lassen
        </Link>
      </div>

      <section className="card stack" style={{ gap: 10 }}>
        <h2 className="section-head">Vorgaben deiner Lehrkraft</h2>
        <p className="hint">
          Hast du einen Bewertungsbogen oder Hinweise deiner Lehrkraft (zum Beispiel Gewichtung, was in die Einleitung gehört, wie zitiert wird)? Schreib sie hier hinein. Sie überschreiben das Muster unten, wo sie abweichen. Für eine einzelne Klausur lädst du den Erwartungshorizont direkt bei der Korrektur hoch.
        </p>
        <AutoTextarea
          className="input"
          rows={4}
          value={teacherText}
          maxLength={CONFIG.exam.maxTeacherTextChars}
          aria-label="Vorgaben der Lehrkraft"
          placeholder="zum Beispiel: Inhalt 70 %, Darstellung 30 %. Einleitung mit Autor, Titel, Textsorte, Thema. Zitate immer mit Zeilenangabe."
          onChange={(e) => {
            setTeacherText(e.target.value);
            setSaved(false);
          }}
        />
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!dirty}
            onClick={() => {
              save({ teacherText: teacherText.trim() });
              setBase(teacherText.trim());
              setSaved(true);
            }}
          >
            <Check size={16} aria-hidden="true" /> Speichern
          </button>
          {storedText && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (!window.confirm('Vorgaben der Lehrkraft entfernen? Dann gilt wieder das Muster unten.')) return;
                save({ teacherText: '' });
                setTeacherText('');
                setBase('');
              }}
            >
              Zurück zum Standard
            </button>
          )}
          {saved && !dirty && <span className="saved-flash">Gespeichert</span>}
        </div>
      </section>

      <section className="card stack" style={{ gap: 10 }}>
        <h2 className="section-head">Gelernt aus deinen Klausuren</h2>
        {c.n > 0 ? (
          <p className="hint">
            Abgleich aus {c.n} {c.n === 1 ? 'zurückgegebener Klausur' : 'zurückgegebenen Klausuren'}
            {c.basis === 'lehrkraft' && teacher ? ` bei ${teacher}` : ''}: Die Lehrkraft lag im Schnitt {formatNumber(Math.abs(c.meanDiff), 1)} {Math.abs(c.meanDiff) === 1 ? 'Punkt' : 'Punkte'}{' '}
            {c.meanDiff < 0 ? 'unter' : 'über'} der KI.{' '}
            {c.shift !== 0 ? `Neue Korrekturen werden um ${c.shift > 0 ? '+' : ''}${formatNumber(c.shift, 1)} Punkte angepasst.` : 'Das ist so nah dran, dass nichts angepasst wird.'}
          </p>
        ) : (
          <p className="hint">
            {reviews.length > 0
              ? 'Noch keine Note der Lehrkraft eingetragen. Öffne eine Korrektur und trag die Note ein, sobald du die Klausur zurückbekommst.'
              : 'Noch keine Klausur in diesem Fach korrigiert.'}
          </p>
        )}
        {lessons.length > 0 ? (
          <ul className="lesson-list">
            {lessons.map((l) => (
              <li key={l.id}>
                <span className="lesson-text">{l.text}</span>
                <span className="pill">{l.source === 'ki' ? `aus Korrektur${l.teacher ? ` · ${l.teacher}` : ''}` : 'eigene'}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={`Erfahrung „${l.text}“ löschen`}
                  onClick={() => save({ lessons: lessons.filter((x) => x.id !== l.id) })}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Noch keine Erfahrungen. Sie entstehen, wenn du eine von der Lehrkraft korrigierte Klausur hochlädst, oder du trägst selbst welche ein.</p>
        )}
        <form
          className="row"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            addOwn();
          }}
        >
          <input
            className="input"
            style={{ flex: 1 }}
            value={newLesson}
            maxLength={CONFIG.exam.maxLessonChars}
            aria-label="Eigene Erfahrung"
            placeholder="Eigene Erfahrung, zum Beispiel: Zieht für fehlende Einheiten ab"
            onChange={(e) => setNewLesson(e.target.value)}
          />
          <button type="submit" className="btn" disabled={!newLesson.trim()}>
            <Plus size={16} aria-hidden="true" /> Hinzufügen
          </button>
        </form>
        <p className="hint">Höchstens {CONFIG.exam.maxLessons} Erfahrungen, bei mehr fallen die ältesten weg. Erfahrungen zu einer anderen Lehrkraft gelten nur bei ihr.</p>
      </section>

      <section className="card stack" style={{ gap: 12 }}>
        <h2 className="section-head">Standard: {rubric.label}</h2>
        <div className="stack" style={{ gap: 6 }}>
          <h3 className="section-title">So entsteht die Note</h3>
          <ul className="rubric-list">
            {rubric.basis.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h3 className="section-title">Worauf es ankommt</h3>
          <ul className="rubric-list">
            {rubric.criteria.map((x) => (
              <li key={x.name}>
                <strong>{x.name}:</strong> {x.detail}
              </li>
            ))}
          </ul>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h3 className="section-title">Grundsätze</h3>
          <ul className="rubric-list">
            {[...rules, ...rubric.hints].map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <details className="steps">
          <summary>
            Operatoren und was sie verlangen <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <p className="hint" style={{ marginTop: 8 }}>
            {operators.replace(/^Erwartung je Operator: /, '')}
          </p>
        </details>
        <p className="hint">Grundlage: OAVO Hessen § 9 Abs. 12 bis 14 mit Anlagen 9a bis 9c (Fassung vom 10. Juni 2025) und der Erlass zu den modernen Fremdsprachen vom 7. August 2020.</p>
      </section>
    </div>
  );
}
