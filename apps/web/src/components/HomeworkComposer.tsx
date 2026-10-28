import { dueOptions, ownKey, parseHomeworkEntry, toIsoDate } from '@study/core';
import { Check, Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { formatAgendaDay, uid } from '../lib/format';
import { likelySubjectId } from '../state/daily';
import { useStore } from '../state/store';

type DueMode = 'auto' | 'tomorrow' | 'date';
type DueChip = 'next' | 'tomorrow' | 'date';

/**
 * Hausaufgabe in einer Zeile eintragen: "Mathe S. 45 Nr. 3 bis Freitag". Fach und Frist erkennt die App aus dem Text,
 * sonst ist das Fach der laufenden oder letzten Stunde vorgewählt und die Abgabe die nächste Stunde des Fachs.
 * Enter speichert, das Feld bleibt für die nächste Hausaufgabe offen. Chips und Datum überschreiben jederzeit.
 */
export function HomeworkComposer({ autoFocus = false }: { autoFocus?: boolean }) {
  const { state, dispatch } = useStore();
  const today = toIsoDate(new Date());
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<string | null | undefined>(undefined); // undefined = automatisch
  const [mode, setMode] = useState<DueMode>('auto');
  const [custom, setCustom] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const timeout = useRef<number | undefined>(undefined);
  const fallbackSubject = useMemo(() => likelySubjectId(state, new Date()), []); // eslint-disable-line react-hooks/exhaustive-deps

  const subjects = state.subjects.filter((s) => s.status !== 'dropped' || s.isAdvanced || s.isExamSubject);
  const parsed = parseHomeworkEntry(text, state.subjects, today);
  const subjectId = picked !== undefined ? picked : parsed.subjectId ?? fallbackSubject;
  const options = dueOptions(subjectId, today, state.timetable, state.subjects);
  const due = mode === 'date' && custom ? custom : mode === 'tomorrow' ? options.tomorrow : parsed.due ?? options.next;

  const active: DueChip = mode === 'date' ? 'date' : due === options.next ? 'next' : due === options.tomorrow ? 'tomorrow' : 'date';
  const subjectName = state.subjects.find((s) => s.id === subjectId)?.name ?? null;

  const save = () => {
    const title = parsed.title.trim();
    if (!title) return;
    const id = uid();
    dispatch({ type: 'addTask', task: { id, title, subjectId, minutes: null, date: due, done: false, externalId: ownKey(id) } });
    setText('');
    setPicked(undefined);
    setMode('auto');
    setCustom('');
    setSaved(`${subjectName ?? 'Hausaufgabe'} eingetragen, fällig ${formatAgendaDay(due, today).toLowerCase()}`);
    window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => setSaved(null), 3000);
    input.current?.focus();
  };

  return (
    <form
      className="hw-compose"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="hw-compose-row">
        <input
          ref={input}
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mathe S. 45 Nr. 3 bis Freitag"
          aria-label="Neue Hausaufgabe"
          maxLength={300}
          enterKeyHint="done"
          autoFocus={autoFocus}
        />
        <button type="submit" className="btn btn-primary" disabled={!parsed.title.trim()} aria-label="Hausaufgabe eintragen">
          <Plus size={18} aria-hidden="true" /> <span className="hw-compose-label">Eintragen</span>
        </button>
      </div>

      <div className="row quick-subjects" role="group" aria-label="Fach">
        {subjects.map((s) => (
          <button key={s.id} type="button" className="chip" aria-pressed={subjectId === s.id} onClick={() => setPicked(subjectId === s.id ? null : s.id)}>
            <span className="dot" style={{ background: s.color }} />
            {s.name}
          </button>
        ))}
      </div>

      <div className="row quick-subjects" role="group" aria-label="Abgabe">
        <button type="button" className="chip" aria-pressed={active === 'next'} onClick={() => setMode('auto')}>
          {options.fromTimetable ? 'Nächste Stunde' : 'Nächster Schultag'} · {formatAgendaDay(options.next, today)}
        </button>
        {options.tomorrow !== options.next && (
          <button type="button" className="chip" aria-pressed={active === 'tomorrow'} onClick={() => setMode('tomorrow')}>
            Morgen
          </button>
        )}
        <button
          type="button"
          className="chip"
          aria-pressed={active === 'date'}
          onClick={() => {
            setCustom(due);
            setMode('date');
          }}
        >
          Anderer Tag{active === 'date' ? ` · ${formatAgendaDay(due, today)}` : ''}
        </button>
        {active === 'date' && (
          <input
            type="date"
            className="input hw-compose-date"
            aria-label="Abgabetag"
            value={due}
            min={today}
            onChange={(e) => {
              if (!e.target.value) return;
              setCustom(e.target.value);
              setMode('date');
            }}
          />
        )}
      </div>

      <p className="hint quick-saved hw-compose-note" role="status" aria-live="polite">
        {saved ? (
          <>
            <Check size={14} aria-hidden="true" /> {saved}
          </>
        ) : (
          <span style={{ color: 'var(--ink-2)' }}>Fach und Frist erkennt die App aus dem Text, zum Beispiel „Englisch Essay bis 12.11.“.</span>
        )}
      </p>
    </form>
  );
}
