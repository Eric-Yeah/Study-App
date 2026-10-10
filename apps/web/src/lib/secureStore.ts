/**
 * Verschlüsselte Ablage kleiner Geheimnisse nur auf diesem Gerät.
 * Der AES-Schlüssel liegt als nicht auslesbarer CryptoKey in IndexedDB, der Chiffretext in localStorage.
 * Das schützt vor dem Auslesen von Speicherauszügen und Backups. Code der App selbst könnte entschlüsseln,
 * deshalb gehören hierher nur Dinge, die der Nutzer bewusst auf diesem Gerät merken lassen will.
 */
const DB_NAME = 'study-app-secure';
const STORE = 'keys';
const KEY_ID = 'device-key';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deviceKey(): Promise<CryptoKey> {
  const db = await openDb();
  const existing = await new Promise<CryptoKey | undefined>((resolve) => {
    const r = db.transaction(STORE).objectStore(STORE).get(KEY_ID);
    r.onsuccess = () => resolve(r.result as CryptoKey | undefined);
    r.onerror = () => resolve(undefined);
  });
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(key, KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return key;
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptText(text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deviceKey(), new TextEncoder().encode(text)));
  return `${toB64(iv)}.${toB64(cipher)}`;
}

/** null, wenn der Chiffretext fehlt, kaputt ist oder der Schlüssel nicht mehr passt. */
export async function decryptText(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  try {
    const [iv, cipher] = stored.split('.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await deviceKey(), fromB64(cipher));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
