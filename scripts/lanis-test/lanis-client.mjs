// Gemeinsamer Teil der Lanis-Skripte: Zugangsdaten lesen, anmelden, abmelden.
// Das Passwort geht ausschließlich an login.schulportal.hessen.de.
// Mit LANIS_DEBUG=1 zeigt die Anmeldung jeden Schritt (Status, Ziel ohne Parameter, Namen der Cookies, nie Werte).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const dir = dirname(fileURLToPath(import.meta.url));
export const UA = 'Lanis-Mobile/v4+SPHClient-ts';
export const BASE = 'https://start.schulportal.hessen.de';
const DEBUG = Boolean(process.env.LANIS_DEBUG);

export function readSecrets() {
  let secrets;
  try {
    secrets = JSON.parse(readFileSync(join(dir, 'secrets.json'), 'utf8'));
  } catch {
    console.error('secrets.json fehlt oder ist kein gültiges JSON. Kopiere secrets.example.json und trage deine Daten ein.');
    process.exit(1);
  }
  const { username, password, schoolId } = secrets;
  if (!username || !password || !schoolId || password === 'DEIN-PASSWORT') {
    console.error('Bitte username, password und schoolId in secrets.json eintragen.');
    process.exit(1);
  }
  return { username, password, schoolId: String(schoolId) };
}

const where = (url) => {
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch {
    return String(url);
  }
};

export function createSession({ username, password, schoolId }) {
  // Einfaches Cookie-Glas: nur Name und Wert.
  const jar = new Map();
  const store = (res) => {
    const names = [];
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      if (i > 0) {
        jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
        names.push(pair.slice(0, i).trim());
      }
    }
    return names;
  };
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const log = (...a) => DEBUG && console.log('  [Anmeldung]', ...a);

  async function login() {
    // URLSearchParams kodiert Sonderzeichen im Passwort korrekt.
    const body = new URLSearchParams({ user2: username, user: `${schoolId}.${username}`, password });
    const loginUrl = `https://login.schulportal.hessen.de/?i=${encodeURIComponent(schoolId)}`;
    const r1 = await fetch(loginUrl, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
      body,
    });
    await r1.arrayBuffer();
    log('Schritt 1: HTTP', r1.status, '-> Ziel:', r1.headers.get('location') ? where(new URL(r1.headers.get('location'), loginUrl)) : 'keins', '| Cookies:', store(r1).join(', ') || 'keine');
    if (!r1.headers.has('location')) {
      throw new Error('Anmeldung abgelehnt: Benutzername, Passwort oder Schulnummer stimmen nicht (oder Zwei-Faktor ist aktiv).');
    }
    // Weiterleitungen von Hand verfolgen, bis die Sitzung (sid) da ist. Lanis hat hier schon Schritte ergänzt.
    let next = 'https://connect.schulportal.hessen.de';
    for (let hop = 2; hop <= 9 && !jar.has('sid'); hop++) {
      const r = await fetch(next, { redirect: 'manual', headers: { cookie: cookieHeader(), 'user-agent': UA } });
      await r.arrayBuffer();
      const loc = r.headers.get('location');
      log(`Schritt ${hop}: ${where(next)} -> HTTP ${r.status}, Ziel:`, loc ? where(new URL(loc, next)) : 'keins', '| Cookies:', store(r).join(', ') || 'keine');
      if (!loc) break;
      next = new URL(loc, next).toString();
    }
    if (!jar.has('sid')) {
      throw new Error(`Anmeldung unvollständig: keine Sitzung (sid) erhalten. Erhaltene Cookies: ${[...jar.keys()].join(', ') || 'keine'}. Tipp: LANIS_DEBUG=1 node ... zeigt jeden Schritt.`);
    }
  }

  const simpleCookie = () => `sph-login-upstream=4; schulportal_lastschool=${schoolId}; i=${schoolId}; sid=${jar.get('sid')}`;

  async function logout() {
    await fetch(`${BASE}/index.php?logout=all`, { headers: { cookie: cookieHeader(), 'user-agent': UA } }).catch(() => {});
  }

  return { login, logout, simpleCookie, schoolId };
}
