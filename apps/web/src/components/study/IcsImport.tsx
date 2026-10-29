import { CONFIG, ICAL_URL_PROBLEMS, checkIcalUrl, decodeIcs, parseIcs, planIcsImport, type ImportPlan, type StudyEvent } from '@study/core';
import { Link2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IcalError, fetchIcal, forgetIcal, loadSavedIcal, saveIcal, type SavedIcal } from '../../lib/icalApi';
import { uid } from '../../lib/format';
import { useStore } from '../../state/store';

interface Preview {
  plan: ImportPlan;
  ignored: number;
  truncated: boolean;
  fileName: string;
}

/**
 * Stundenplan aus einer Kalenderdatei (.ics) übernehmen. Die Datei bleibt auf dem Gerät, die App liest sie im Browser und
 * zeigt erst eine Vorschau. Ein erneuter Import aktualisiert die Termine, statt sie doppelt anzulegen.
 */
export function IcsImport({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [link, setLink] = useState('');
  const [remember, setRemember] = useState(true);
  const [saved, setSaved] = useState<SavedIcal | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void loadSavedIcal().then(setSaved);
  }, []);

  /** Kalendertext lesen und die Vorschau (oder bei `auto` gleich das Ergebnis) zeigen. */
  const show = (text: string, label: string, auto = false): boolean => {
    const parsed = parseIcs(text);
    if (!parsed.valid) {
      setError('Das ist keine Kalenderdatei (.ics). Exportiere den Stundenplan aus deinem Campus-System als iCal oder ICS.');
      return false;
    }
    const modules = state.subjects.filter((s) => s.scope === 'uni');
    const plan = planIcsImport(state.events, parsed.events, modules, uid);
    if (auto) {
      if (plan.write.length > 0) dispatch({ type: 'upsertEvents', events: plan.write });
      setNote(plan.write.length > 0 ? `Stundenplan aktualisiert: ${plan.added} neue, ${plan.updated} geänderte Termine.` : 'Der Stundenplan ist aktuell.');
      return true;
    }
    setPreview({ plan, ignored: parsed.ignored, truncated: parsed.truncated, fileName: label });
    return true;
  };

  const read = async (file: File) => {
    setError(null);
    setPreview(null);
    if (file.size > CONFIG.study.ics.maxBytes) {
      setError(`Die Datei ist zu groß (höchstens ${Math.round(CONFIG.study.ics.maxBytes / 1_000_000)} MB).`);
      return;
    }
    show(decodeIcs(new Uint8Array(await file.arrayBuffer())), file.name);
  };

  const fromLink = async (url: string, auto = false) => {
    setError(null);
    setNote(null);
    if (!auto) setPreview(null);
    const check = checkIcalUrl(url);
    if (!check.ok) {
      setError(ICAL_URL_PROBLEMS[check.reason]);
      return;
    }
    setLoading(true);
    try {
      const ok = show(await fetchIcal(url), 'Kalender-Link', auto);
      if (ok && (saved?.url === url || (remember && !auto))) {
        const at = Date.now();
        await saveIcal(url, at);
        setSaved({ url, at });
      }
    } catch (e) {
      setError(e instanceof IcalError ? e.message : 'Der Kalender konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  // Gespeicherter Link: beim Öffnen der Seite höchstens alle 12 Stunden still aktualisieren
  const autoRan = useRef(false);
  useEffect(() => {
    if (!saved || autoRan.current) return;
    autoRan.current = true;
    if (Date.now() - saved.at > 12 * 3_600_000) void fromLink(saved.url, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    if (!preview) return;
    const write: StudyEvent[] = preview.plan.write;
    if (write.length > 0) dispatch({ type: 'upsertEvents', events: write });
    setPreview(null);
    onDone();
  };

  return (
    <div className="card stack" style={{ gap: 12 }}>
      <h2>Aus Kalenderdatei übernehmen</h2>
      <p className="muted">
        Viele Campus-Systeme (Stud.IP, Moodle, HISinOne, TUCaN) exportieren den Stundenplan als iCal-Datei. Wähle die Datei hier aus. Zugangsdaten zu deinem Uni-Konto braucht die App dafür nicht und speichert sie nie.
      </p>
      <input
        ref={input}
        type="file"
        accept=".ics,.ical,text/calendar"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void read(f).catch(() => setError('Die Datei konnte nicht gelesen werden.'));
        }}
      />
      <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => input.current?.click()}>
        <Upload size={18} aria-hidden="true" /> Datei auswählen
      </button>
      <div className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <h3>Oder per Kalender-Link</h3>
        {saved ? (
          <>
            <p className="muted">
              Ein Link ist auf diesem Gerät gemerkt (verschlüsselt), zuletzt abgerufen {saved.at ? new Date(saved.at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'nie'}.
            </p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="btn" disabled={loading} onClick={() => void fromLink(saved.url, true)}>
                {loading ? 'Lade …' : 'Jetzt aktualisieren'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  forgetIcal();
                  setSaved(null);
                  setNote(null);
                }}
              >
                Link vergessen
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              Manche Systeme (zum Beispiel Moodle) geben einen Kalender-Link (iCal-Abo) aus. Der Link enthält einen geheimen Schlüssel: Gib ihn nur hier ein. Die App ruft ihn über einen eigenen Dienst ab und speichert ihn nicht in der Datenbank.
            </p>
            <form
              className="row"
              style={{ flexWrap: 'wrap' }}
              onSubmit={(e) => {
                e.preventDefault();
                if (link.trim()) void fromLink(link.trim());
              }}
            >
              <input className="input" style={{ flex: 1, minWidth: 220 }} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https:// oder webcal://" aria-label="Kalender-Link" autoComplete="off" spellCheck={false} />
              <button type="submit" className="btn" disabled={loading || !link.trim()}>
                <Link2 size={18} aria-hidden="true" /> {loading ? 'Lade …' : 'Abrufen'}
              </button>
            </form>
            <label className="check-row">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Link verschlüsselt auf diesem Gerät merken (für spätere Aktualisierung)</span>
            </label>
          </>
        )}
        {note && <p className="notice ok" role="status">{note}</p>}
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
      {preview && (
        <div className="stack" style={{ gap: 8 }}>
          <p>
            <strong>{preview.fileName}</strong>: {preview.plan.added} neue, {preview.plan.updated} geänderte und {preview.plan.unchanged} unveränderte Termine.
            {preview.ignored > 0 && ` ${preview.ignored} ganztägige, mehrtägige oder abgesagte Termine wurden ausgelassen.`}
          </p>
          {(preview.truncated || preview.plan.skippedForLimit > 0) && (
            <p className="notice">Es sind mehr Termine, als die App speichert (höchstens {CONFIG.study.maxEventsPerUser}). Ein Teil fehlt.</p>
          )}
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={apply} disabled={preview.plan.write.length === 0}>
              Übernehmen
            </button>
            <button type="button" className="btn" onClick={() => setPreview(null)}>
              Verwerfen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
