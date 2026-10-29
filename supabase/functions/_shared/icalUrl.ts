/**
 * Adresse eines Kalender-Abos (iCal-Link) prüfen, bevor die Edge Function ical-fetch sie abruft. Die Function lädt beliebige
 * öffentliche Adressen, darum gilt: nur https auf Port 443, keine Zugangsdaten in der Adresse, kein Rechnername ohne Punkt,
 * keine IP-Adressen und keine internen Namen. Nach der Namensauflösung prüft die Function jede Adresse mit isPrivateIp.
 * Importiert nichts, wird nach supabase/functions/_shared kopiert (npm run sync:shared).
 */

export const MAX_ICAL_URL_LENGTH = 2000;

export type IcalUrlCheck =
  | { ok: true; url: string; host: string }
  | { ok: false; reason: 'invalid' | 'too_long' | 'not_https' | 'credentials' | 'port' | 'host' };

const INTERNAL_SUFFIX = /\.(localhost|local|internal|lan|home|corp|intranet|localdomain|home\.arpa)$/;

/** webcal:// ist https:// mit anderem Namen (so geben viele Systeme den Link an). */
export function normalizeIcalUrl(raw: string): string {
  const t = raw.trim();
  return /^webcals?:\/\//i.test(t) ? t.replace(/^webcals?:\/\//i, 'https://') : t;
}

export function checkIcalUrl(raw: string): IcalUrlCheck {
  const text = normalizeIcalUrl(raw);
  if (text.length > MAX_ICAL_URL_LENGTH) return { ok: false, reason: 'too_long' };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'not_https' };
  if (u.username || u.password) return { ok: false, reason: 'credentials' };
  if (u.port !== '' && u.port !== '443') return { ok: false, reason: 'port' };
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  // IPv6 steht in eckigen Klammern; IPv4 auch in ungewöhnlichen Schreibweisen (Zahl, hexadezimal, oktal) nie zulassen
  if (host.startsWith('[') || host.includes(':')) return { ok: false, reason: 'host' };
  const labels = host.split('.');
  const last = labels[labels.length - 1] ?? '';
  if (labels.length < 2 || labels.some((l) => l === '')) return { ok: false, reason: 'host' };
  if (/^\d+$/.test(last) || /^0x[0-9a-f]*$/.test(last)) return { ok: false, reason: 'host' };
  if (host === 'localhost' || INTERNAL_SUFFIX.test(host)) return { ok: false, reason: 'host' };
  if (!/^[a-z0-9.-]+$/.test(host)) return { ok: false, reason: 'host' }; // Umlaute und Sonderzeichen kommen als punycode
  u.hash = '';
  return { ok: true, url: u.toString(), host };
}

export const ICAL_URL_PROBLEMS: Record<Exclude<IcalUrlCheck, { ok: true }>['reason'], string> = {
  invalid: 'Das ist keine gültige Adresse.',
  too_long: 'Die Adresse ist zu lang.',
  not_https: 'Der Link muss mit https:// (oder webcal://) beginnen.',
  credentials: 'Der Link darf keinen Benutzernamen und kein Passwort enthalten.',
  port: 'Nur die Standard-Verbindung (Port 443) ist erlaubt.',
  host: 'Diese Adresse ist nicht erlaubt (nur öffentliche Webadressen mit Rechnernamen).',
};

function parseV4(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const n = m.slice(1).map(Number);
  return n.every((x) => x <= 255) ? n : null;
}

function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0] ?? '';
  // eingebettete IPv4-Adresse am Ende (::ffff:1.2.3.4)
  const tail = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s);
  if (tail) {
    const v4 = parseV4(tail[1]);
    if (!v4) return null;
    s = s.slice(0, s.length - tail[1].length) + ((v4[0] << 8) | v4[1]).toString(16) + ':' + ((v4[2] << 8) | v4[3]).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  if (groups.length !== 8) return null;
  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.some(Number.isNaN) ? null : out;
}

/**
 * Ob eine IP-Adresse nicht öffentlich ist (privat, Loopback, Link-Local mit den Metadaten-Adressen der Cloud, Multicast, reserviert,
 * Übergangsformate mit eingebetteter IPv4). Unlesbare Adressen gelten als nicht öffentlich.
 */
export function isPrivateIp(ip: string): boolean {
  const v4 = parseV4(ip);
  if (v4) {
    const [a, b, c] = v4;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  const g = expandV6(ip);
  if (!g) return true;
  const allZero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (allZero(0, 8)) return true; // ::
  if (allZero(0, 7) && g[7] === 1) return true; // ::1
  if (allZero(0, 5) && g[5] === 0xffff) return isPrivateIp(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`); // ::ffff:a.b.c.d
  if (allZero(0, 6)) return true; // ::a.b.c.d (veraltet)
  if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 (veraltet)
  if ((g[0] & 0xff00) === 0xff00) return true; // Multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // Dokumentation
  if (g[0] === 0x2002) return true; // 6to4 (enthält eine IPv4-Adresse)
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  return false;
}
