// Prüfskript: liest "Mein Unterricht" (Kursliste und Kursseiten mit Hausaufgaben und Dateien) aus Lanis. Nur lesen.
// Läuft nur lokal bei dir. Das Passwort steht nur in secrets.json (von Git ausgeschlossen) und geht nur an Lanis.
// Die Rohseiten landen in scripts/lanis-test/mu/ (enthalten Kurse, Lehrkräfte, Hausaufgaben; von Git ausgeschlossen).
// Aufruf: node lanis-homework-probe.mjs [Anzahl Kurse, Standard 40]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, UA, createSession, dir, readSecrets } from './lanis-client.mjs';

const session = createSession(readSecrets());
const out = join(dir, 'mu');
mkdirSync(out, { recursive: true });
const limit = Number(process.argv[2]) || 40;

async function get(path) {
  const res = await fetch(path.startsWith('http') ? path : BASE + '/' + path.replace(/^\//, ''), { headers: { 'user-agent': UA, cookie: session.simpleCookie() }, redirect: 'manual' });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get('content-type'), buf, text: buf.toString('utf8'), location: res.headers.get('location') };
}

try {
  console.log('Melde an …');
  await session.login();
  const page = await get('meinunterricht.php');
  writeFileSync(join(out, 'overview.html'), page.text);
  console.log(`Übersicht: HTTP ${page.status}, ${page.text.length} Zeichen, ${page.type}`);
  const links = [...new Set([...page.text.matchAll(/href="([^"]*meinunterricht\.php\?[^"]*)"/gi)].map((m) => m[1].replace(/&amp;/g, '&')))];
  console.log(`Verweise auf meinunterricht.php: ${links.length}`);
  const views = links.filter((l) => /a=sus_view&id=\d+$/.test(l));
  console.log(`Kursseiten (a=view): ${views.length}`);
  let i = 0;
  for (const l of views.slice(0, limit)) {
    const p = await get(l);
    const name = `course-${String(++i).padStart(2, '0')}.html`;
    writeFileSync(join(out, name), p.text);
    console.log(`  ${name}: HTTP ${p.status}, ${p.text.length} Zeichen`);
  }
  console.log('Fertig. Rohdaten in scripts/lanis-test/mu/');
} catch (e) {
  console.error('Fehler:', e.message);
  process.exitCode = 1;
} finally {
  await session.logout();
}
