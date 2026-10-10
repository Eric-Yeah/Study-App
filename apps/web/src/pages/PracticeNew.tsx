import {
  CONFIG,
  LEVELS,
  LEVEL_HINTS,
  LEVEL_LABELS,
  defaultsFor,
  examProfile,
  lastTeacher,
  styleForPrompt,
  teacherFor,
  toIsoDate,
  type Level,
  type PracticeRecord,
} from '@study/core';
import { ArrowLeft, FileText, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatDateShort, uid } from '../lib/format';
import { generatePractice, PracticeError } from '../lib/practiceApi';
import { useStore } from '../state/store';
import { useAccess } from '../lib/access';

/** Übungsklausur erstellen lassen: Fach, Stufe und Unterrichtsmaterial wählen, die KI schreibt Klausur und Erwartungshorizont. */
export function PracticeNew() {
  const { state, dispatch, flush } = useStore();
  const access = useAccess();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = toIsoDate(new Date());

  const [subjectId, setSubjectId] = useState(params.get('fach') ?? '');
  const [level, setLevel] = useState<Level>('mittel');
  const [picked, setPicked] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const [teacher, setTeacher] = useState('');
  const [teacherTouched, setTeacherTouched] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);

  const subject = state.subjects.find((s) => s.id === subjectId);
  const defaults = defaultsFor(subject?.isAdvanced === true, CONFIG.practice);
  const notes = useMemo(
    () => state.notes.filter((n) => n.subjectId === subjectId).sort((a, b) => b.lessonDate.localeCompare(a.lessonDate) || b.createdAt.localeCompare(a.createdAt)),
    [state.notes, subjectId],
  );
  const profile = useMemo(() => {
    const real = state.examReviews.filter((r) => r.subjectId === subjectId && !r.practiceId && r.main);
    return examProfile(real.map((r) => ({ aufgaben: r.main!.result.aufgaben })));
  }, [state.examReviews, subjectId]);
  const earlier = state.practiceExams.filter((p) => p.subjectId === subjectId && p.level === level);
  const rated = earlier.filter((p) => p.rating !== null).length;
  const styled = useMemo(
    () => styleForPrompt(state.taskStyles.filter((x) => x.subjectId === subjectId), teacher, CONFIG.style),
    [state.taskStyles, subjectId, teacher],
  );

  // Lehrkraft vorschlagen: Stundenplan, sonst die der letzten Korrektur. Eigene Eingaben bleiben.
  useEffect(() => {
    if (subjectId && !teacherTouched) setTeacher(teacherFor(state.timetable, subjectId, state.subjects, today) || lastTeacher(state.examReviews, subjectId));
  }, [subjectId, teacherTouched, state.timetable, state.subjects, state.examReviews, today]);

  // Beim Fachwechsel: die letzten Notizen als Material vorwählen
  useEffect(() => {
    setPicked(notes.slice(0, 5).map((n) => n.id));
  }, [subjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) =>
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= CONFIG.practice.maxNotes ? list : [...list, id]));

  const run = async () => {
    if (!subject) return;
    setBusy(true);
    setError(null);
    setStep(1);
    const id = uid();
    try {
      const asked = Number(minutes);
      const durationMin = Number.isFinite(asked) && asked >= 20 && asked <= 300 ? Math.round(asked) : defaults.durationMin;
      const g = await generatePractice(
        { practiceId: id, subjectId, level, noteIds: picked, topic: topic.trim(), teacher: teacher.trim(), durationMin },
        setStep,
      );
      const practice: PracticeRecord = {
        id,
        subjectId,
        title: g.content.titel || `Übungsklausur ${subject.name}`,
        level,
        teacher: teacher.trim(),
        noteIds: picked,
        topic: topic.trim(),
        durationMin: g.content.dauer_min,
        content: g.content,
        meta: g.meta,
        rating: null,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'upsertPractice', practice });
      await flush();
      navigate(`/korrektur/uebung/${id}`, { replace: true, state: { solutionsError: g.solutionsError } });
    } catch (e) {
      setError(e instanceof PracticeError || e instanceof Error ? e.message : 'Die Übungsklausur konnte nicht erstellt werden.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Übungsklausur erstellen</h1>
          <p className="sub">Die KI schreibt eine Klausur wie im Unterricht: mit Operatoren, passend zu deinem Material, als PDF mit Erwartungshorizont.</p>
        </div>
        <Link className="btn" to="/notizen?ansicht=klausuren">
          <ArrowLeft size={16} aria-hidden="true" /> Zurück
        </Link>
      </div>

      {state.subjects.length === 0 ? (
        <div className="card">
          <p className="muted">Lege zuerst unter Fächer ein Fach an.</p>
        </div>
      ) : (
        <div className="card stack upload-card">
          <section className="stack upload-section">
            <h3 className="section-title">Fach</h3>
            <div className="chip-grid" role="group" aria-label="Fach">
              {state.subjects.map((sub) => (
                <button key={sub.id} type="button" className="chip" aria-pressed={subjectId === sub.id} disabled={busy} onClick={() => setSubjectId(sub.id)}>
                  <i className="dot" style={{ background: sub.color }} />
                  {sub.name}
                </button>
              ))}
            </div>
          </section>

          <section className="stack upload-section">
            <h3 className="section-title">Schwierigkeit</h3>
            <div className="level-grid" role="group" aria-label="Schwierigkeit">
              {LEVELS.map((l) => (
                <button key={l} type="button" className="level-card" aria-pressed={level === l} disabled={busy} onClick={() => setLevel(l)}>
                  <strong>{LEVEL_LABELS[l]}</strong>
                  <span className="hint">{LEVEL_HINTS[l]}</span>
                </button>
              ))}
            </div>
            {subject && (
              <p className="hint">
                {profile
                  ? `Der Aufbau folgt ${profile.n === 1 ? 'deiner echten Klausur' : `deinen ${profile.n} echten Klausuren`} in ${subject.name} (im Schnitt ${String(profile.avgTasks).replace('.', ',')} Aufgaben, ${String(profile.avgPoints).replace('.', ',')} BE).`
                  : `Noch keine echte Klausur in ${subject.name} korrigiert, darum gilt ein Standardaufbau. Lass echte Klausuren korrigieren, dann passt sich der Aufbau an.`}
                {rated > 0 ? ` Deine Rückmeldung zu ${rated === 1 ? 'einer früheren Übungsklausur' : `${rated} früheren Übungsklausuren`} dieser Stufe zählt auch.` : ''}
                {styled.used > 0 ? ` Der Stil folgt ${styled.used === 1 ? 'einem gelernten Aufgabenblatt' : `${styled.used} gelernten Aufgabenblättern`}${teacher.trim() ? ' (Lehrkraft zuerst)' : ''}.` : ''}{' '}
                {access.can('style') && <Link to={`/korrektur/stil/${subject.id}`}>{styled.used > 0 ? 'Aufgabenstil ansehen' : 'Aufgabenblätter für den Stil hochladen'}</Link>}
              </p>
            )}
          </section>

          {subject && (
            <section className="stack upload-section">
              <div className="between" style={{ gap: 8, flexWrap: 'wrap' }}>
                <h3 className="section-title">Unterrichtsmaterial</h3>
                {notes.length > 0 && (
                  <div className="row" style={{ gap: 12 }}>
                    <button type="button" className="link-btn" disabled={busy} onClick={() => setPicked(notes.slice(0, 5).map((n) => n.id))}>
                      Letzte 5
                    </button>
                    <button type="button" className="link-btn" disabled={busy} onClick={() => setPicked(notes.slice(0, CONFIG.practice.maxNotes).map((n) => n.id))}>
                      Neueste {CONFIG.practice.maxNotes}
                    </button>
                    <button type="button" className="link-btn" disabled={busy || picked.length === 0} onClick={() => setPicked([])}>
                      Keine
                    </button>
                  </div>
                )}
              </div>
              {notes.length === 0 ? (
                <p className="hint">Zu {subject.name} gibt es noch keine Notizen. Ohne Material orientiert sich die KI am üblichen Stoff der Qualifikationsphase. Mit Notizen wird die Klausur genauer auf deinen Unterricht zugeschnitten.</p>
              ) : (
                <>
                  <p className="hint">
                    Die KI nutzt die Zusammenfassungen der gewählten Notizen: {picked.length} von höchstens {CONFIG.practice.maxNotes}.
                  </p>
                  <ul className="note-pick">
                    {notes.map((n) => (
                      <li key={n.id}>
                        <label className={`note-pick-row${picked.includes(n.id) ? ' on' : ''}`}>
                          <input type="checkbox" checked={picked.includes(n.id)} disabled={busy || (!picked.includes(n.id) && picked.length >= CONFIG.practice.maxNotes)} onChange={() => toggle(n.id)} />
                          <span className="note-pick-main">
                            <strong>{n.title}</strong>
                            <span className="hint">
                              {formatDateShort(n.lessonDate)}
                              {n.summary?.kernaussagen.length ? ` · ${n.summary.kernaussagen.length} Kernaussagen` : ' · ohne Zusammenfassung'}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <label className="field">
                <span>Themenwunsch (freiwillig)</span>
                <input className="input" value={topic} maxLength={CONFIG.practice.maxTopicChars} disabled={busy} placeholder="zum Beispiel: Gedichte der Romantik, Kurvendiskussion, Weimarer Republik" onChange={(e) => setTopic(e.target.value)} />
              </label>
              <div className="grid cols-2">
                <label className="field">
                  <span>Lehrkraft (freiwillig)</span>
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
                  <span>Bearbeitungszeit in Minuten</span>
                  <input className="input" inputMode="numeric" value={minutes} disabled={busy} placeholder={String(defaults.durationMin)} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                </label>
              </div>
            </section>
          )}

          <p className="hint">
            Das dauert zwei bis drei Minuten{access.isAdmin ? ' und kostet etwa 10 bis 15 Cent vom Monatsbudget' : ''}. Texte, Aufgaben und Lösungen sind von der KI verfasst und können Fehler enthalten, vor allem Rechnungen. In Mathe und den Naturwissenschaften zeichnet die App Diagramme (Graphen, Messwerte, Säulen) aus den Daten der KI. Fotos, Skizzen und Noten kann die Klausur nicht enthalten, dafür stehen Tabellen und Beschreibungen im Material.
          </p>

          {busy && (
            <div className="stack" style={{ gap: 6 }} role="status">
              <div className="bar bar-wait" aria-hidden="true">
                <i />
              </div>
              <p className="hint">{step === 1 ? 'Schritt 1 von 2: Die KI schreibt Material und Aufgaben …' : 'Schritt 2 von 2: Erwartungshorizont und Musterlösung …'}</p>
            </div>
          )}
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn btn-primary btn-wide" disabled={!subject || busy} onClick={() => void run()}>
            <Sparkles size={18} aria-hidden="true" /> {busy ? 'Einen Moment …' : 'Übungsklausur erstellen'}
          </button>
          {!subject && !busy && (
            <p className="hint" style={{ textAlign: 'center' }}>
              <FileText size={14} aria-hidden="true" /> Wähle ein Fach.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
