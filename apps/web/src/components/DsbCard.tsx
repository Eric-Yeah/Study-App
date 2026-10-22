import { useState, type FormEvent } from 'react';
import { DSB_PROBLEM_LABELS, DSB_REJECT_LABELS } from '@study/core';
import { readDsbInfo, readDsbMeta, useLanisAuto } from '../lib/lanisAuto';

const when = (ms: number) => (ms ? new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');

/** Einstellungen: Vertretungsplan aus DSBmobile. Die Zugangsdaten bleiben verschlüsselt nur auf diesem Gerät. */
export function DsbCard() {
  const auto = useLanisAuto();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const connect = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await auto.enableDsb({ user: user.trim(), password });
    setPassword('');
    await auto.refresh(true);
    setBusy(false);
  };

  return (
    <div className="card stack">
      <div className="between">
        <h2>Vertretungsplan (DSBmobile)</h2>
        <span className={`tag${auto.dsbEnabled ? '' : ' warn'}`}>{auto.dsbEnabled ? 'automatisch an' : 'aus'}</span>
      </div>
      {auto.dsbEnabled ? (
        <>
          <p className="muted">
            Die App holt den Vertretungsplan deiner Schule aus DSBmobile und zeigt dir nur, was deine Stufe und deine Stunden betrifft. Lanis wird dafür nicht mehr
            gefragt.
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn" disabled={auto.busy} onClick={() => void auto.refresh(true)}>
              {auto.busy ? 'Aktualisiere …' : 'Jetzt aktualisieren'}
            </button>
            <button type="button" className="btn btn-ghost btn-danger" onClick={() => auto.disableDsb()}>
              Ausschalten und Passwort löschen
            </button>
          </div>
        </>
      ) : (
        <form className="stack" onSubmit={connect}>
          <p className="muted">
            Steht der Vertretungsplan deiner Schule in der App „DSBmobile“ und nicht in Lanis? Dann gib hier dieselben Zugangsdaten ein wie dort (die Schule hat sie
            dir gegeben, oft für alle Schüler gleich).
          </p>
          <label className="field">
            <span>DSBmobile-Benutzer (meist eine Nummer)</span>
            <input className="input" required autoComplete="off" value={user} onChange={(e) => setUser(e.target.value)} />
          </label>
          <label className="field">
            <span>DSBmobile-Passwort</span>
            <input className="input" type="password" required autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <p className="hint">Das Passwort liegt verschlüsselt nur auf diesem Gerät, nie auf dem Server. Es geht nur bei einem Abruf an DSBmobile.</p>
          <button type="submit" className="btn btn-primary" disabled={busy || auto.busy}>
            {busy ? 'Verbinde …' : 'Verbinden'}
          </button>
        </form>
      )}
      {auto.dsbEnabled && <DsbResult key={auto.dsbAt} />}
      {auto.dsbError && (
        <p className="notice" role="alert">
          {auto.dsbError}
        </p>
      )}
    </div>
  );
}

/** Was der letzte Abruf gebracht hat, damit man sieht, ob etwas angekommen ist und warum etwas fehlt. */
function DsbResult() {
  const info = readDsbInfo();
  const [copied, setCopied] = useState(false);
  if (!info) return <p className="hint">Noch kein Abruf. Tippe auf „Jetzt aktualisieren“.</p>;
  const { diag: d } = info;
  const meta = readDsbMeta();
  const rejected = Object.entries(d.rejected ?? {}).filter(([, n]) => n > 0) as [keyof typeof DSB_REJECT_LABELS, number][];
  const problems = Object.entries(d.problems ?? {}).filter(([, n]) => n > 0) as [keyof typeof DSB_PROBLEM_LABELS, number][];
  const stand = d.stand ? `${d.stand.slice(8, 10)}.${d.stand.slice(5, 7)}. ${d.stand.slice(11, 16)}` : null;
  const copy = async () => {
    const menu = (info.menu ?? []).map((m) => `${m.loaded ? '[geladen]' : '[nicht geladen]'} ${m.title} | ${m.host} | ${m.file}`).join('\n');
    const heads = (info.heads ?? []).map((h, i) => `Seite ${i + 1}: ${h}`).join('\n');
    const text = `Seiten: ${d.recognized} von ${d.pages} erkannt, ${d.total} Einträge, ${d.mine} für dich\nSpalten: ${d.headers.join(' | ')}\nKlassen: ${d.klassSamples.join(', ')}\nStufen im Stundenplan: ${d.levels.join(', ') || '–'}\n\nDSB-Menü (${(info.menu ?? []).length}):\n${menu}\n\n${heads}\n\n${info.sample}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // ignorieren
    }
  };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <p className="hint">
        Letzter Abruf {when(info.at)}: {d.recognized} von {d.pages} {d.pages === 1 ? 'Seite' : 'Seiten'} gelesen, {d.total} Einträge im Plan der Schule
        {d.dates.length > 0 ? ` (${d.dates.map((x) => x.slice(8) + '.' + x.slice(5, 7) + '.').join(', ')})` : ''}.{' '}
        <strong>{d.mine} davon für dich</strong>{d.uncertain ? ` (${d.uncertain} unsicher)` : ''}
        {d.total > 0 && d.mine < d.total
          ? ` (nicht passend: ${d.dropped.klass} andere Klasse, ${d.dropped.lesson} keine Stunde von dir, ${d.dropped.subject} anderes Fach oder andere Lehrkraft)`
          : ''}
        .
      </p>
      <p className="hint">
        Zuletzt bei DSBmobile nachgesehen: {when(meta.checkAt)}. Neues bei DSBmobile erkannt: {when(meta.changedAt)}
        {meta.published ? `, veröffentlicht ${meta.published}` : ''}
        {stand ? `. Stand der Schule: ${stand}` : ''}. Die App sieht bei geöffneter App alle paar Minuten nach und lädt den Plan neu, sobald es etwas Neues gibt.
      </p>
      {(rejected.length > 0 || problems.length > 0) && (
        <p className="hint">
          Verworfen, weil unplausibel:{' '}
          {[
            ...problems.map(([k, n]) => `${n} ${n === 1 ? 'Seite' : 'Seiten'} (${DSB_PROBLEM_LABELS[k]})`),
            ...rejected.map(([k, n]) => `${n} ${DSB_REJECT_LABELS[k]}`),
          ].join(', ')}
          .
        </p>
      )}
      {info.stored === false && <p className="hint">Dieser Abruf wurde nicht übernommen, dein bisheriger Stand bleibt erhalten.</p>}
      {info.partial && <p className="hint">Nicht alle Seiten des Plans waren ladbar.</p>}
      {(info.menu ?? []).length > 0 && (
        <p className="hint">
          DSBmobile bietet {info.menu.length} {info.menu.length === 1 ? 'Inhalt' : 'Inhalte'} an, {info.menu.filter((m) => m.loaded).length} davon geladen
          {d.pages === 0 ? ' (keiner als Plan-Seite erkannt)' : ''}.
        </p>
      )}
      {d.total === 0 && d.pages > 0 && <p className="hint">Im Plan stehen keine Einträge, oder die App versteht den Aufbau nicht. Kopiere den Ausschnitt und schick ihn weiter.</p>}
      <button type="button" className="btn btn-ghost" onClick={() => void copy()}>
        {copied ? 'Kopiert' : 'Plan-Ausschnitt kopieren (für die Fehlersuche)'}
      </button>
    </div>
  );
}
