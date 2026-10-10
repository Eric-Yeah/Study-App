import { CONFIG, defaultTopicNotes, type SuggestedTopic } from '@study/core';
import { Check, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDateShort, uid } from '../lib/format';
import { suggestTopics, type TopicSuggestions } from '../lib/topicsApi';
import { topicsOf } from '../state/selectors';
import { useStore } from '../state/store';
import { useAccess } from '../lib/access';

/** Themenliste einer Klausur: zeigt, was inhaltlich noch fehlt, nicht nur die Lernzeit. */
export function Topics({ examId }: { examId: string }) {
  const { state, dispatch } = useStore();
  const access = useAccess();
  const [title, setTitle] = useState('');
  const { list, done, total } = topicsOf(state, examId);
  const exam = state.exams.find((e) => e.id === examId);

  // Themen aus den Notizen vorschlagen lassen (Haiku): Notizen wählen, Vorschläge prüfen, abhaken und übernehmen
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TopicSuggestions | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [added, setAdded] = useState(0);
  const notes = useMemo(
    () => (exam ? state.notes.filter((n) => n.subjectId === exam.subjectId).sort((a, b) => b.lessonDate.localeCompare(a.lessonDate) || b.createdAt.localeCompare(a.createdAt)) : []),
    [state.notes, exam],
  );
  const openPanel = () => {
    if (!exam) return;
    setPicked(defaultTopicNotes(state.notes, state.exams, exam, CONFIG.topics.maxNotes, CONFIG.topics.fallbackNotes));
    setResult(null);
    setError(null);
    setAdded(0);
    setOpen(true);
  };
  const toggle = (id: string) => setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : l.length >= CONFIG.topics.maxNotes ? l : [...l, id]));
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await suggestTopics(examId, picked, list.map((t) => t.title));
      setResult(r);
      setKeep(r.topics.map(() => true));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Die Themen konnten nicht vorgeschlagen werden.');
    } finally {
      setBusy(false);
    }
  };
  const take = () => {
    if (!result) return;
    // Nichts doppelt anlegen, auch wenn die Liste sich seit dem Vorschlag geändert hat
    const norm = (t: string) => t.trim().toLowerCase();
    const have = new Set(list.map((t) => norm(t.title)));
    const chosen: SuggestedTopic[] = result.topics.filter((t, i) => keep[i] && !have.has(norm(t.title)) && have.add(norm(t.title)));
    for (const t of chosen) dispatch({ type: 'addTopic', topic: { id: uid(), examId, title: t.title, done: false } });
    setAdded(chosen.length);
    setResult(null);
    setOpen(false);
  };

  return (
    <div className="card stack">
      <div className="between">
        <h2>Themen</h2>
        {total > 0 && (
          <span className="chip-static">
            {done} von {total} erledigt
          </span>
        )}
      </div>
      {total > 0 && (
        <div className="bar" aria-hidden="true">
          <i style={{ width: `${(done / total) * 100}%`, background: 'var(--ok)' }} />
        </div>
      )}
      {total === 0 && <p className="hint">Trag ein, was in der Klausur dran kommt, zum Beispiel „Integralrechnung“. Abgehakte Themen zeigen dir, was noch fehlt.</p>}
      <div>
        {list.map((t) => (
          <div key={t.id} className="task">
            <button
              type="button"
              className="check"
              role="checkbox"
              aria-checked={t.done}
              aria-label={`${t.title} erledigt`}
              onClick={() => dispatch({ type: 'toggleTopic', id: t.id })}
            >
              {t.done && <Check size={14} aria-hidden="true" />}
            </button>
            <span style={{ flex: 1 }} className={t.done ? 'done-text' : ''}>
              {t.title}
            </span>
            <button type="button" className="btn btn-ghost btn-icon" aria-label={`${t.title} löschen`} onClick={() => dispatch({ type: 'deleteTopic', id: t.id })}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      {added > 0 && <p className="saved-flash">{added === 1 ? 'Ein Thema übernommen.' : `${added} Themen übernommen.`}</p>}
      {exam && !open && access.can('topics') && (
        <button type="button" className="btn" onClick={openPanel}>
          <Sparkles size={16} aria-hidden="true" /> Themen aus Notizen vorschlagen
        </button>
      )}
      {open && access.can('topics') && (
        <div className="topic-suggest stack">
          <strong>Themen aus deinen Notizen</strong>
          {notes.length === 0 ? (
            <p className="hint">Zu diesem Fach gibt es noch keine Notizen. Lade Arbeitsblätter hoch, dann kann die KI Themen vorschlagen.</p>
          ) : (
            <>
              <p className="hint">
                Die KI liest die Zusammenfassungen der gewählten Notizen ({picked.length} von höchstens {CONFIG.topics.maxNotes}) und schlägt {CONFIG.topics.minSuggestions} bis {CONFIG.topics.maxSuggestions} Themen vor.{access.isAdmin ? ' Das kostet weniger als einen Cent.' : ''} Übernommen wird nur, was du abhakst.
              </p>
              <ul className="note-pick">
                {notes.map((n) => (
                  <li key={n.id}>
                    <label className={`note-pick-row${picked.includes(n.id) ? ' on' : ''}`}>
                      <input type="checkbox" checked={picked.includes(n.id)} disabled={busy || (!picked.includes(n.id) && picked.length >= CONFIG.topics.maxNotes)} onChange={() => toggle(n.id)} />
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
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
          {result &&
            (result.topics.length === 0 ? (
              <p className="hint">Es gibt keine neuen Themen, die nicht schon in deiner Liste stehen.</p>
            ) : (
              <ul className="topic-suggest-list">
                {result.topics.map((t, i) => (
                  <li key={t.title}>
                    <label>
                      <input type="checkbox" checked={keep[i] ?? false} onChange={(e) => setKeep(keep.map((k, j) => (j === i ? e.target.checked : k)))} />
                      <span className="note-pick-main">
                        <strong>{t.title}</strong>
                        {t.sources.length > 0 && <span className="hint">{t.sources.map((n) => result.notes[n - 1]?.title).filter(Boolean).join(' · ')}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ))}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {result && result.topics.length > 0 && (
              <button type="button" className="btn btn-primary" disabled={keep.every((k) => !k)} onClick={take}>
                <Check size={16} aria-hidden="true" /> {keep.filter(Boolean).length} übernehmen
              </button>
            )}
            <button type="button" className={result && result.topics.length > 0 ? 'btn' : 'btn btn-primary'} disabled={busy || picked.length === 0} onClick={() => void run()}>
              <Sparkles size={16} aria-hidden="true" /> {busy ? 'Die KI liest …' : result ? 'Neu vorschlagen' : 'Themen vorschlagen'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setOpen(false)}>
              Schließen
            </button>
          </div>
        </div>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          dispatch({ type: 'addTopic', topic: { id: uid(), examId, title: title.trim(), done: false } });
          setTitle('');
        }}
      >
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Neues Thema" aria-label="Neues Thema" />
        <button className="btn" type="submit">
          Hinzufügen
        </button>
      </form>
    </div>
  );
}
