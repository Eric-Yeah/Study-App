import { newCard, toIsoDate, addDays, type Subject } from '@study/core';
import { Check, Plus, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { uid } from '../lib/format';
import { likelySubjectId } from '../state/daily';
import { useStore } from '../state/store';
import { Segmented } from './Segmented';

type Tab = 'task' | 'card' | 'learned';
const MINUTES = [15, 25, 30, 45, 60, 90];

function SubjectChips({ subjects, value, onChange }: { subjects: Subject[]; value: string | null; onChange: (id: string | null) => void }) {
  return (
    <div className="row quick-subjects" role="group" aria-label="Fach">
      {subjects.map((s) => (
        <button key={s.id} type="button" className="chip" aria-pressed={value === s.id} onClick={() => onChange(value === s.id ? null : s.id)}>
          <span className="dot" style={{ background: s.color }} />
          {s.name}
        </button>
      ))}
    </div>
  );
}

/**
 * Schnell erfassen, von überall: Aufgabe, Karteikarte oder Lernzeit nachtragen. Das Fach ist aus dem Stundenplan (laufende oder letzte Stunde)
 * oder dem zuletzt gelernten Fach vorgewählt. Nach dem Speichern bleibt das Fenster offen, so geht die nächste Karte in Sekunden.
 * Taste N öffnet es am Mac, wenn gerade nicht getippt wird.
 */
export function QuickAdd({ notOnPhone = false }: { notOnPhone?: boolean }) {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('task');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<'today' | 'tomorrow'>('today');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [minutes, setMinutes] = useState(25);
  const [saved, setSaved] = useState<string | null>(null);
  const [cardCount, setCardCount] = useState(0);
  const first = useRef<HTMLInputElement>(null);
  const backField = useRef<HTMLTextAreaElement>(null);
  const timeout = useRef<number | undefined>(undefined);

  const subjects = state.subjects.filter((s) => s.status !== 'dropped' || s.isAdvanced || s.isExamSubject);

  const show = (t: Tab) => {
    setSubjectId(likelySubjectId(state, new Date()));
    setTab(t);
    setSaved(null);
    setCardCount(0);
    setOpen(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) return setOpen(false);
      const el = e.target as HTMLElement | null;
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey || open) return;
      if (el && (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      show('task');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (open && tab !== 'learned') first.current?.focus();
  }, [open, tab]);

  useEffect(() => () => window.clearTimeout(timeout.current), []);

  const flash = (text: string) => {
    setSaved(text);
    window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => setSaved(null), 2500);
  };

  const today = toIsoDate(new Date());
  const addTask = () => {
    const t = title.trim();
    if (!t) return;
    dispatch({ type: 'addTask', task: { id: uid(), title: t, subjectId, minutes: null, date: when === 'today' ? today : addDays(today, 1), done: false } });
    setTitle('');
    flash(when === 'today' ? 'Aufgabe für heute gespeichert' : 'Aufgabe für morgen gespeichert');
    first.current?.focus();
  };
  const addCard = () => {
    const f = front.trim();
    const b = back.trim();
    if (!f || !b) return;
    dispatch({ type: 'upsertCard', card: newCard({ id: uid(), subjectId, noteId: null, front: f, back: b }, today, new Date().toISOString()) });
    setFront('');
    setBack('');
    setCardCount((n) => n + 1);
    flash('Karte gespeichert, heute schon dran');
    first.current?.focus();
  };
  const addLearned = () => {
    const now = Date.now();
    dispatch({ type: 'addSession', session: { id: `manual-${uid()}`, subjectId, startedAt: now - minutes * 60_000, endedAt: now, minutes } });
    flash(`${minutes} min eingetragen`);
  };

  return (
    <>
      <button type="button" className={`fab${notOnPhone ? ' fab-not-phone' : ''}`} aria-label="Schnell hinzufügen: Aufgabe, Karte oder Lernzeit" title="Schnell hinzufügen (Taste N)" onClick={() => show('task')}>
        <Plus size={26} aria-hidden="true" />
      </button>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Schnell hinzufügen" onClick={(e) => e.stopPropagation()}>
            <div className="between">
              <h2>Schnell hinzufügen</h2>
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Schließen" onClick={() => setOpen(false)}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <Segmented<Tab>
              label="Was möchtest du hinzufügen?"
              value={tab}
              onChange={(t) => {
                setTab(t);
                setSaved(null);
              }}
              options={[
                { value: 'task', label: 'Aufgabe' },
                { value: 'card', label: 'Karte' },
                { value: 'learned', label: 'Gelernt' },
              ]}
            />

            {tab === 'task' && (
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  addTask();
                }}
              >
                <input ref={first} className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Zum Beispiel: Vokabeln Unit 5" aria-label="Aufgabe" maxLength={200} enterKeyHint="done" />
                <Segmented<'today' | 'tomorrow'>
                  label="Für wann"
                  value={when}
                  onChange={setWhen}
                  options={[
                    { value: 'today', label: 'Heute' },
                    { value: 'tomorrow', label: 'Morgen' },
                  ]}
                />
                <SubjectChips subjects={subjects} value={subjectId} onChange={setSubjectId} />
                <button type="submit" className="btn btn-primary" disabled={!title.trim()}>
                  Aufgabe speichern
                </button>
              </form>
            )}

            {tab === 'card' && (
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  addCard();
                }}
              >
                <input
                  ref={first}
                  className="input"
                  value={front}
                  onChange={(e) => setFront(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      backField.current?.focus();
                    }
                  }}
                  placeholder="Frage oder Begriff"
                  aria-label="Vorderseite"
                  maxLength={1000}
                  enterKeyHint="next"
                />
                <textarea
                  ref={backField}
                  className="input"
                  rows={3}
                  value={back}
                  onChange={(e) => setBack(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      addCard();
                    }
                  }}
                  placeholder="Antwort"
                  aria-label="Rückseite"
                  maxLength={2000}
                />
                <SubjectChips subjects={subjects} value={subjectId} onChange={setSubjectId} />
                <button type="submit" className="btn btn-primary" disabled={!front.trim() || !back.trim()}>
                  Karte speichern{cardCount > 0 ? ` (${cardCount} neu)` : ''}
                </button>
                <p className="hint">Strg oder Cmd plus Enter speichert aus dem Antwortfeld. Schwierigkeit und mehr stellst du später unter Karteikarten ein.</p>
              </form>
            )}

            {tab === 'learned' && (
              <div className="stack">
                <p className="muted">Hast du ohne Timer gelernt? Trag es nach, damit Tagesziel, Plan und Serie stimmen.</p>
                <div className="row quick-subjects" role="group" aria-label="Dauer">
                  {MINUTES.map((m) => (
                    <button key={m} type="button" className="chip" aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
                      {m} min
                    </button>
                  ))}
                </div>
                <SubjectChips subjects={subjects} value={subjectId} onChange={setSubjectId} />
                <button type="button" className="btn btn-primary" onClick={addLearned}>
                  {minutes} min eintragen
                </button>
              </div>
            )}

            <div className="between">
              <span className="hint quick-saved" role="status" aria-live="polite">
                {saved && (
                  <>
                    <Check size={14} aria-hidden="true" /> {saved}
                  </>
                )}
              </span>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setOpen(false);
                  navigate('/notizen?neu=1');
                }}
              >
                <Upload size={14} aria-hidden="true" /> Blatt hochladen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
