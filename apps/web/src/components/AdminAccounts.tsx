import { AI_FEATURE_LABELS, AI_FEATURES, CONFIG, costUsd, formatUsd, type AiFeature } from '@study/core';
import { Check, RefreshCw, ShieldOff, Trash2, UserCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AdminError, deleteAccount, fetchAccounts, saveAdminSettings, updateAccount, type AdminAccount, type AdminSettings } from '../lib/adminApi';

const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : 'noch nie');
const costOf = (a: AdminAccount) => a.usage.reduce((s, u) => s + costUsd(u.model, Number(u.input_tokens), Number(u.output_tokens), CONFIG.ai.prices), 0);
const requestsOf = (a: AdminAccount) => a.usage.reduce((s, u) => s + Number(u.requests), 0);
const STATUS: Record<string, string> = { pending: 'wartet', active: 'aktiv', blocked: 'gesperrt' };

/** Konten im Admin-Protokoll: freigeben, sperren, KI-Funktionen pro Konto, löschen. Zahlen, keine Inhalte. */
export function AdminAccounts({ password }: { password: string }) {
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy('load');
    setError(null);
    try {
      const r = await fetchAccounts(password);
      setAccounts(r.accounts);
      setSettings(r.settings);
    } catch (e) {
      setError(e instanceof AdminError ? e.message : 'Die Konten konnten nicht geladen werden.');
    } finally {
      setBusy(null);
    }
  }, [password]);
  useEffect(() => void load(), [load]);

  const act = async (id: string, run: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await run();
      await load();
    } catch (e) {
      setError(e instanceof AdminError ? e.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(null);
      setConfirmDelete(null);
    }
  };

  const friends = (accounts ?? []).filter((a) => !a.is_admin);
  const poolSpent = friends.reduce((s, a) => s + costOf(a), 0);
  const waiting = friends.filter((a) => a.status === 'pending').length;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <p className="hint">
          {accounts ? `${accounts.length} Konten · ${waiting} ${waiting === 1 ? 'wartet' : 'warten'} auf Freigabe` : 'Lädt …'}
          {settings ? ` · Topf der Freunde: ${formatUsd(poolSpent)} von ${formatUsd(settings.friendsBudgetUsd)}` : ''}
        </p>
        <button type="button" className="btn" disabled={busy !== null} onClick={() => void load()}>
          <RefreshCw size={16} aria-hidden="true" /> Aktualisieren
        </button>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <ul className="admin-accounts">
        {(accounts ?? []).map((a) => {
          const features = new Set(a.ai_features ?? []);
          const toggle = (f: AiFeature) => {
            const next = features.has(f) ? [...features].filter((x) => x !== f) : [...features, f];
            void act(a.id, () => updateAccount(password, a.id, { features: next }));
          };
          return (
            <li key={a.id} className="card stack admin-account">
              <div className="between" style={{ gap: 8, alignItems: 'flex-start' }}>
                <div className="admin-account-main">
                  <strong>{a.name || a.email || a.id.slice(0, 8)}</strong>
                  <span className="hint">{a.email}</span>
                </div>
                <span className={`pill${a.status === 'pending' ? ' pill-warn' : ''}`}>{a.is_admin ? 'Admin' : STATUS[a.status ?? 'pending']}</span>
              </div>
              <p className="hint">
                Registriert {day(a.created_at)}
                {a.confirmed ? '' : ' · E-Mail nicht bestätigt'} · zuletzt angemeldet {day(a.last_sign_in_at)}
              </p>
              <p className="hint">
                {a.subjects} Fächer · {a.exams} Klausuren · {a.notes} Notizen · {a.cards} Karten · {a.reviews} Korrekturen · {a.practice} Übungsklausuren · {a.sessions} Lerneinheiten
                {' · '}KI diesen Monat: {requestsOf(a)} Anfragen, {formatUsd(costOf(a))}
              </p>
              {!a.is_admin && (
                <>
                  <div className="chip-grid" role="group" aria-label={`KI-Funktionen für ${a.email ?? 'Konto'}`}>
                    {AI_FEATURES.map((f) => (
                      <button key={f} type="button" className="chip" aria-pressed={features.has(f)} disabled={busy !== null || a.status !== 'active'} onClick={() => toggle(f)}>
                        {features.has(f) && <Check size={14} aria-hidden="true" />} {AI_FEATURE_LABELS[f]}
                      </button>
                    ))}
                  </div>
                  {a.status !== 'active' && <p className="hint">KI-Funktionen lassen sich nach der Freigabe einschalten.</p>}
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {a.status !== 'active' ? (
                      <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void act(a.id, () => updateAccount(password, a.id, { status: 'active' }))}>
                        <UserCheck size={16} aria-hidden="true" /> {a.status === 'blocked' ? 'Entsperren' : 'Freigeben'}
                      </button>
                    ) : (
                      <button type="button" className="btn" disabled={busy !== null} onClick={() => void act(a.id, () => updateAccount(password, a.id, { status: 'blocked' }))}>
                        <ShieldOff size={16} aria-hidden="true" /> Sperren
                      </button>
                    )}
                    {confirmDelete === a.id ? (
                      <>
                        <button type="button" className="btn btn-danger" disabled={busy !== null} onClick={() => void act(a.id, () => deleteAccount(password, a.id))}>
                          <Trash2 size={16} aria-hidden="true" /> Endgültig löschen
                        </button>
                        <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>
                          Abbrechen
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn" disabled={busy !== null} onClick={() => setConfirmDelete(a.id)}>
                        <Trash2 size={16} aria-hidden="true" /> Löschen
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Einstellungen für Freunde: gemeinsamer Topf und Tageslimit der KI-Karten. */
export function AdminSettingsForm({ password }: { password: string }) {
  const [budget, setBudget] = useState('');
  const [limit, setLimit] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchAccounts(password)
      .then((r) => {
        setBudget(String(r.settings.friendsBudgetUsd).replace('.', ','));
        setLimit(String(r.settings.cardsDailyLimit));
      })
      .catch((e) => setError(e instanceof AdminError ? e.message : 'Die Einstellungen konnten nicht geladen werden.'));
  }, [password]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const r = await saveAdminSettings(password, { friendsBudgetUsd: Number(budget.replace(',', '.')), cardsDailyLimit: Number(limit) });
      setBudget(String(r.settings.friendsBudgetUsd).replace('.', ','));
      setLimit(String(r.settings.cardsDailyLimit));
      setMsg('Gespeichert.');
    } catch (e) {
      setError(e instanceof AdminError ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <label className="field">
        <span>Topf der Freunde pro Monat (in $)</span>
        <input className="input" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d,.]/g, '').slice(0, 6))} />
      </label>
      <p className="hint">Alle freigeschalteten Freunde teilen sich diesen Betrag. Dein eigenes Budget ({formatUsd(CONFIG.ai.monthlyBudgetUsd)}) bleibt davon getrennt. Bei 0 ist die KI für Freunde aus.</p>
      <label className="field">
        <span>KI-Karten pro Freund und Tag</span>
        <input className="input" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, '').slice(0, 4))} />
      </label>
      <p className="hint">KI-Karten laufen über den kostenlosen Tarif von Groq, dessen Kontingent sich alle teilen. Das Tageslimit pro Freund verhindert, dass einer es allein aufbraucht. Für dich gilt es nicht.</p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {msg && <p className="hint">{msg}</p>}
      <button type="button" className="btn btn-primary" disabled={busy || !budget || !limit} onClick={() => void save()}>
        {busy ? 'Speichert …' : 'Speichern'}
      </button>
    </div>
  );
}
