import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  LANGUAGE_LABELS,
  fold,
  hasCardContent,
  newCard,
  suggestCards,
  toIsoDate,
  type CardDifficulty,
  type Difficulty,
} from '@study/core';
import { ChevronDown, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { generateCards } from '../../lib/cardApi';
import { formatDateShort, uid } from '../../lib/format';
import { useStore } from '../../state/store';
import { DifficultyTag } from '../DifficultyPicker';
import { useAccess } from '../../lib/access';

const DISMISSED_KEY = 'study-app-card-dismissed';

const readDismissed = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

/** Vorschläge für neue Karten: aus den Notizen ohne KI (Lücken- und Formelkarten) und auf Wunsch mit KI (Groq). */
export function CardSuggestions({ filter }: { filter: string | null }) {
  const { state, dispatch } = useStore();
  const access = useAccess();
  const today = toIsoDate(new Date());
  const [suggesting, setSuggesting] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [skipped, setSkipped] = useState<Set<string>>(new Set()); // abgewählte Vorschläge dieser Ansicht
  // KI-Karten (Groq): pro Notiz auf Knopfdruck, erscheinen vor den Lückenkarten in der Vorschlagsliste
  const [aiNoteId, setAiNoteId] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLevel, setAiLevel] = useState<CardDifficulty | null>(null); // null = gemischt
  const [aiCards, setAiCards] = useState<{ noteId: string; front: string; back: string; difficulty: Difficulty }[]>([]);
  const subjectOf = useMemo(() => new Map(state.subjects.map((s) => [s.id, s])), [state.subjects]);

  // Vorschläge aus den Notizen (ohne KI): Lückenkarten und Formelkarten, ohne Vorhandenes und Ausgeblendetes
  const suggestions = useMemo(() => {
    const taken = new Set(state.cards.map((c) => fold(c.front)));
    const hidden = new Set(dismissed);
    const out: { front: string; back: string; difficulty: Difficulty; note: (typeof state.notes)[number]; key: string; ai: boolean }[] = [];
    // KI-Karten zuerst, dann Lückenkarten. Gleiche Vorderseiten kommen nur einmal vor.
    for (const c of aiCards) {
      const note = state.notes.find((n) => n.id === c.noteId);
      const key = fold(c.front);
      if (!note || taken.has(key) || hidden.has(key) || (filter !== null && note.subjectId !== filter)) continue;
      taken.add(key);
      out.push({ front: c.front, back: c.back, difficulty: c.difficulty, note, key, ai: true });
    }
    for (const note of state.notes) {
      if (filter !== null && note.subjectId !== filter) continue;
      for (const s of suggestCards(note, taken)) {
        const key = fold(s.front);
        taken.add(key);
        if (!hidden.has(key)) out.push({ ...s, note, key, ai: false });
      }
    }
    return out;
  }, [state.notes, state.cards, filter, dismissed, aiCards]);

  // Notizen mit genug Inhalt für KI-Karten, neueste zuerst
  const aiNotes = useMemo(
    () =>
      state.notes
        .filter((n) => hasCardContent(n) && (filter === null || n.subjectId === filter))
        .sort((a, b) => b.lessonDate.localeCompare(a.lessonDate) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [state.notes, filter],
  );
  const aiTarget = aiNotes.find((n) => n.id === aiNoteId) ?? aiNotes[0];

  const askAi = async () => {
    if (!aiTarget) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const existing = state.cards.filter((c) => c.noteId === aiTarget.id).map((c) => c.front);
      const cards = await generateCards(aiTarget.id, existing, aiLevel);
      setAiCards((prev) => [...prev.filter((c) => c.noteId !== aiTarget.id), ...cards.map((c) => ({ noteId: aiTarget.id, ...c }))]);
      setSuggesting(true);
      if (cards.length === 0) setAiError('Die KI hat zu dieser Notiz keine guten Karten gefunden.');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Die KI-Karten sind fehlgeschlagen.');
    } finally {
      setAiBusy(false);
    }
  };

  const remember = (keys: string[]) => {
    const next = [...new Set([...dismissed, ...keys])].slice(-500);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      /* ohne Speicher erscheinen sie nach dem Neuladen wieder */
    }
  };

  const addSuggestions = () => {
    const chosen = suggestions.filter((s) => !skipped.has(s.key));
    if (chosen.length === 0) return;
    const now = new Date().toISOString();
    dispatch({
      type: 'upsertCards',
      cards: chosen.map((s, i) => newCard({ id: uid(), subjectId: s.note.subjectId, noteId: s.note.id, front: s.front, back: s.back, difficulty: s.difficulty }, today, `${now}${String(i).padStart(3, '0')}`)),
    });
    setSkipped(new Set());
  };

  return (
      <div className="stack" style={{ gap: 8 }}>
        <button type="button" className="note-week-head" aria-expanded={suggesting} onClick={() => setSuggesting(!suggesting)}>
          <ChevronDown size={18} className="note-chevron" aria-hidden="true" />
          <h2>Vorschläge aus deinen Notizen</h2>
          <span className="hint">{suggestions.length}</span>
        </button>
        {suggesting && aiNotes.length > 0 && access.can('cards') && (
          <div className="card stack ai-panel" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <Sparkles size={16} aria-hidden="true" />
              <strong>Bessere Karten mit KI</strong>
            </div>
            <p className="hint">
              {access.isAdmin
                ? 'Die KI (Groq, kostenlos) liest die Zusammenfassung einer Notiz und schlägt Fragen und Antworten vor. Dafür geht nur diese Zusammenfassung an Groq, kein Foto und keine Datei. Du entscheidest danach, welche Karten du übernimmst.'
                : 'Die KI liest die Zusammenfassung einer Notiz und schlägt Fragen und Antworten vor. Dafür geht nur diese Zusammenfassung an die KI, kein Foto und keine Datei. Du entscheidest danach, welche Karten du übernimmst.'}
            </p>
            <div className="row note-filter" role="group" aria-label="Schwierigkeit der KI-Karten">
              <button type="button" className="chip" aria-pressed={aiLevel === null} onClick={() => setAiLevel(null)} disabled={aiBusy}>
                Gemischt
              </button>
              {DIFFICULTIES.map((d) => (
                <button key={d} type="button" className="chip diff-chip" data-d={d} aria-pressed={aiLevel === d} onClick={() => setAiLevel(d)} disabled={aiBusy}>
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <select className="input" style={{ flex: 1, minWidth: 180 }} value={aiTarget?.id ?? ''} onChange={(e) => setAiNoteId(e.target.value)} disabled={aiBusy} aria-label="Notiz für KI-Karten">
                {aiNotes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {formatDateShort(n.lessonDate)} · {subjectOf.get(n.subjectId ?? '')?.name ?? 'Ohne Fach'} · {n.title || 'Ohne Titel'}
                  </option>
                ))}
              </select>
              <button type="button" className="btn" disabled={aiBusy || !aiTarget} onClick={() => void askAi()}>
                {aiBusy ? 'Die KI überlegt …' : 'Karten mit KI erstellen'}
              </button>
            </div>
            {aiTarget && subjectOf.get(aiTarget.subjectId ?? '') && (
              <p className="hint">
                Sprache der Karten: {LANGUAGE_LABELS[subjectOf.get(aiTarget.subjectId ?? '')!.language]}
                {subjectOf.get(aiTarget.subjectId ?? '')!.language !== 'de' ? ' (Unterrichtssprache des Fachs)' : ''}
              </p>
            )}
            {aiError && (
              <p className="notice" role="alert">
                {aiError}
              </p>
            )}
          </div>
        )}
        {suggesting &&
          (suggestions.length === 0 ? (
            <p className="hint">
              Keine Vorschläge. Sie entstehen aus Kernaussagen, in denen ein Begriff deiner Notiz vorkommt (der Begriff wird verdeckt), und aus Formeln.
            </p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <div className="note-list">
                {suggestions.map((s) => (
                  <div key={s.key} className="suggest-row" style={{ ['--c' as string]: subjectOf.get(s.note.subjectId ?? '')?.color ?? 'var(--ink-3)' }}>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={!skipped.has(s.key)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSkipped((prev) => {
                            const next = new Set(prev);
                            if (checked) next.delete(s.key);
                            else next.add(s.key);
                            return next;
                          });
                        }}
                      />
                      <span>
                        <span className="suggest-front">
                          {s.ai && <span className="tag ai-tag">KI</span>} {s.front}
                        </span>
                        <span className="hint">
                          Antwort: {s.back.split('\n')[0]} · {s.note.title} · <DifficultyTag value={s.difficulty} />
                        </span>
                      </span>
                    </label>
                    <button type="button" className="btn btn-ghost btn-icon" aria-label="Vorschlag ausblenden" onClick={() => remember([s.key])}>
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" disabled={suggestions.every((s) => skipped.has(s.key))} onClick={addSuggestions}>
                  {suggestions.filter((s) => !skipped.has(s.key)).length} Karten hinzufügen
                </button>
                <button type="button" className="btn" onClick={() => remember(suggestions.filter((s) => skipped.has(s.key)).map((s) => s.key))} disabled={skipped.size === 0}>
                  Abgewählte ausblenden
                </button>
              </div>
            </div>
          ))}
      </div>
  );
}
