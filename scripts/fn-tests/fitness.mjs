import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const UID = '11111111-2222-3333-4444-555555555555';
const TOKEN = 'STU-ABCDEFGHJKLMNPQRSTUVWXYZ234567';
const HASH = createHash('sha256').update(TOKEN).digest('hex');
const db = { upserts: [], linkUsed: 0, failSave: false, hits: [], limited: false };
globalThis.__cc = () => ({
  rpc: async (name, args) => { assert.equal(name, 'rate_hit'); db.hits.push(args); return { data: !db.limited }; },
  from: (table) => {
    const f = {};
    const o = {
      select: () => o,
      eq: (c, v) => { f[c] = v; return o; },
      maybeSingle: async () => (table === 'fitness_links' && f.token_hash === HASH ? { data: { id: 'l1', user_id: UID } } : { data: null }),
      upsert: async (rows, opts) => { db.upserts.push({ table, rows, opts }); return { error: db.failSave ? { message: 'x' } : null }; },
      update: () => ({ eq: async () => { db.linkUsed++; return { error: null }; } }),
    };
    return o;
  },
});
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' };
let handler; globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
await import(process.env.FN_COPY);

const call = async (body, token = TOKEN, method = 'POST') => {
  const headers = token === null ? {} : { 'x-link-token': token };
  const r = await handler(new Request('http://x', { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined }));
  return [r.status, await r.json().catch(() => null)];
};
const reset = () => { db.upserts.length = 0; db.linkUsed = 0; db.failSave = false; };
const day = (o = {}) => ({ date: '2026-10-07', sessions: 1, minutes: 55, kinds: ['gym'], sleep: 7.5, ...o });
let n = 0; const ok = (name) => console.log(`✓ ${++n}. ${name}`);
let st, b;

// --- ältere Overload-Version ohne Belastung ---
reset(); [st, b] = await call({ days: [day()] });
assert.equal(st, 200); assert.deepEqual(b, { ok: true, saved: 1 }); assert.equal(db.linkUsed, 1);
const row = db.upserts[0].rows[0];
assert.deepEqual(db.upserts[0].opts, { onConflict: 'user_id,date' });
assert.deepEqual([row.user_id, row.date, row.sessions, row.minutes, row.kinds, row.sleep_hours, row.source], [UID, '2026-10-07', 1, 55, ['gym'], 7.5, 'overload']);
for (const k of ['load', 'rpe', 'rpe_set', 'acute_load', 'chronic_load', 'load_ready']) assert.equal(row[k], null, `${k} bleibt leer`);
ok('Zusammenfassung ohne Belastung (ältere Overload-Version) wird wie bisher gespeichert, die neuen Felder bleiben leer');

// --- mit Belastung ---
reset(); [st, b] = await call({ days: [day({ load: 330.4, rpe: 6.04, rpeSet: false, acute: 210.55, chronic: 180, ready: true })] });
const r2 = db.upserts[0].rows[0];
assert.deepEqual([r2.load, r2.rpe, r2.rpe_set, r2.acute_load, r2.chronic_load, r2.load_ready], [330, 6, false, 210.6, 180, true]);
ok('Belastung, Anstrengung, 7- und 28-Tage-Werte werden gespeichert (gerundet)');
reset(); await call({ days: [day({ rpeSet: true, ready: false, load: 0 })] });
const r3 = db.upserts[0].rows[0]; assert.deepEqual([r3.load, r3.rpe_set, r3.load_ready], [0, true, false]); ok('Belastung 0 (Ruhetag) und Wahrheitswerte bleiben erhalten');

// --- ungültige Werte werden leer, nicht abgelehnt ---
reset(); await call({ days: [day({ load: 99999, rpe: 11, rpeSet: 'ja', acute: -3, chronic: 'viel', ready: 1 })] });
const r4 = db.upserts[0].rows[0];
for (const k of ['load', 'rpe', 'rpe_set', 'acute_load', 'chronic_load', 'load_ready']) assert.equal(r4[k], null, `${k} ungültig`);
assert.equal(r4.minutes, 55); ok('ungültige Belastungswerte (zu groß, negativ, falscher Typ) werden leer gespeichert, der Rest bleibt');
reset(); await call({ days: [day({ rpe: 0.5 }), day({ date: '2026-10-06', rpe: 1 }), day({ date: '2026-10-05', rpe: 10 }), day({ date: '2026-10-04', load: 5000 }), day({ date: '2026-10-03', load: NaN })] });
assert.deepEqual(db.upserts[0].rows.map((x) => [x.rpe, x.load]), [[null, null], [1, null], [10, null], [null, 5000], [null, null]]); ok('Grenzen: Anstrengung 1 bis 10, Belastung 0 bis 5000');

// --- bisherige Prüfungen ---
reset(); [st, b] = await call({ days: [day()] }, null); assert.equal(st, 401);
[st, b] = await call({ days: [day()] }, 'zu-kurz'); assert.equal(st, 401);
[st, b] = await call({ days: [day()] }, 'STU-' + 'X'.repeat(40)); assert.equal(st, 401);
[st, b] = await call({}, TOKEN, 'GET'); assert.equal(st, 405); assert.equal(db.upserts.length, 0); ok('ohne oder mit falschem Code abgewiesen, nur POST');
[st, b] = await call({ days: 'x' }); assert.equal(st, 400);
[st, b] = await call({ days: Array.from({ length: 61 }, () => day()) }); assert.equal(st, 400);
[st, b] = await call({}); assert.equal(st, 400); assert.equal(db.upserts.length, 0); ok('ungültige Form oder mehr als 60 Tage: abgewiesen');
reset(); [st, b] = await call({ days: [day({ date: 'kaputt' }), day({ date: '2099-01-01' }), null, day({ date: '2026-10-06', sessions: 99, minutes: 9999, kinds: ['gym', 'gym', 'yoga', 'run'], sleep: 20 })] });
assert.deepEqual(b, { ok: true, saved: 1 }); const r5 = db.upserts[0].rows[0];
assert.deepEqual([r5.sessions, r5.minutes, r5.kinds, r5.sleep_hours], [10, 600, ['gym', 'run'], null]); ok('ungültige Tage fallen weg, Werte werden begrenzt (Einheiten, Minuten, Arten, Schlaf)');
reset(); db.failSave = true; [st, b] = await call({ days: [day()] }); assert.equal(st, 500); assert.equal(b.error, 'save_failed'); ok('Speicherfehler: 500');
reset(); [st, b] = await call({ days: [] }); assert.deepEqual(b, { ok: true, saved: 0 }); assert.equal(db.upserts.length, 0); ok('leere Liste: nichts zu speichern');

// --- Anfragegrenze ---
db.hits.length = 0; db.upserts.length = 0;
let [st2] = await call({ days: [{ date: '2026-10-01', sessions: 1, minutes: 30 }] });
assert.equal(st2, 200); assert.deepEqual(db.hits[0], { p_key: 'fitness:l1', p_max: 30, p_window_seconds: 3600 });
db.limited = true; db.upserts.length = 0; [st2] = await call({ days: [{ date: '2026-10-01', sessions: 1, minutes: 30 }] });
assert.equal(st2, 429); assert.equal(db.upserts.length, 0); db.limited = false;
db.hits.length = 0; [st2] = await call({ days: [] }, 'STU-FALSCHFALSCHFALSCHFALSCH'); assert.equal(st2, 401); assert.equal(db.hits.length, 0);
console.log('✓ Anfragegrenze je Verbindung (30 pro Stunde), erst nach gültigem Code gezählt');
