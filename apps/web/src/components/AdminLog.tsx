import { CONFIG, examModelAccuracy, formatTokens, formatUsd, toIsoDate, usageByMonth, type MonthUsage } from '@study/core';
import { Copy, RefreshCw, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AdminError, fetchAdminReport, type AdminLogRow, type AdminReport } from '../lib/adminApi';
import { useAuth } from '../lib/auth';
import { AdminAccounts, AdminSettingsForm } from './AdminAccounts';
import { Segmented } from './Segmented';
import { APP_VERSION } from '../releaseNotes';
import { useStore } from '../state/store';

const when = (iso: string) =>
  new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso));

const bytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`);

const statusClass = (s: string) => (s === 'ok' ? 'ok' : s === 'unsicher' ? 'warn' : 'bad');

const COUNT_LABELS: Record<string, string> = {
  subjects: 'Fächer',
  exams: 'Klausuren',
  exam_topics: 'Themen',
  focus_sessions: 'Fokus-Sessions',
  tasks: 'Aufgaben',
  daily_checkins: 'Check-ins',
  lesson_notes: 'Notizen',
  worksheet_files: 'Bilder für die KI',
  flashcards: 'Karteikarten',
  exam_reviews: 'Korrigierte Klausuren',
  exam_files: 'Seiten von Klausuren',
  practice_exams: 'Übungsklausuren',
  task_styles: 'Aufgabenstile',
};

const KIND_LABELS: Record<string, string> = {
  summarize: 'Zusammenfassung',
  cards: 'Karten',
  exam: 'Korrektur',
  exam_learn: 'Lernen aus Korrektur',
  practice: 'Übungsklausur',
  topics: 'Themenliste',
  style: 'Aufgabenstil',
};

function reportText(report: AdminReport, months: MonthUsage[], version: string): string {
  const lines = [`Study App ${version}`, `Stand ${report.serverTime}`, '', 'KI-Verbrauch'];
  for (const m of months) {
    lines.push(`${m.month}: ${m.requests} Anfragen, ${formatUsd(m.costUsd)}`);
    for (const x of m.models) lines.push(`  ${x.model}: ${x.requests} Anfragen, ${formatTokens(x.inputTokens)} ein, ${formatTokens(x.outputTokens)} aus, ${formatUsd(x.costUsd)}`);
  }
  lines.push('', 'Letzte KI-Anfragen');
  for (const r of report.log.slice(0, 50)) {
    lines.push(`${r.at} ${r.kind}/${r.task} ${r.model} ${r.effort} ${r.input_tokens}/${r.output_tokens} ${formatUsd(Number(r.cost_usd))} ${r.duration_ms} ms ${r.status}${r.detail ? ` (${r.detail})` : ''}`);
  }
  lines.push('', 'Daten', ...Object.entries(report.counts).map(([k, v]) => `${COUNT_LABELS[k] ?? k}: ${v ?? '?'}`));
  return lines.join('\n');
}

/** Das Protokoll selbst, nach dem Passwort. */
function Report({ report, onRefresh, busy }: { report: AdminReport; onRefresh: () => void; busy: boolean }) {
  const { user } = useAuth();
  const { state, sync, syncError } = useStore();
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [shown, setShown] = useState(40);
  const [copied, setCopied] = useState(false);
  const months = useMemo(() => usageByMonth(report.usage, CONFIG.ai.prices), [report.usage]);
  const thisMonth = months.find((m) => m.month === new Date().toISOString().slice(0, 7));
  const used = (thisMonth?.costUsd ?? 0) / CONFIG.ai.monthlyBudgetUsd;
  const log = report.log.filter((r) => !onlyErrors || (r.status !== 'ok' && r.status !== 'unsicher'));
  const accuracy = useMemo(() => examModelAccuracy(state.examReviews, state.subjects), [state.examReviews, state.subjects]);
  const due = state.cards.filter((c) => c.reps > 0 && c.due <= toIsoDate(new Date())).length;
  let deviceId = '';
  try {
    deviceId = localStorage.getItem('study-app-device-id') ?? '';
  } catch {
    /* gesperrt */
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportText(report, months, APP_VERSION));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ohne Zugriff auf die Zwischenablage */
    }
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={busy} onClick={onRefresh}>
          <RefreshCw size={16} aria-hidden="true" /> {busy ? 'Lädt …' : 'Aktualisieren'}
        </button>
        <button type="button" className="btn" onClick={() => void copy()}>
          <Copy size={16} aria-hidden="true" /> {copied ? 'Kopiert' : 'Als Text kopieren'}
        </button>
      </div>

      <section className="card stack">
        <h2>App</h2>
        <dl className="admin-facts">
          <div><dt>Version</dt><dd>{APP_VERSION}</dd></div>
          <div><dt>Konto</dt><dd>{user?.email ?? '–'}</dd></div>
          <div><dt>Gerät</dt><dd>{deviceId ? deviceId.slice(0, 8) : '–'}</dd></div>
          <div><dt>Abgleich</dt><dd>{sync.live ? 'live verbunden' : 'beim Öffnen'}{syncError ? ` · Fehler: ${syncError}` : ''}</dd></div>
          <div><dt>Server-Zeit</dt><dd>{when(report.serverTime)}</dd></div>
          <div><dt>Lanis</dt><dd>Plan {state.timetableAt ? when(state.timetableAt) : 'noch nie'}, Vertretung {state.substitutionsAt ? when(state.substitutionsAt) : 'noch nie'}</dd></div>
          <div><dt>Overload</dt><dd>{state.fitness.length > 0 ? `letzter Tag ${state.fitness[state.fitness.length - 1].date}` : 'keine Daten'}</dd></div>
        </dl>
      </section>

      <section className="card stack">
        <h2>KI-Verbrauch</h2>
        <div className="between">
          <span className="hint">Dieser Monat</span>
          <span className={`hint${used >= 0.9 ? ' warn-text' : ''}`}>
            {formatUsd(thisMonth?.costUsd ?? 0)} von {formatUsd(CONFIG.ai.monthlyBudgetUsd)} ({Math.round(used * 100)} %)
          </span>
        </div>
        <div className="bar" aria-hidden="true">
          <i style={{ width: `${Math.min(100, used * 100)}%`, background: used >= 0.9 ? 'var(--warn)' : undefined }} />
        </div>
        {months.length === 0 && <p className="hint">Noch keine KI-Anfragen.</p>}
        {months.map((m) => (
          <div key={m.month} className="stack" style={{ gap: 6 }}>
            <div className="between">
              <strong>{m.month}</strong>
              <span className="hint">
                {m.requests} Anfragen · {formatUsd(m.costUsd)}
              </span>
            </div>
            <div className="admin-table" role="table" aria-label={`Verbrauch ${m.month}`}>
              <div className="admin-row head" role="row">
                <span role="columnheader">Modell</span>
                <span role="columnheader">Anfragen</span>
                <span role="columnheader">Ein</span>
                <span role="columnheader">Aus</span>
                <span role="columnheader">Kosten</span>
              </div>
              {m.models.map((x) => (
                <div key={x.model} className="admin-row" role="row">
                  <span role="cell">{x.model.replace('claude-', '')}</span>
                  <span role="cell">{x.requests}</span>
                  <span role="cell">{formatTokens(x.inputTokens)}</span>
                  <span role="cell">{formatTokens(x.outputTokens)}</span>
                  <span role="cell">{formatUsd(x.costUsd)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <p className="hint">
          Modelle je Aufgabe: {Object.entries(CONFIG.ai.models).map(([task, m]) => `${task} ${m.model.replace('claude-', '')} (${m.effort})`).join(' · ')}
        </p>
      </section>

      <section className="card stack">
        <div className="between">
          <h2>KI-Protokoll</h2>
          <button type="button" className="chip" aria-pressed={onlyErrors} onClick={() => setOnlyErrors(!onlyErrors)}>
            nur Fehler
          </button>
        </div>
        {log.length === 0 ? (
          <p className="hint">{onlyErrors ? 'Keine Fehler.' : 'Noch keine Einträge.'}</p>
        ) : (
          <ul className="admin-log">
            {log.slice(0, shown).map((r: AdminLogRow) => (
              <li key={r.id} className={statusClass(r.status)}>
                <div className="between">
                  <strong>
                    {KIND_LABELS[r.kind] ?? r.kind} · {r.task}
                  </strong>
                  <span className={`tag ${r.status === 'ok' ? '' : r.status === 'unsicher' ? 'warn' : 'danger'}`}>{r.status}</span>
                </div>
                <span className="hint">
                  {when(r.at)} · {r.model.replace('claude-', '')} {r.effort} · {formatTokens(r.input_tokens)} ein, {formatTokens(r.output_tokens)} aus · {formatUsd(Number(r.cost_usd))} ·{' '}
                  {(r.duration_ms / 1000).toFixed(1).replace('.', ',')} s
                </span>
                {r.detail && <span className="hint">{r.detail}</span>}
              </li>
            ))}
          </ul>
        )}
        {log.length > shown && (
          <button type="button" className="btn" onClick={() => setShown(shown + 40)}>
            Mehr anzeigen ({log.length - shown} weitere)
          </button>
        )}
      </section>

      <section className="card stack">
        <h2>Klausurenkorrektur</h2>
        {accuracy.length === 0 ? (
          <p className="hint">
            Noch keine Klausur mit Note der Lehrkraft ({state.examReviews.length} korrigiert). Sobald Noten eingetragen sind, steht hier, wie nah jedes Modell an der Lehrkraft liegt.
          </p>
        ) : (
          <dl className="admin-facts">
            {accuracy.map((a) => (
              <div key={a.model}>
                <dt>{a.model}</dt>
                <dd>
                  {a.n} {a.n === 1 ? 'Klausur' : 'Klausuren'}, im Schnitt {a.meanAbs.toFixed(1).replace('.', ',')} Punkte daneben
                  {a.bias !== 0 && ` (meist ${a.bias > 0 ? 'zu großzügig' : 'zu streng'})`}, {Math.round(a.exact * 100)} % höchstens einen Punkt daneben
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="card stack">
        <h2>Server</h2>
        <dl className="admin-facts">
          <div><dt>Anthropic-Schlüssel</dt><dd className={report.secrets.anthropic ? 'ok-text' : 'warn-text'}>{report.secrets.anthropic ? 'gesetzt' : 'fehlt'}</dd></div>
          <div><dt>Groq-Schlüssel</dt><dd className={report.secrets.groq ? 'ok-text' : 'warn-text'}>{report.secrets.groq ? 'gesetzt' : 'fehlt'}</dd></div>
          <div><dt>Speicher PDFs</dt><dd>{report.storage.documents ? `${report.storage.documents.files} Dateien, ${bytes(report.storage.documents.bytes)}` : '?'}</dd></div>
          <div><dt>Speicher Bilder</dt><dd>{report.storage.worksheets ? `${report.storage.worksheets.files} Dateien, ${bytes(report.storage.worksheets.bytes)}` : '?'}</dd></div>
          {report.storage.exams && <div><dt>Speicher Klausuren</dt><dd>{report.storage.exams.files} Dateien, {bytes(report.storage.exams.bytes)}</dd></div>}
        </dl>
      </section>

      <section className="card stack">
        <h2>Daten</h2>
        <dl className="admin-facts">
          {Object.entries(report.counts).map(([key, value]) => (
            <div key={key}><dt>{COUNT_LABELS[key] ?? key}</dt><dd>{value ?? '?'}</dd></div>
          ))}
          <div><dt>Karten heute fällig</dt><dd>{due}</dd></div>
          <div><dt>Notizen mit PDF</dt><dd>{state.notes.filter((n) => n.pdfPath).length}</dd></div>
        </dl>
      </section>
    </div>
  );
}

/** Verstecktes Admin-Protokoll: erst Passwort, dann alle Zahlen. Das Passwort bleibt nur im Speicher dieses Fensters. */
export function AdminLog({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [entered, setEntered] = useState('');
  const [report, setReport] = useState<AdminReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'ich' | 'konten' | 'einstellungen'>('ich');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const load = async (pw: string) => {
    setBusy(true);
    setError(null);
    try {
      setReport(await fetchAdminReport(pw));
      setEntered(pw);
    } catch (e) {
      setError(e instanceof AdminError ? e.message : 'Das Protokoll ist nicht erreichbar.');
      if (e instanceof AdminError && e.code === 'wrong_password') setReport(null);
    } finally {
      setBusy(false);
      setPassword('');
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password) void load(password);
  };

  return (
    <div className="admin-overlay" role="dialog" aria-modal="true" aria-label="Admin-Protokoll">
      <div className="admin-sheet stack" style={{ gap: 18 }}>
        <div className="between">
          <h1>Admin-Protokoll</h1>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Schließen" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {!report ? (
          <form className="card stack" onSubmit={submit}>
            <label className="field">
              <span>Passwort</span>
              <input className="input" type="password" autoFocus autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary" disabled={busy || !password}>
              {busy ? 'Prüfe …' : 'Öffnen'}
            </button>
          </form>
        ) : (
          <>
            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
            <Segmented<'ich' | 'konten' | 'einstellungen'>
              label="Bereich"
              value={view}
              onChange={setView}
              options={[
                { value: 'ich', label: 'Ich' },
                { value: 'konten', label: 'Konten' },
                { value: 'einstellungen', label: 'Einstellungen' },
              ]}
            />
            {view === 'ich' && <Report report={report} busy={busy} onRefresh={() => void load(entered)} />}
            {view === 'konten' && <AdminAccounts password={entered} />}
            {view === 'einstellungen' && <AdminSettingsForm password={entered} />}
          </>
        )}
      </div>
    </div>
  );
}
