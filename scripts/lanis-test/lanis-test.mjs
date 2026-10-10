// Testskript: meldet sich bei Lanis (Schulportal Hessen) an und liest den Kalender.
// Läuft nur lokal bei dir. Das Passwort steht nur in secrets.json (von Git ausgeschlossen)
// und geht ausschließlich an login.schulportal.hessen.de.
//
// Benutzung: siehe README.md in diesem Ordner.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UA, createSession, dir, readSecrets } from './lanis-client.mjs';

const session = createSession(readSecrets());

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function getCalendar(start, end) {
  const res = await fetch('https://start.schulportal.hessen.de/kalender.php', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'user-agent': UA,
      cookie: session.simpleCookie(),
    },
    body: new URLSearchParams({ f: 'getEvents', start: iso(start), end: iso(end) }),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Kalender-Antwort ist kein JSON (HTTP ${res.status}). Anfang: ${text.slice(0, 120).replace(/\s+/g, ' ')}`);
  }
}

const start = new Date();
const end = new Date();
end.setDate(end.getDate() + 120);

try {
  console.log('Melde an …');
  await session.login();
  console.log('Angemeldet. Lese Kalender bis', iso(end), '…');
  const events = await getCalendar(start, end);
  const list = Array.isArray(events) ? events : [];
  writeFileSync(join(dir, 'lanis-output.json'), JSON.stringify(events, null, 2));
  console.log(`${list.length} Einträge. Rohdaten stehen in lanis-output.json (nur lokal, von Git ausgeschlossen).`);
  if (list[0]) console.log('Felder eines Eintrags:', Object.keys(list[0]).join(', '));
  const text = (e) => [e.title, e.Subject, e.name, e.description, e.category].filter(Boolean).join(' ');
  const hits = list.filter((e) => /klausur|klassenarbeit|arbeit|test|lk/i.test(text(e)));
  console.log(`\nMögliche Klausuren (${hits.length}):`);
  for (const e of hits) console.log('-', e.start ?? e.Start ?? '?', '|', text(e).slice(0, 100));
  if (list.length && !hits.length) {
    console.log('\nKeine Treffer. Die ersten Einträge zur Orientierung:');
    for (const e of list.slice(0, 10)) console.log('-', e.start ?? e.Start ?? '?', '|', text(e).slice(0, 100));
  }
} catch (e) {
  console.error('Fehler:', e.message);
  // Bei Verbindungsfehlern steckt der eigentliche Grund in e.cause (zum Beispiel ENOTFOUND, ETIMEDOUT).
  if (e.cause) console.error('Grund:', e.cause.code ?? '', e.cause.message ?? e.cause);
  process.exitCode = 1;
} finally {
  await session.logout();
}
