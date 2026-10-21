import { addDays, newCard, toIsoDate } from '@study/core';
import { Plus, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { uid } from '../lib/format';
import { useStore } from '../state/store';
import { CardForm } from './CardForm';
import { Segmented } from './Segmented';

/**
 * Schnell hinzufügen: ein Blatt für Aufgabe, Karte oder Arbeitsblatt, von überall erreichbar (Knopf oben am Handy, in der Seitenleiste,
 * Taste N am Mac, Verknüpfung der installierten App über /neu). Die Eingabe merkt sich Fach und Tag, damit mehrere Einträge schnell gehen.
 */
export type QuickKind = 'task' | 'card' | 'sheet';

interface QuickApi {
  open: (kind?: QuickKind) => void;
}

const QuickContext = createContext<QuickApi | null>(null);

export function useQuickAdd(): QuickApi {
  const ctx = useContext(QuickContext);
  if (!ctx) throw new Error('useQuickAdd muss innerhalb von QuickAddProvider verwendet werden');
  return ctx;
}

const KINDS: { value: QuickKind; label: string }[] = [
  { value: 'task', label: 'Aufgabe' },
  { value: 'card', label: 'Karte' },
  { value: 'sheet', label: 'Blatt' },
];

function TaskForm({ subjectId, setSubjectId }: { subjectId: string | null; setSubjectId: (id: string | null) => void }) {
  const { state, dispatch } = useStore();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<'today' | 'tomorrow'>('today');
  const [added, setAdded] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const save = () => {
    const text = title.trim();
    if (!text) return;
    const today = toIsoDate(new Date());
    dispatch({
      type: 'addTask',
      task: { id: uid(), title: text, subjectId, minutes: null, date: when === 'today' ? today : addDays(today, 1), done: false },
    });
    setAdded(`„${text}“ ${when === 'today' ? 'für heute' : 'für morgen'} gespeichert.`);
    setTitle('');
    input.current?.focus();
  };

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input ref={input} className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Was ist zu tun? (zum Beispiel Vokabeln Unit 5)" aria-label="Neue Aufgabe" maxLength={200} enterKeyHint="done" />
      <div className="row note-filter" role="group" aria-label="Fach der Aufgabe">
        <button type="button" className="chip" aria-pressed={subjectId === null} onClick={() => setSubjectId(null)}>
          Ohne Fach
        </button>
        {state.subjects
          .filter((s) => s.status !== 'dropped' || s.isAdvanced || s.isExamSubject)
          .map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={subjectId === s.id} onClick={() => setSubjectId(s.id)}>
              <span className="dot" style={{ background: s.color }} aria-hidden="true" />
              {s.name}
            </button>
          ))}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Segmented<'today' | 'tomorrow'>
          label="Tag"
          value={when}
          onChange={setWhen}
          options={[
            { value: 'today', label: 'Heute' },
            { value: 'tomorrow', label: 'Morgen' },
          ]}
        />
        <button type="submit" className="btn btn-primary" disabled={title.trim() === ''}>
          Hinzufügen
        </button>
      </div>
      {added && (
        <p className="notice ok" role="status">
          {added}
        </p>
      )}
    </form>
  );
}

function QuickSheet({ kind, setKind, onClose }: { kind: QuickKind; setKind: (k: QuickKind) => void; onClose: () => void }) {
  const { dispatch } = useStore();
  const navigate = useNavigate();
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const { state } = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="quick-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="quick-sheet stack" role="dialog" aria-modal="true" aria-label="Schnell hinzufügen" data-no-reload>
        <div className="between">
          <h2>Schnell hinzufügen</h2>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Schließen" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <Segmented<QuickKind> label="Was?" value={kind} onChange={setKind} options={KINDS} />
        {kind === 'task' && <TaskForm subjectId={subjectId} setSubjectId={setSubjectId} />}
        {kind === 'card' && (
          <CardForm
            subjects={state.subjects}
            defaultSubjectId={subjectId}
            onClose={onClose}
            onSave={(c) => {
              setSubjectId(c.subjectId);
              dispatch({ type: 'upsertCard', card: newCard({ id: uid(), subjectId: c.subjectId, noteId: null, front: c.front, back: c.back, difficulty: c.difficulty }, toIsoDate(new Date()), new Date().toISOString()) });
            }}
          />
        )}
        {kind === 'sheet' && (
          <div className="stack">
            <p className="muted">Fotos oder PDFs vom Arbeitsblatt wählen, zu einem PDF zusammenfügen und ablegen.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onClose();
                navigate('/notizen?neu=1');
              }}
            >
              Blatt hochladen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const { state } = useStore();
  const [kind, setKind] = useState<QuickKind | null>(null);
  const [last, setLast] = useState<QuickKind>('task');
  const ready = state.onboarded;

  const open = useCallback((k?: QuickKind) => setKind(k ?? last), [last]);
  const change = useCallback((k: QuickKind) => {
    setLast(k);
    setKind(k);
  }, []);
  const close = useCallback(() => setKind(null), []);

  // Taste N öffnet das Blatt (nicht beim Tippen in einem Feld, nicht mit Strg oder Befehl)
  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      setKind((k) => k ?? last);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ready, last]);

  const api = useMemo<QuickApi>(() => ({ open }), [open]);
  return (
    <QuickContext.Provider value={api}>
      {children}
      {ready && kind && <QuickSheet kind={kind} setKind={change} onClose={close} />}
    </QuickContext.Provider>
  );
}

/** Der runde Knopf zum Öffnen, in der Kopfzeile am Handy und in der Seitenleiste. */
export function QuickAddButton({ withKey = false }: { withKey?: boolean }) {
  const { open } = useQuickAdd();
  return (
    <button type="button" className="quick-open" onClick={() => open()} aria-label="Schnell hinzufügen" aria-keyshortcuts="n">
      <Plus size={20} aria-hidden="true" />
      {withKey && (
        <>
          <span>Neu</span>
          <kbd aria-hidden="true">N</kbd>
        </>
      )}
    </button>
  );
}

/** Adresse /neu (Verknüpfung der installierten App): öffnet das Blatt und geht zu Heute. ?was=karte oder blatt wählt die Art. */
export function QuickAddRoute() {
  const { open } = useQuickAdd();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const was = params.get('was');
    open(was === 'karte' ? 'card' : was === 'blatt' ? 'sheet' : 'task');
    navigate('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
