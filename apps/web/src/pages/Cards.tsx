import {
  CONFIG,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  buildChoice,
  buildMatchSet,
  buildQueue,
  buildTest,
  cardStats,
  fold,
  isNewCard,
  isTypable,
  newCard,
  practiceSet,
  quickRound,
  toIsoDate,
  type Difficulty,
  type Flashcard,
  type Subject,
  type TestQuestion,
} from '@study/core';
import { BookOpen, Brain, CheckSquare, ChevronDown, ClipboardCheck, ListChecks, PenLine, Plus, Puzzle, Search, Trash2, X, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CardForm } from '../components/CardForm';
import { StudyBrowse } from '../components/cards/StudyBrowse';
import { StudyChoice } from '../components/cards/StudyChoice';
import { StudyMatch } from '../components/cards/StudyMatch';
import { StudyReview } from '../components/cards/StudyReview';
import { CardSuggestions } from '../components/cards/Suggestions';
import { StudyTest } from '../components/cards/StudyTest';
import { StudyWrite } from '../components/cards/StudyWrite';
import { DifficultyPicker, DifficultyTag } from '../components/DifficultyPicker';
import { uid } from '../lib/format';
import { useStore } from '../state/store';

type Session =
  | { mode: 'review'; cards: Flashcard[] }
  | { mode: 'browse'; cards: Flashcard[] }
  | { mode: 'write'; cards: Flashcard[] }
  | { mode: 'choice'; cards: Flashcard[] }
  | { mode: 'match'; cards: Flashcard[] }
  | { mode: 'test'; questions: TestQuestion[]; cards: Flashcard[] };

const TEST_SIZES = [5, 10, 20] as const;
const PRACTICE_SIZE = 20;

function CardRow({
  card,
  subject,
  selectMode,
  selected,
  onToggle,
  onDelete,
}: {
  card: Flashcard;
  subject: Subject | undefined;
  selectMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const today = toIsoDate(new Date());
  const save = () => {
    const f = front.trim();
    const b = back.trim();
    if (f && b && (f !== card.front || b !== card.back)) dispatch({ type: 'upsertCard', card: { ...card, front: f, back: b } });
  };
  const status = isNewCard(card) ? 'neu' : card.due <= today ? 'fällig' : card.box >= 4 ? 'sitzt' : `Kasten ${card.box}`;
  return (
    <article className={`note-row card-row${open && !selectMode ? ' open' : ''}${selected ? ' selected' : ''}`} style={{ ['--c' as string]: subject?.color ?? 'var(--ink-3)' }}>
      <button
        type="button"
        className="note-head"
        aria-expanded={selectMode ? undefined : open}
        aria-pressed={selectMode ? selected : undefined}
        onClick={() => (selectMode ? onToggle() : setOpen(!open))}
      >
        {selectMode && <span className={`check-box${selected ? ' on' : ''}`} aria-hidden="true">{selected ? '✓' : ''}</span>}
        <div className="note-main">
          <div className="note-title">{card.front.replace(/\n/g, ' ')}</div>
          <div className="note-meta">
            {subject?.name ?? 'Ohne Fach'} · {status} · <DifficultyTag value={card.difficulty} />
          </div>
        </div>
        {!selectMode && <ChevronDown size={18} className="note-chevron" aria-hidden="true" />}
      </button>
      {open && !selectMode && (
        <div className="note-body stack">
          <label className="field">
            <span>Vorderseite</span>
            <textarea className="input note-area" rows={3} value={front} maxLength={1000} onChange={(e) => setFront(e.target.value)} onBlur={save} />
          </label>
          <label className="field">
            <span>Rückseite</span>
            <textarea className="input note-area" rows={3} value={back} maxLength={2000} onChange={(e) => setBack(e.target.value)} onBlur={save} />
          </label>
          <DifficultyPicker value={card.difficulty} onChange={(difficulty) => dispatch({ type: 'upsertCard', card: { ...card, difficulty } })} />
          <p className="hint">{card.reps === 0 ? 'Noch nicht gelernt.' : `${card.reps}× beantwortet, ${card.lapses}× vergessen, nächste Wiederholung ${card.due <= today ? 'heute' : card.due}.`}</p>
          <div>
            <button type="button" className="btn btn-ghost" onClick={onDelete}>
              <Trash2 size={16} aria-hidden="true" /> Karte löschen
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function ModeTile({ icon: Icon, title, text, meta, disabled, onClick }: { icon: LucideIcon; title: string; text: string; meta: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="mode-tile" disabled={disabled} onClick={onClick}>
      <span className="mode-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <span className="mode-text">
        <strong>{title}</strong>
        <span className="hint">{text}</span>
      </span>
      <span className="mode-meta">{meta}</span>
    </button>
  );
}

export function Cards() {
  const { state, dispatch } = useStore();
  const today = toIsoDate(new Date());
  const [filter, setFilter] = useState<string | null>(null); // null = alle Fächer
  const [diffFilter, setDiffFilter] = useState<Difficulty | null>(null); // null = alle Stufen
  const [session, setSession] = useState<Session | null>(null);
  const [params] = useSearchParams();

  // ?runde=1 (Verknüpfung der installierten App): gleich die kurze Runde starten
  useEffect(() => {
    if (params.get('runde') !== '1') return;
    const round = quickRound(state.cards, today);
    if (round.queue.length > 0) setSession({ mode: 'review', cards: round.queue });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [adding, setAdding] = useState(false);
  const [testSize, setTestSize] = useState<(typeof TEST_SIZES)[number]>(10);
  // Liste: Suche, Auswahl zum Löschen und Ändern
  const [query, setQuery] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shownCount, setShownCount] = useState(40);

  const subjectOf = useMemo(() => new Map(state.subjects.map((s) => [s.id, s])), [state.subjects]);
  const pool = useMemo(
    () => state.cards.filter((c) => (filter === null || c.subjectId === filter) && (diffFilter === null || c.difficulty === diffFilter)),
    [state.cards, filter, diffFilter],
  );
  const queue = useMemo(() => buildQueue(state.cards, today, { subjectId: filter, difficulty: diffFilter }), [state.cards, today, filter, diffFilter]);
  const stats = cardStats(state.cards, today, filter);
  const dueByLevel = useMemo(
    () => Object.fromEntries(DIFFICULTIES.map((d) => [d, buildQueue(state.cards, today, { subjectId: filter, difficulty: d }).length])) as Record<Difficulty, number>,
    [state.cards, today, filter],
  );

  // Was geht in welchem Lernmodus mit den Karten der aktuellen Auswahl?
  const typable = useMemo(() => pool.filter(isTypable), [pool]);
  const choiceable = useMemo(() => pool.filter((c) => buildChoice(c, state.cards, () => 0.5) !== null), [pool, state.cards]);
  const matchable = useMemo(() => buildMatchSet(pool, () => 0.5) !== null, [pool]);

  const decks = useMemo(() => {
    const make = (id: string | null, name: string, color: string) => {
      const cards = id === null ? state.cards : state.cards.filter((c) => c.subjectId === id);
      const s = cardStats(state.cards, today, id);
      return { id, name, color, total: cards.length, due: s.due + Math.min(s.fresh, CONFIG.cards.maxNewPerSession), known: s.known, fresh: s.fresh };
    };
    return [make(null, 'Alle Fächer', 'var(--accent)'), ...state.subjects.filter((s) => state.cards.some((c) => c.subjectId === s.id)).map((s) => make(s.id, s.name, s.color))];
  }, [state.cards, state.subjects, today]);

  const visible = useMemo(() => {
    const q = fold(query.trim());
    return pool
      .filter((c) => !q || fold(c.front).includes(q) || fold(c.back).includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.front.localeCompare(b.front, 'de'));
  }, [pool, query]);

  const start = (mode: Session['mode']) => {
    if (mode === 'review') return setSession({ mode, cards: queue });
    if (mode === 'browse') return setSession({ mode, cards: pool });
    if (mode === 'write') return setSession({ mode, cards: practiceSet(typable, today, PRACTICE_SIZE) });
    if (mode === 'choice') return setSession({ mode, cards: practiceSet(choiceable, today, PRACTICE_SIZE) });
    if (mode === 'match') return setSession({ mode, cards: pool });
    setSession({ mode: 'test', questions: buildTest(pool, testSize), cards: pool });
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const leaveSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  const deleteSelected = () => {
    const ids = [...selected];
    if (ids.length === 0 || !confirm(ids.length === 1 ? 'Diese Karte löschen?' : `Diese ${ids.length} Karten löschen?`)) return;
    dispatch({ type: 'deleteCards', ids });
    leaveSelect();
  };
  const setDifficultyOfSelected = (difficulty: Difficulty) => {
    const cards = state.cards.filter((c) => selected.has(c.id)).map((c) => ({ ...c, difficulty }));
    if (cards.length > 0) dispatch({ type: 'upsertCards', cards });
    leaveSelect();
  };

  if (session) {
    const close = () => setSession(null);
    return (
      <div className="stack" style={{ gap: 20 }} data-no-reload>
        {session.mode === 'review' && <StudyReview queue={session.cards} subjects={state.subjects} onClose={close} />}
        {session.mode === 'browse' && <StudyBrowse cards={session.cards} subjects={state.subjects} onClose={close} />}
        {session.mode === 'write' && <StudyWrite cards={session.cards} subjects={state.subjects} onClose={close} />}
        {session.mode === 'choice' && <StudyChoice cards={session.cards} pool={state.cards} subjects={state.subjects} onClose={close} />}
        {session.mode === 'match' && <StudyMatch cards={session.cards} onClose={close} />}
        {session.mode === 'test' && (
          <StudyTest
            questions={session.questions}
            cards={session.cards}
            onClose={close}
            onAgain={() => setSession({ mode: 'test', questions: buildTest(session.cards, testSize), cards: session.cards })}
            onPracticeWrong={(wrong) => setSession({ mode: 'browse', cards: wrong })}
          />
        )}
      </div>
    );
  }

  const noCards = state.cards.length === 0;
  const scope = `${filter === null ? 'Alle Fächer' : (subjectOf.get(filter)?.name ?? 'Fach')} · ${diffFilter === null ? 'alle Stufen' : DIFFICULTY_LABELS[diffFilter]} · ${pool.length} ${pool.length === 1 ? 'Karte' : 'Karten'}`;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Karteikarten</h1>
          <p className="sub">Lernen in wachsenden Abständen, Schreiben, Auswahl, Zuordnen und Test.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(!adding)} aria-expanded={adding}>
          <Plus size={18} aria-hidden="true" /> Neue Karte
        </button>
      </div>

      {adding && (
        <CardForm
          subjects={state.subjects}
          defaultSubjectId={filter}
          onClose={() => setAdding(false)}
          onSave={(c) =>
            dispatch({ type: 'upsertCard', card: newCard({ id: uid(), subjectId: c.subjectId, noteId: null, front: c.front, back: c.back, difficulty: c.difficulty }, today, new Date().toISOString()) })
          }
        />
      )}

      {!noCards && (
        <>
          <section className="stack" style={{ gap: 8 }}>
            <h2>Stapel</h2>
            <div className="deck-grid" role="group" aria-label="Stapel nach Fach">
              {decks.map((d) => (
                <button key={d.id ?? 'all'} type="button" className="deck" aria-pressed={filter === d.id} style={{ ['--c' as string]: d.color }} onClick={() => setFilter(d.id)}>
                  <span className="deck-name">{d.name}</span>
                  <span className="deck-count">
                    {d.total} {d.total === 1 ? 'Karte' : 'Karten'}
                  </span>
                  <span className="deck-bar" aria-hidden="true">
                    <i className="known" style={{ width: `${d.total ? (d.known / d.total) * 100 : 0}%` }} />
                    <i className="fresh" style={{ width: `${d.total ? (d.fresh / d.total) * 100 : 0}%` }} />
                  </span>
                  <span className={`deck-due${d.due > 0 ? ' has' : ''}`}>{d.due > 0 ? `${d.due} heute dran` : 'nichts fällig'}</span>
                </button>
              ))}
            </div>
            <div className="row note-filter" role="group" aria-label="Nach Schwierigkeit filtern">
              <button type="button" className="chip" aria-pressed={diffFilter === null} onClick={() => setDiffFilter(null)}>
                Alle Stufen
              </button>
              {DIFFICULTIES.map((d) => (
                <button key={d} type="button" className="chip diff-chip" data-d={d} aria-pressed={diffFilter === d} onClick={() => setDiffFilter(d)}>
                  {DIFFICULTY_LABELS[d]}
                  {dueByLevel[d] > 0 && <span className="hint">{dueByLevel[d]}</span>}
                </button>
              ))}
            </div>
          </section>

          <section className="stack" style={{ gap: 12 }}>
            <div className="card today-card">
              <div>
                <div className="big-num">{queue.length}</div>
                <p className="hint">
                  {queue.length === 0
                    ? 'Heute ist nichts fällig.'
                    : `heute dran (${stats.due} Wiederholungen, ${Math.min(stats.fresh, CONFIG.cards.maxNewPerSession)} neue)`}
                </p>
              </div>
              <button type="button" className="btn btn-primary" disabled={queue.length === 0} onClick={() => start('review')}>
                Lernen starten
              </button>
            </div>

            <div className="between">
              <h2>Lernmodi</h2>
              <span className="hint">{scope}</span>
            </div>
            <div className="mode-grid">
              <ModeTile
                icon={Brain}
                title="Lernen"
                text="Wiederholung in wachsenden Abständen, du bewertest selbst."
                meta={queue.length > 0 ? `${queue.length} heute` : 'nichts fällig'}
                disabled={queue.length === 0}
                onClick={() => start('review')}
              />
              <ModeTile icon={BookOpen} title="Durchblättern" text="Karten umdrehen und blättern, ohne Bewertung." meta={`${pool.length} Karten`} disabled={pool.length === 0} onClick={() => start('browse')} />
              <ModeTile
                icon={PenLine}
                title="Schreiben"
                text="Antwort eintippen, kleine Tippfehler sind okay."
                meta={`${Math.min(typable.length, PRACTICE_SIZE)} Karten`}
                disabled={typable.length === 0}
                onClick={() => start('write')}
              />
              <ModeTile
                icon={ListChecks}
                title="Multiple Choice"
                text="Eine richtige Antwort aus vier."
                meta={choiceable.length > 0 ? `${Math.min(choiceable.length, PRACTICE_SIZE)} Karten` : 'braucht 4 Karten'}
                disabled={choiceable.length === 0}
                onClick={() => start('choice')}
              />
              <ModeTile icon={Puzzle} title="Zuordnen" text="Fragen und Antworten gegen die Zeit verbinden." meta={matchable ? 'bis 6 Paare' : 'braucht 3 Karten'} disabled={!matchable} onClick={() => start('match')} />
              <ModeTile icon={ClipboardCheck} title="Test" text="Gemischte Fragen mit Ergebnis am Ende." meta={`${Math.min(testSize, pool.length)} Fragen`} disabled={pool.length < 3} onClick={() => start('test')} />
            </div>
            <div className="row note-filter" role="group" aria-label="Länge des Tests">
              <span className="hint">Testlänge</span>
              {TEST_SIZES.map((n) => (
                <button key={n} type="button" className="chip" aria-pressed={testSize === n} onClick={() => setTestSize(n)}>
                  {n} Fragen
                </button>
              ))}
            </div>
            <p className="hint">Schreiben und Multiple Choice zählen für die Wiederholung, Zuordnen, Durchblättern und Test ändern den Plan nicht.</p>
          </section>
        </>
      )}

      <CardSuggestions filter={filter} />

      {state.cards.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <div className="between">
            <h2>Alle Karten</h2>
            {!selectMode ? (
              <button type="button" className="btn" onClick={() => setSelectMode(true)}>
                <CheckSquare size={16} aria-hidden="true" /> Auswählen
              </button>
            ) : (
              <button type="button" className="btn" onClick={leaveSelect}>
                Fertig
              </button>
            )}
          </div>
          <div className="note-search">
            <Search size={18} aria-hidden="true" className="note-search-icon" />
            <input className="input" type="search" value={query} placeholder="Karten durchsuchen" aria-label="Karten durchsuchen" onChange={(e) => setQuery(e.target.value)} />
            {query && (
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Suche leeren" onClick={() => setQuery('')}>
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {selectMode && (
            <div className="bulk-bar" role="toolbar" aria-label="Auswahl bearbeiten">
              <span className="bulk-count">{selected.size === 0 ? 'Nichts ausgewählt' : `${selected.size} ausgewählt`}</span>
              <button type="button" className="btn" onClick={() => setSelected(new Set(visible.map((c) => c.id)))} disabled={visible.length === 0}>
                Alle {visible.length}
              </button>
              <button type="button" className="btn" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
                Keine
              </button>
              <span className="bulk-sep" aria-hidden="true" />
              {DIFFICULTIES.map((d) => (
                <button key={d} type="button" className="btn diff-chip" data-d={d} disabled={selected.size === 0} onClick={() => setDifficultyOfSelected(d)} aria-label={`Auswahl auf ${DIFFICULTY_LABELS[d]} setzen`}>
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
              <span className="bulk-sep" aria-hidden="true" />
              <button type="button" className="btn btn-danger" disabled={selected.size === 0} onClick={deleteSelected}>
                <Trash2 size={16} aria-hidden="true" /> Löschen
              </button>
            </div>
          )}

          {visible.length === 0 ? (
            <p className="hint">{query ? 'Keine Karte gefunden.' : 'Keine Karten in dieser Auswahl.'}</p>
          ) : (
            <div className="note-list">
              {visible.slice(0, shownCount).map((c) => (
                <CardRow
                  key={c.id}
                  card={c}
                  subject={subjectOf.get(c.subjectId ?? '')}
                  selectMode={selectMode}
                  selected={selected.has(c.id)}
                  onToggle={() => toggle(c.id)}
                  onDelete={() => confirm('Diese Karte löschen?') && dispatch({ type: 'deleteCard', id: c.id })}
                />
              ))}
            </div>
          )}
          {visible.length > shownCount && (
            <button type="button" className="btn" onClick={() => setShownCount(shownCount + 40)}>
              Mehr anzeigen ({visible.length - shownCount} weitere)
            </button>
          )}
        </section>
      )}
    </div>
  );
}
