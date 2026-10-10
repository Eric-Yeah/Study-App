import {
  parseSubstitutions,
  parseTimetable,
  planImport,
  toIsoDate,
  type ImportItem,
  type SubstitutionEntry,
  type Timetable,
} from '@study/core';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDateShort } from '../lib/format';
import { buildExam, LANIS_ERRORS, lanisErrorCode, type LanisResponse } from '../lib/lanisApply';
import { useLanisAuto } from '../lib/lanisAuto';
import { supabase } from '../lib/supabase';
import { useStore } from '../state/store';

const PROFILE_KEY = 'study-app-lanis-profile'; // nur Schulnummer und Benutzername, nie das Passwort

function savedProfile(): { schoolId: string; username: string } {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignorieren
  }
  return { schoolId: '', username: '' };
}

async function errorMessage(error: unknown): Promise<string> {
  const code = await lanisErrorCode(error);
  return (code && LANIS_ERRORS[code]) || 'Der Import ist fehlgeschlagen. Ist die Funktion lanis-calendar in Supabase eingerichtet?';
}

const STATUS_LABEL = { new: 'neu', known: 'schon importiert', changed: 'Datum geändert' } as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function LanisImport() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const auto = useLanisAuto();
  const [remember, setRemember] = useState(auto.enabled);
  const [form, setForm] = useState({ ...savedProfile(), password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ImportItem[] | null>(null);
  const [subjectFor, setSubjectFor] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [plans, setPlans] = useState<{ timetable: Timetable | null; subs: SubstitutionEntry[] | null; errors: Record<string, string> } | null>(null);
  const [takeTimetable, setTakeTimetable] = useState(true);
  const [takeSubs, setTakeSubs] = useState(true);

  const fetchExams = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const creds = { schoolId: form.schoolId.trim(), username: form.username.trim(), password: form.password };
    const { data, error: err } = await supabase.functions.invoke<LanisResponse>('lanis-calendar', { body: creds });
    setForm((f) => ({ ...f, password: '' }));
    setBusy(false);
    if (err || !data) {
      setError(await errorMessage(err));
      return;
    }
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ schoolId: creds.schoolId, username: creds.username }));
    } catch {
      // ignorieren
    }
    // Erst nach erfolgreicher Anmeldung und nur mit Haken: Zugangsdaten verschlüsselt auf diesem Gerät merken.
    if (remember) await auto.enable(creds);
    const list = planImport(data.events ?? [], state.subjects, state.exams, toIsoDate(new Date()));
    const timetable = data.timetableHtml ? parseTimetable(data.timetableHtml) : null;
    const subs = data.substitutions ? data.substitutions.flatMap((d) => parseSubstitutions(d.date, d.raw)) : null;
    setPlans({ timetable: timetable && timetable.lessons.length > 0 ? timetable : null, subs, errors: data.errors ?? {} });
    setItems(list);
    setSubjectFor(Object.fromEntries(list.map((i) => [i.lanis.externalId, i.subjectId ?? ''])));
    setSelected(Object.fromEntries(list.map((i) => [i.lanis.externalId, i.status !== 'known' && i.subjectId !== null])));
  };

  const chosen = (items ?? []).filter((i) => selected[i.lanis.externalId] && subjectFor[i.lanis.externalId]);

  const wantTimetable = Boolean(plans?.timetable && takeTimetable);
  const wantSubs = Boolean(plans?.subs && takeSubs);

  const doImport = () => {
    const now = new Date().toISOString();
    if (wantTimetable && plans?.timetable) dispatch({ type: 'setTimetable', timetable: plans.timetable, at: now });
    if (wantSubs && plans?.subs) dispatch({ type: 'setSubstitutions', substitutions: plans.subs, at: now });
    for (const item of chosen) {
      dispatch({ type: 'upsertExam', exam: buildExam(item, subjectFor[item.lanis.externalId], state.subjects) });
    }
    navigate(chosen.length > 0 ? '/plan' : '/');
  };

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 720 }}>
      <div className="page-head">
        <div>
          <h1>Aus Lanis importieren</h1>
          <p className="sub">Liest Klausuren, Stundenplan und Vertretungen aus deinem Schulportal. Du prüfst alles, bevor etwas gespeichert wird.</p>
        </div>
      </div>

      <form className="card stack" onSubmit={fetchExams}>
        <label className="field">
          <span>Schulnummer</span>
          <input
            className="input"
            inputMode="numeric"
            required
            value={form.schoolId}
            onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Benutzername (ohne Schulnummer)</span>
          <input
            className="input"
            required
            autoComplete="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="vorname.nachname"
          />
        </label>
        <label className="field">
          <span>Passwort für das Schulportal</span>
          <input
            className="input"
            type="password"
            required
            autoComplete="off"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <label className="task" style={{ cursor: 'pointer', padding: '4px 0' }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <div style={{ flex: 1 }}>
            <strong>Auf diesem Gerät merken und automatisch aktualisieren</strong>
            <div className="hint">
              Die App holt Stundenplan, Vertretungen und Klausuren dann von selbst, wenn du sie öffnest. Das Passwort wird verschlüsselt nur auf
              diesem Gerät gespeichert, nie auf dem Server, und lässt sich unter Einstellungen löschen.
            </div>
          </div>
        </label>
        <p className="hint">
          {remember
            ? 'Gemerkt werden Schulnummer, Benutzername und das verschlüsselte Passwort, nur auf diesem Gerät.'
            : 'Ohne Haken wird das Passwort nur für diese Abfrage weitergegeben und nicht gespeichert. Gemerkt werden nur Schulnummer und Benutzername, auf diesem Gerät.'}
        </p>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Lese Schulportal …' : 'Aus Lanis abrufen'}
        </button>
      </form>

      {plans && (
        <div className="card stack">
          <h2>Stundenplan und Vertretungen</h2>
          {plans.timetable ? (
            <label className="task" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={takeTimetable} onChange={(e) => setTakeTimetable(e.target.checked)} />
              <div style={{ flex: 1 }}>
                <strong>Stundenplan übernehmen</strong>
                <div className="hint">
                  {plural(plans.timetable.lessons.length, 'Stunde', 'Stunden')} pro Woche
                  {plans.timetable.validFrom ? ` · gültig ab ${formatDateShort(plans.timetable.validFrom)}` : ''} · ersetzt den gespeicherten Plan
                </div>
              </div>
            </label>
          ) : (
            <p className="hint">
              {plans.errors.timetable ? 'Der persönliche Stundenplan konnte nicht gelesen werden.' : 'Kein Stundenplan gefunden.'}
            </p>
          )}
          {plans.subs ? (
            <label className="task" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={takeSubs} onChange={(e) => setTakeSubs(e.target.checked)} />
              <div style={{ flex: 1 }}>
                <strong>Vertretungsplan übernehmen</strong>
                <div className="hint">
                  {plans.subs.length === 0
                    ? 'Aktuell keine Vertretungen für dich.'
                    : `${plural(plans.subs.length, 'Eintrag', 'Einträge')} für die nächsten Tage.`}{' '}
                  Der Stand gilt nur zum Abruf, ruf ihn bei Bedarf neu ab.
                </div>
              </div>
            </label>
          ) : (
            <p className="hint">{plans.errors.substitutions ? 'Der Vertretungsplan konnte nicht gelesen werden.' : 'Kein Vertretungsplan gefunden.'}</p>
          )}
        </div>
      )}

      {items && (
        <div className="card stack">
          <h2>{items.length === 0 ? 'Keine kommenden Klausuren gefunden' : `${items.length} ${items.length === 1 ? 'kommende Klausur' : 'kommende Klausuren'}`}</h2>
          {items.some((i) => i.subjectId === null) && (
            <p className="hint">
              Zu manchen Klausuren fehlt ein Fach in der App. Lege es unter <Link to="/faecher">Fächer</Link> an und rufe
              die Klausuren danach noch einmal ab, oder wähle ein anderes Fach aus.
            </p>
          )}
          {items.map((i) => {
            const id = i.lanis.externalId;
            return (
              <div className="task" key={id}>
                <input
                  type="checkbox"
                  aria-label={`${i.lanis.abbr} am ${formatDateShort(i.lanis.date)} importieren`}
                  checked={Boolean(selected[id])}
                  onChange={(e) => setSelected({ ...selected, [id]: e.target.checked })}
                />
                <div style={{ flex: 1 }}>
                  <strong>{formatDateShort(i.lanis.date)}</strong> · {i.lanis.abbr}
                  {i.lanis.isAdvanced ? ' (LK)' : ''}
                  <div className="hint">
                    {STATUS_LABEL[i.status]}
                    {i.status === 'changed' && i.existing ? `, bisher ${formatDateShort(i.existing.date)}` : ''}
                  </div>
                </div>
                <select
                  className="input"
                  style={{ maxWidth: 200 }}
                  aria-label="Fach"
                  value={subjectFor[id] ?? ''}
                  onChange={(e) => setSubjectFor({ ...subjectFor, [id]: e.target.value })}
                >
                  <option value="">Kein Fach</option>
                  {state.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {(items || plans) && (
        <button type="button" className="btn btn-primary" disabled={chosen.length === 0 && !wantTimetable && !wantSubs} onClick={doImport}>
          Übernehmen
          {chosen.length > 0 ? `: ${plural(chosen.length, 'Klausur', 'Klausuren')}` : ''}
          {wantTimetable ? `${chosen.length > 0 ? ', ' : ': '}Stundenplan` : ''}
          {wantSubs ? `${chosen.length > 0 || wantTimetable ? ', ' : ': '}Vertretungen` : ''}
        </button>
      )}
    </div>
  );
}
