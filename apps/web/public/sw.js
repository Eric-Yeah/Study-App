/* Study App: Service Worker nur für Erinnerungen.
   Er speichert nichts zwischen und fängt keine Anfragen ab, die App läuft also wie vorher ohne ihn (auch das Auto-Update über version.json).
   Der Server schickt Titel, Text und Ziel verschlüsselt (Web-Push), dieser Worker zeigt sie an. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (x) {
    d = {};
  }
  const k = typeof d.k === 'string' ? d.k : '';
  const title = typeof d.t === 'string' && d.t ? d.t.slice(0, 120) : 'Study App';
  const body = typeof d.b === 'string' ? d.b.slice(0, 300) : '';
  const u = typeof d.u === 'string' && d.u.startsWith('/') ? d.u : '/';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: 'study-' + (k || 'x'),
      renotify: true,
      icon: self.registration.scope + 'icon-192.png',
      data: { u },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const u = (e.notification.data && e.notification.data.u) || '/';
  const target = self.registration.scope + '#' + u;
  e.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of list) {
        if ('focus' in c) {
          try {
            c.postMessage({ studyNotify: u });
          } catch (x) {
            /* weiter */
          }
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
