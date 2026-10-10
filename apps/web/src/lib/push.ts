import { defaultPushPrefs, readPushPrefs, type PushItem, type PushPrefs } from '@study/core';
import { supabase } from './supabase';
import { friendly } from './adminView';

/** Fehler mit deutscher Meldung für die Oberfläche. */
export class PushError extends Error {}

const KEY = 'study-push-v1';
const EVENT = 'study-push-prefs';

/** Einstellungen liegen pro Gerät im Browser (das Abo hängt am Gerät), nicht in der Datenbank. */
export function loadPrefs(): PushPrefs {
  try {
    return readPushPrefs(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return defaultPushPrefs();
  }
}

let cached: { raw: string; prefs: PushPrefs } | null = null;
/** Für useSyncExternalStore: gleicher Wert, solange sich nichts geändert hat. */
export function prefsSnapshot(): PushPrefs {
  let raw = '';
  try {
    raw = localStorage.getItem(KEY) ?? '';
  } catch {
    raw = '';
  }
  if (!cached || cached.raw !== raw) cached = { raw, prefs: loadPrefs() };
  return cached.prefs;
}

export function savePrefs(prefs: PushPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ohne Speicher gilt die Einstellung nur bis zum Neuladen */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribePrefs(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export interface PushSupport {
  supported: boolean;
  needsInstall: boolean; // iPhone und iPad: nur mit der App auf dem Home-Bildschirm
}

export function pushSupport(): PushSupport {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  return { supported, needsInstall: ios && !standalone };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const toKey = (b64: string): Uint8Array<ArrayBuffer> => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
};

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
  return navigator.serviceWorker.ready;
}

/** Das Abo dieses Geräts, wenn es eines gibt. */
export async function currentSub(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
  return reg ? reg.pushManager.getSubscription() : null;
}

async function saveSub(userId: string, sub: PushSubscription): Promise<string> {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new PushError('Das Abo dieses Geräts ist unvollständig. Versuche es noch einmal.');
  const id = await sha256Hex(sub.endpoint);
  const { error } = await supabase.from('push_subs').upsert({ id, user_id: userId, endpoint: sub.endpoint, p256dh, auth }, { onConflict: 'endpoint' });
  if (error) throw new PushError(friendly('Das Gerät konnte nicht gespeichert werden. Ist die Migration 20261026 in Supabase eingespielt?', 'Das Gerät konnte nicht gespeichert werden. Versuche es später noch einmal.'));
  return id;
}

/**
 * Schaltet die Erinnerungen an diesem Gerät ein. Muss direkt im Tipp aufgerufen werden, weil die Erlaubnis nur dort angefragt werden darf
 * (zuerst die Erlaubnis, vor jedem anderen await).
 */
export async function enablePush(userId: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new PushError('Mitteilungen sind für diese App nicht erlaubt. Erlaube sie in den Einstellungen deines Geräts (Mitteilungen → Study App) und versuche es noch einmal.');
  }
  const reg = await registration();
  const { data, error } = await supabase.functions.invoke<{ pub?: string }>('push-send', { body: { op: 'key' } });
  if (error || !data?.pub) throw new PushError(friendly('Der Schlüssel für Mitteilungen fehlt. Ist die Funktion push-send in Supabase eingerichtet?', 'Mitteilungen sind gerade nicht verfügbar. Versuche es später noch einmal.'));
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(data.pub) }));
  await saveSub(userId, sub);
}

/** Schaltet die Erinnerungen an diesem Gerät aus: Abo beim Push-Dienst und in der Datenbank entfernen (die Warteschlange geht mit). */
export async function disablePush(): Promise<void> {
  const sub = await currentSub();
  if (!sub) return;
  const id = await sha256Hex(sub.endpoint);
  await supabase.from('push_subs').delete().eq('id', id);
  await sub.unsubscribe().catch(() => false);
}

/** Ersetzt die offenen Mitteilungen dieses Geräts durch die neu berechneten (eine Testmitteilung bleibt, bis sie gesendet ist). */
export async function syncQueue(userId: string, items: PushItem[]): Promise<void> {
  const sub = await currentSub();
  if (!sub) return;
  const id = await saveSub(userId, sub);
  const { error: delError } = await supabase.from('push_queue').delete().eq('sub_id', id).is('sent_at', null).neq('kind', 'test');
  if (delError) throw new PushError('Die Mitteilungen konnten nicht aktualisiert werden.');
  if (items.length === 0) return;
  const { error } = await supabase.from('push_queue').insert(items.map((i) => ({ user_id: userId, sub_id: id, kind: i.kind, title: i.title, body: i.body, url: i.url, due_at: i.dueAt })));
  if (error) throw new PushError('Die Mitteilungen konnten nicht gespeichert werden.');
}

/** Schickt eine Testmitteilung (kommt in wenigen Sekunden). */
export async function sendTest(userId: string): Promise<void> {
  const sub = await currentSub();
  if (!sub) throw new PushError('Dieses Gerät ist noch nicht für Mitteilungen angemeldet.');
  const id = await saveSub(userId, sub);
  const { error } = await supabase.from('push_queue').insert({ user_id: userId, sub_id: id, kind: 'test', title: 'Erinnerungen sind an', body: 'So sieht eine Mitteilung der Study App aus.', url: '/einstellungen', due_at: new Date().toISOString() });
  if (error) throw new PushError('Die Testmitteilung konnte nicht angelegt werden.');
}
