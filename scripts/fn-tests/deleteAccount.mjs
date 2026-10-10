import assert from 'node:assert/strict';
const UID = '11111111-2222-3333-4444-555555555555';
const state = { admin: false, deleted: [], removed: [], failDelete: false };
globalThis.__cc = (_u, key, opts) => {
  const service = key === 'service';
  const authz = opts?.global?.headers?.Authorization;
  return {
    auth: {
      getUser: async () => ({ data: { user: authz === 'Bearer good' ? { id: UID } : null } }),
      admin: { deleteUser: async (id) => { assert.equal(service, true); state.deleted.push(id); return { error: state.failDelete ? { message: 'x' } : null }; } },
    },
    from: (table) => { const f = {}; const o = { select: () => o, eq: (c, v) => { f[c] = v; return o; }, maybeSingle: async () => { assert.equal(table, 'accounts'); assert.equal(f.user_id, UID); return { data: { is_admin: state.admin } }; } }; return o; },
    storage: { from: (bucket) => ({
      list: async (folder) => { assert.equal(folder, UID); return { data: state.removed.some((p) => p.startsWith(bucket)) ? [] : [{ name: `${bucket}.x` }], error: null }; },
      remove: async (paths) => { state.removed.push(...paths.map((p) => `${bucket}:${p}`)); return { error: null }; },
    }) },
  };
};
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
let handler; globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
await import(process.env.FN_COPY);
const call = async (body, authz = 'Bearer good') => { const r = await handler(new Request('http://x', { method: 'POST', headers: { Authorization: authz }, body: JSON.stringify(body) })); return [r.status, await r.json()]; };
let n = 0; const ok = (m) => console.log(`✓ ${++n}. ${m}`);
let st, b;
[st, b] = await call({ confirm: 'LÖSCHEN' }); assert.equal(st, 200); assert.deepEqual(state.deleted, [UID]);
assert.deepEqual(state.removed.sort(), [`documents:${UID}/documents.x`, `exams:${UID}/exams.x`, `worksheets:${UID}/worksheets.x`]);
ok('eigenes Konto: erst alle Dateien im eigenen Ordner, dann das Konto');
state.deleted.length = 0;
[st] = await call({}); assert.equal(st, 400); [st] = await call({ confirm: 'ja' }); assert.equal(st, 400); [st] = await call({ confirm: 'LÖSCHEN', userId: 'jemand' }); assert.equal(state.deleted[0], UID); state.deleted.length = 0;
ok('ohne Bestätigung abgelehnt, eine fremde Id wird ignoriert (es zählt nur das angemeldete Konto)');
[st] = await call({ confirm: 'LÖSCHEN' }, 'Bearer schlecht'); assert.equal(st, 401); assert.equal(state.deleted.length, 0); ok('ohne Anmeldung: 401');
state.admin = true; [st, b] = await call({ confirm: 'LÖSCHEN' }); assert.equal(st, 403); assert.equal(state.deleted.length, 0); state.admin = false; ok('das Admin-Konto lässt sich so nicht löschen');
state.failDelete = true; [st, b] = await call({ confirm: 'LÖSCHEN' }); assert.equal(st, 503); ok('Fehler beim Löschen: deutsche Meldung');
