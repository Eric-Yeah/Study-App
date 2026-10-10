// Prüfskript: meldet sich bei Lanis an und liest Stundenplan und Vertretungsplan (nur lesen).
// Läuft nur lokal bei dir. Das Passwort steht nur in secrets.json (von Git ausgeschlossen)
// und geht ausschließlich an login.schulportal.hessen.de.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, UA, createSession, dir, readSecrets } from './lanis-client.mjs';

const session = createSession(readSecrets());


async function getText(path, opts = {}) {
  const res = await fetch(BASE + path, { ...opts, headers: { 'user-agent': UA, cookie: session.simpleCookie(), ...(opts.headers ?? {}) } });
  return { status: res.status, text: await res.text(), type: res.headers.get('content-type') };
}
const strip = (s) => s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

try {
  console.log('Melde an …');
  await session.login();
  console.log('Angemeldet.\n');

  // ---- Stundenplan: HTML-Seite ----
  const tt = await getText('/stundenplan.php');
  writeFileSync(join(dir, 'lanis-timetable.html'), tt.text);
  console.log(`Stundenplan: HTTP ${tt.status}, ${tt.text.length} Zeichen, ${tt.type}`);
  const tables = [...tt.text.matchAll(/<table\b[^>]*>/gi)].map((m) => m[0].slice(0, 120));
  console.log(`  Tabellen: ${tables.length}`, tables.slice(0, 4));
  const headers = [...tt.text.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => strip(m[1])).filter(Boolean).slice(0, 14);
  console.log('  Spaltenköpfe:', headers);
  const links = [...new Set([...tt.text.matchAll(/(?:href|data-[a-z-]*url|action)="([^"]*stundenplan[^"]*)"/gi)].map((m) => m[1]))].slice(0, 10);
  console.log('  Verweise auf stundenplan:', links);
  const weeks = [...tt.text.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)].map((m) => `${m[1]} = ${strip(m[2])}`).slice(0, 12);
  console.log('  Auswahlfelder (Wochen/Pläne):', weeks);

  // ---- Vertretungsplan ----
  const vp = await getText('/vertretungsplan.php');
  writeFileSync(join(dir, 'lanis-vplan-page.html'), vp.text);
  const dates = [...new Set([...vp.text.matchAll(/data-tag="(\d{2}\.\d{2}\.\d{4})"/g)].map((m) => m[1]))];
  console.log(`\nVertretungsplan: HTTP ${vp.status}, Tage: ${dates.join(', ') || 'keine gefunden'}`);
  const out = {};
  for (const tag of dates.slice(0, 5)) {
    const r = await getText(`/vertretungsplan.php?ganzerPlan=true&tag=${tag}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ tag, ganzerPlan: 'true' }),
    });
    let parsed = null;
    try { parsed = JSON.parse(r.text); } catch { /* kein JSON */ }
    out[tag] = parsed ?? r.text.slice(0, 2000);
    const keys = parsed && typeof parsed === 'object' ? Object.keys(parsed) : [];
    console.log(`  ${tag}: HTTP ${r.status}, ${parsed ? 'JSON' : 'kein JSON'}, Schlüssel: ${keys.join(', ')}`);
    for (const k of keys) {
      const v = parsed[k];
      if (Array.isArray(v)) console.log(`    ${k}: Liste mit ${v.length} Einträgen${v[0] && typeof v[0] === 'object' ? ', Felder: ' + Object.keys(v[0]).join(', ') : ''}`);
    }
  }
  writeFileSync(join(dir, 'lanis-vplan.json'), JSON.stringify(out, null, 2));
  console.log('\nRohdaten: lanis-timetable.html, lanis-vplan-page.html, lanis-vplan.json (nur lokal, von Git ausgeschlossen).');
} catch (e) {
  console.error('Fehler:', e.message);
  if (e.cause) console.error('Grund:', e.cause.code ?? '', e.cause.message ?? e.cause);
  process.exitCode = 1;
} finally {
  await session.logout();
}
