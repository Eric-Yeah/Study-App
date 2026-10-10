import assert from 'node:assert/strict';
const UID = '11111111-2222-3333-4444-555555555555';
const SONNET = 'claude-sonnet-5-5', HAIKU = 'claude-haiku-5-5';
const PRICE = { [HAIKU]: [0.1, 0.5], [SONNET]: [2, 10] };

const task = (nr, operator, afb, max, punkte) => ({ nr, titel: '', operator, afb, max, max_geschaetzt: false, punkte, richtig: [], fehlt: [], tipp: '', unsicher: false });
const review = (id, teacher, practice_id, tasks) => ({ id, teacher, practice_id, result: { main: { model: SONNET, result: { aufgaben: tasks } } } });
const db = {
  rows: {}, rpc: [], log: [],
  subjects: {
    de: { name: 'Deutsch', type: 'writing', language: 'de', is_advanced: false },
    en: { name: 'Englisch', type: 'knowledge', language: 'en', is_advanced: true },
    ma: { name: 'Mathematik', type: 'problems', language: 'de', is_advanced: false },
  },
  rubrics: { de: { teacher_text: 'Einleitung zählt 10 %.', lessons: [] } },
  notes: [
    { id: 'n1', title: 'Gedichtanalyse Romantik', lesson_date: '2026-09-20', summary: { thema: 'Romantik', kernaussagen: ['Sehnsucht nach dem Unendlichen'], begriffe: ['blaue Blume'], formeln: [], offene_fragen: ['Aufgabe 3 offen'] } },
    { id: 'n2', title: 'Erörterung', lesson_date: '2026-09-10', summary: { thema: 'Erörterung', kernaussagen: ['These, Argument, Beleg'], begriffe: [], formeln: [], offene_fragen: [] } },
    { id: 'n3', title: 'Nicht gewählt', lesson_date: '2026-09-01', summary: { thema: 'Geheim', kernaussagen: ['nicht dabei'], begriffe: [], formeln: [], offene_fragen: [] } },
  ],
  reviews: { de: [], en: [], ma: [] },
  practices: { de: [], en: [], ma: [] },
  styles: { de: [], en: [], ma: [] },
};
const spentOf = () => Object.entries(db.rows).reduce((s, [m, r]) => s + (r.input_tokens * PRICE[m][0] + r.output_tokens * PRICE[m][1]) / 1e6, 0);
const requestsOf = () => Object.values(db.rows).reduce((s, r) => s + r.requests, 0);
const setRow = (model, input_tokens, output_tokens, requests = 0) => { db.rows[model] = { model, requests, input_tokens, output_tokens }; };
globalThis.__cc = (_url, key, opts) => {
  const service = key === 'service';
  const authz = opts?.global?.headers?.Authorization;
  const q = (table) => { const f = {};
    const o = { select: () => o, insert: async (row) => { db.log.push({ table, ...row }); return { error: null } }, eq: (c, v) => { f[c] = v; return o; }, in: (c, v) => { f[c] = v; return o; },
      maybeSingle: async () => {
        if (table === 'accounts') return { data: 'account' in db ? db.account : { status: 'active', is_admin: true, ai_features: [] } }; if (table === 'app_settings') return { data: db.settings ?? { friends_budget_usd: 3, cards_daily_limit: 30 } }; 
        if (table === 'subjects') return { data: db.subjects[f.id] ?? null };
        if (table === 'subject_rubrics') return { data: db.rubrics[f.subject_id] ?? null };
        return { data: null };
      },
      then: (res) => {
        if (table === 'accounts') return Promise.resolve({ data: [{ user_id: 'admin-id' }] }).then(res); 
        if (table === 'lesson_notes') return Promise.resolve({ data: db.notes.filter((n) => (f.id ?? []).includes(n.id)) }).then(res);
        if (table === 'exam_reviews') return Promise.resolve({ data: db.reviews[f.subject_id] ?? [] }).then(res);
        if (table === 'task_styles') return Promise.resolve({ data: db.styles[f.subject_id] ?? [] }).then(res);
        if (table === 'practice_exams') return Promise.resolve({ data: db.practices[f.subject_id] ?? [] }).then(res);
        if (table === 'ai_usage') return Promise.resolve({ data: Object.values(db.rows).map((r) => ({ ...r })) }).then(res);
        return Promise.resolve({ data: [] }).then(res);
      } };
    return o; };
  return {
    auth: { getUser: async () => ({ data: { user: authz === 'Bearer good' ? { id: UID } : null } }) },
    from: q,
    rpc: async (name, args) => {
      if (name === 'ai_begin') { db.locks = (db.locks ?? 0) + 1; return { data: !db.busy }; } if (name === 'ai_end') { db.unlocks = (db.unlocks ?? 0) + 1; return { data: null }; } 
      assert.equal(service, true, 'ai_usage_add nur mit Service-Schlüssel'); assert.equal(name, 'ai_usage_add'); assert.ok(args.p_model);
      db.rpc.push(args);
      const r = db.rows[args.p_model] ?? (db.rows[args.p_model] = { model: args.p_model, requests: 0, input_tokens: 0, output_tokens: 0 });
      r.requests++; r.input_tokens += args.p_input; r.output_tokens += args.p_output; return { error: null };
    },
  };
};
const env = { ANTHROPIC_API_KEY: 'sk-test', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
let handler; globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
await import(process.env.FN_COPY);

const calls = []; let script = [];
const reply = (text, { stop = 'end_turn', usage = { input_tokens: 4000, output_tokens: 5000 } } = {}) => ({ status: 200, body: { content: [{ type: 'text', text }], stop_reason: stop, usage } });
const err = (status, type, message, headers = {}) => ({ status, body: { type: 'error', error: { type, message } }, headers });
globalThis.fetch = async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body) });
  const r = script.shift(); assert.ok(r, 'unerwarteter Anthropic-Aufruf');
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json', ...(r.headers ?? {}) } });
};
const examJson = (o = {}) => JSON.stringify({
  titel: 'Übungsklausur Deutsch', dauer_min: 90, hilfsmittel: 'Wörterbuch', hinweise: ['Arbeite sauber.'],
  teile: [{ name: 'Teil A', hinweis: 'Lies den Text.', materialien: [{ id: 'M1', typ: 'text', titel: 'Text', quelle: 'Für diese Übung verfasst', text: 'Absatz eins.' }],
    aufgaben: [{ nr: '1', operator: 'Fasse', afb: 1, text: 'Fasse zusammen.', be: 10 }, { nr: '2', operator: 'Analysiere', afb: 2, text: 'Analysiere.', be: 99, teilaufgaben: [{ nr: 'a', text: 'Nenne Mittel.', be: 6 }, { nr: 'b', text: 'Deute.', be: 8 }] }] }],
  gesamt_be: 5, ...o,
});
const solutionsJson = JSON.stringify({ aufgaben: [{ nr: '1', erwartung: ['Thema (4 BE)'], loesung: 'Der Text handelt von ...', teilaufgaben: [] }, { nr: '2', erwartung: ['Mittel (6 BE)'], loesung: '', teilaufgaben: [{ nr: 'a', loesung: 'Metapher' }, { nr: 'b', loesung: 'Sie zeigt ...' }] }] });
const call = async (body, authz = 'Bearer good') => { const r = await handler(new Request('http://x', { method: 'POST', headers: { Authorization: authz }, body: JSON.stringify(body) })); return [r.status, await r.json()]; };
const reset = (s = []) => { calls.length = 0; db.rpc.length = 0; db.log.length = 0; db.rows = {}; db.reviews = { de: [], en: [], ma: [] }; db.practices = { de: [], en: [], ma: [] }; script = s; };
const exam = { practiceId: 'p1', subjectId: 'de', mode: 'exam', level: 'mittel', noteIds: ['n1', 'n2'], topic: 'Eichendorff', teacher: 'Müller' };
let n = 0; const ok = (name) => console.log(`✓ ${++n}. ${name}`);
let st, b;

// --- Klausur erstellen ---
reset([reply(examJson())]); [st, b] = await call(exam);
assert.equal(st, 200);
const req = calls[0].body;
assert.equal(req.model, SONNET); assert.equal(req.max_tokens, 10000); assert.deepEqual(req.output_config, { effort: 'medium' });
for (const k of ['thinking', 'temperature', 'top_p', 'top_k']) assert.ok(!(k in req), `kein ${k}`);
assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
assert.equal(b.model, SONNET); assert.deepEqual(db.rpc.map((r) => r.p_model), [SONNET]);
ok('Klausur mit Sonnet (medium), max_tokens 10000, kein thinking/temperature/top_p/top_k, Verbrauch gezählt');

assert.equal(b.exam.gesamt_be, 24); assert.equal(b.exam.teile[0].aufgaben[1].be, 14); // Punkte selbst nachgerechnet
assert.deepEqual(b.meta, { difficulty: 'mittel', profileN: 0, shift: 0, afb: [25, 50, 25], totalBe: 60, styleN: 0 });
ok('Antwort: Punkte nachgerechnet (nicht die der KI), Meta mit Standardaufbau ohne echte Klausuren');

assert.ok(req.system.includes('Übungsklausur im Fach Deutsch (Grundkurs)') && req.system.includes('Stufe MITTEL'));
assert.ok(req.system.includes('Thema: Romantik') && req.system.includes('Sehnsucht nach dem Unendlichen') && req.system.includes('blaue Blume'));
assert.ok(req.system.includes('These, Argument, Beleg') && !req.system.includes('nicht dabei'));
assert.ok(req.system.indexOf('- Erörterung (2026-09-10)') < req.system.indexOf('- Gedichtanalyse Romantik (2026-09-20)')); // älteste Notiz zuerst
ok('Prompt: Fach, Stufe, nur die gewählten Notizen als Unterrichtsmaterial');

assert.ok(req.system.includes('Themenwunsch: Eichendorff') && req.system.includes('Einleitung zählt 10 %.') && req.system.includes('Textvorlage'));
assert.ok(req.system.includes('Erwartungshorizont und Musterlösung folgen') && !req.system.includes('"erwartung": string'));
ok('Prompt: Themenwunsch, Vorgaben der Lehrkraft, Aufbau des Fachs, Lösungen kommen im zweiten Schritt');

const l = db.log[0];
assert.deepEqual([l.table, l.kind, l.task, l.model, l.status, l.note_id], ['ai_log', 'practice', 'exam', SONNET, 'ok', 'p1']);
assert.ok(Math.abs(l.cost_usd - (4000 * 2 + 5000 * 10) / 1e6) < 1e-12); assert.ok(!JSON.stringify(l).includes('Romantik'));
ok('Protokoll: Art practice mit Modell, Kosten, ohne Inhalte');

// --- Vorbild: echte Klausuren, Rückmeldung ---
reset([reply(examJson())]);
db.reviews.de = [
  review('r1', 'Müller', null, [task('1', 'Beschreiben', 1, 10, 8), task('2', 'Analysieren', 2, 30, 20), task('3', 'Beurteilen', 3, 20, 10)]),
  review('r2', 'Müller', null, [task('1', 'Beschreiben', 1, 10, 9), task('2', 'Analysieren', 2, 20, 12)]),
  review('r3', 'Schmidt', 'pOld', [task('1', 'Erörtern', 3, 100, 90)]), // Übungsklausur: zählt nicht als Vorbild
];
[st, b] = await call(exam);
assert.equal(b.meta.profileN, 2); assert.equal(b.meta.totalBe, 45); assert.deepEqual(b.meta.afb, [22, 56, 22]);
assert.match(calls[0].body.system, /aus 2 korrigierten Klausuren.*im Schnitt 2,5 Aufgaben und 45 BE.*analysieren \(2x\), beschreiben \(2x\)/);
ok('Profil aus echten Klausuren (ohne Übungsklausuren): Punkte, Mischung und Operatoren im Prompt');

reset([reply(examJson())]);
db.reviews.de = [review('r1', 'Müller', null, [task('1', 'Beschreiben', 1, 10, 8)]), review('r2', 'Schmidt', null, [task('1', 'Erörtern', 3, 30, 20)]), review('r3', 'Schmidt', null, [task('1', 'Diskutieren', 3, 20, 10)])];
[st, b] = await call({ ...exam, teacher: 'schmidt' }); assert.equal(b.meta.profileN, 2); assert.equal(b.meta.totalBe, 25);
reset([reply(examJson())]); db.reviews.de = [review('r1', 'Müller', null, [task('1', 'Beschreiben', 1, 10, 8)]), review('r2', 'Schmidt', null, [task('1', 'Erörtern', 3, 30, 20)])];
[st, b] = await call({ ...exam, teacher: 'Schmidt' }); assert.equal(b.meta.profileN, 2, 'bei nur einer Klausur der Lehrkraft zählen alle');
ok('Bei mindestens zwei Klausuren derselben Lehrkraft zählen nur diese, sonst alle');

// --- Stil der Aufgabenblätter ---
reset([reply(examJson())]);
db.styles.de = [
  { teacher: 'Müller', created_at: '2026-09-02', style: { zusammenfassung: 'Knapp und streng.', aufbau: ['Drei Aufgaben mit a bis c'], formulierungen: ['Analysiere M1 und deute die Wirkung.'], operatoren: [], materialien: [], bewertung: [], besonderheiten: [], extra: 'x' } },
  { teacher: 'Meier', created_at: '2026-09-05', style: { zusammenfassung: 'Offen.', aufbau: ['Ein langer Essay'], formulierungen: [], operatoren: [], materialien: [], bewertung: [], besonderheiten: [] } },
  { teacher: 'Müller', created_at: '2026-09-06', style: 'kaputt' },
];
[st, b] = await call({ ...exam, teacher: 'müller' });
assert.equal(st, 200); assert.equal(b.meta.styleN, 1);
assert.ok(calls[0].body.system.includes('Stil der echten Aufgabenblätter dieser Lehrkraft') && calls[0].body.system.includes('Knapp und streng.') && calls[0].body.system.includes('Drei Aufgaben mit a bis c'));
assert.ok(!calls[0].body.system.includes('Ein langer Essay') && !calls[0].body.system.includes('extra'));
ok('Stil: die Blätter der gewählten Lehrkraft fließen in den Prompt, kaputte und fremde nicht, meta.styleN');
reset([reply(examJson())]); [st, b] = await call({ ...exam, teacher: 'Schmidt' });
assert.equal(b.meta.styleN, 2); assert.ok(calls[0].body.system.includes('Ein langer Essay | Drei Aufgaben mit a bis c'));
ok('Stil: ohne Blatt dieser Lehrkraft zählen die übrigen des Fachs');
reset([reply(examJson())]); db.styles.de = []; [st, b] = await call(exam);
assert.equal(b.meta.styleN, 0); assert.ok(!calls[0].body.system.includes('Stil der echten Aufgabenblätter'));
ok('Stil: ohne gelernte Blätter keine Zeilen im Prompt');

reset([reply(examJson())]);
db.practices.de = [
  { id: 'a', difficulty: 'mittel', rating: -1, created_at: '2026-09-01' },
  { id: 'b', difficulty: 'mittel', rating: -1, created_at: '2026-09-10' },
  { id: 'd', difficulty: 'mittel', rating: -1, created_at: '2026-09-11' },
  { id: 'c', difficulty: 'schwer', rating: 1, created_at: '2026-09-12' },
];
[st, b] = await call(exam);
assert.equal(b.meta.shift, 2); assert.ok(b.meta.afb[2] > 40, `schwerer als der Standard: ${b.meta.afb}`);
ok('Rückmeldung "zu leicht" bei der Stufe: nächste Klausur schwerer, andere Stufen zählen nicht');
reset([reply(examJson())]); db.practices.de = [{ id: 'a', difficulty: 'leicht', rating: 1, created_at: '2026-09-01' }];
[st, b] = await call({ ...exam, level: 'leicht' }); assert.equal(b.meta.shift, -1); assert.ok(b.meta.afb[2] < 16);
ok('Stufe leicht mit "zu schwer": noch leichter');

reset([reply(examJson())]);
db.reviews.de = [review('r1', 'Müller', null, [task('1', 'Beschreiben', 1, 100, 55)]), review('rp', 'Müller', 'a', [task('1', 'Beschreiben', 1, 100, 90)])];
db.practices.de = [{ id: 'a', difficulty: 'mittel', rating: null, created_at: '2026-09-01' }];
[st, b] = await call(exam); assert.equal(b.meta.shift, 1);
ok('Ergebnis der Übungsklausur (90 %) weit über den echten Klausuren (55 %): zu leicht, schwerer');

// --- Fach und Sprache ---
reset([reply(examJson())]); await call({ ...exam, subjectId: 'en', noteIds: [] });
assert.ok(calls[0].body.system.includes('Leistungskurs') && calls[0].body.system.includes('Comprehension') && calls[0].body.system.includes('auf Englisch unterrichtet') && calls[0].body.system.includes('135 Minuten') && calls[0].body.system.includes('90 Bewertungseinheiten') && calls[0].body.system.includes('Es gibt kein Unterrichtsmaterial'));
ok('Englisch Leistungskurs: Aufbau mit Comprehension, Sprache Englisch, 135 Minuten, 90 BE');
reset([reply(examJson())]); await call({ ...exam, subjectId: 'ma', durationMin: 60 });
assert.ok(calls[0].body.system.includes('Teil A (ohne Hilfsmittel)') && calls[0].body.system.includes('60 Minuten'));
ok('Mathematik: Teil A und Teil B, gewünschte Zeit wird übernommen');

// --- Erwartungshorizont und Musterlösung ---
const content = JSON.parse(examJson()); content.teile[0].aufgaben[1].be = 14;
reset([reply(solutionsJson, { usage: { input_tokens: 3000, output_tokens: 4000 } })]);
[st, b] = await call({ mode: 'solutions', practiceId: 'p1', subjectId: 'de', exam: content });
assert.equal(st, 200); assert.equal(calls[0].body.max_tokens, 10000); assert.equal(calls[0].body.model, SONNET); assert.deepEqual(calls[0].body.output_config, { effort: 'medium' });
assert.ok(calls[0].body.system.includes('Erwartungshorizont und die Musterlösung') && calls[0].body.system.includes('Aufgabe 2 (14 BE): Analysiere.') && calls[0].body.system.includes('Absatz eins.'));
assert.deepEqual(Object.keys(b.solutions), ['1', '2']); assert.equal(b.solutions['2'].teilaufgaben.a, 'Metapher');
assert.deepEqual([db.log[0].kind, db.log[0].task, db.log[0].status], ['practice', 'solutions', 'ok']);
ok('Zweiter Schritt: Klausur im Prompt, Lösungen je Aufgabennummer, Protokoll mit Aufgabe solutions');
reset(); [st, b] = await call({ mode: 'solutions', practiceId: 'p1', subjectId: 'de', exam: { teile: [] } }); assert.equal(st, 400); assert.equal(calls.length, 0);
[st, b] = await call({ mode: 'solutions', practiceId: 'p1', subjectId: 'de' }); assert.equal(st, 400);
ok('zweiter Schritt ohne gültige Klausur: abgelehnt, nichts an Claude');

// --- Kosten ---
reset([reply(examJson())]); setRow(SONNET, 2_000_000, 80_000, 5); // 4,80 $ verbraucht
[st, b] = await call(exam); assert.equal(st, 200); ok('Budget: passt die Klausur im schlimmsten Fall noch hinein, wird erstellt');
reset([reply(examJson())]); setRow(SONNET, 2_000_000, 90_000, 5); // 4,90 $: 10000 Token Ausgabe passen nicht mehr
[st, b] = await call(exam); assert.equal(st, 429); assert.equal(b.error, 'budget_reached'); assert.equal(calls.length, 0); assert.equal(db.log[0].status, 'budget_reached');
ok('Budget: schlimmster Fall über dem Monatsbudget, nichts an Claude, im Protokoll');
reset([reply(examJson())]); setRow(SONNET, 1000, 100, 500); [st, b] = await call(exam); assert.equal(b.error, 'cap_reached'); ok('Monatslimit der Anfragen');

// --- Fehler ---
reset([reply('Das ist kein JSON')]); [st, b] = await call(exam); assert.equal(st, 502); assert.equal(b.error, 'invalid_json'); assert.equal(requestsOf(), 1); assert.equal(db.log[0].status, 'invalid_json');
ok('ungültiges JSON: deutsche Meldung, Verbrauch trotzdem gezählt, im Protokoll');
reset([reply(JSON.stringify({ teile: [{ aufgaben: [] }] }))]); [st, b] = await call(exam); assert.equal(b.error, 'invalid_json'); ok('Antwort ohne Aufgaben gilt als ungültig');
reset([reply('{"teile": [', { stop: 'max_tokens' })]); [st, b] = await call(exam); assert.equal(b.error, 'truncated'); ok('abgeschnitten: deutsche Meldung');
reset([err(402, 'billing_error', 'Billing problem')]); [st, b] = await call(exam); assert.equal(b.error, 'billing'); ok('Guthaben leer');
reset([err(429, 'rate_limit_error', 'x', { 'retry-after': '0' }), reply(examJson())]); [st, b] = await call(exam); assert.equal(st, 200); assert.equal(calls.length, 2); ok('429: einmal wiederholt');
reset([err(529, 'overloaded_error', 'busy')]); [st, b] = await call(exam); assert.equal(b.error, 'unavailable'); ok('überlastet (529): deutsche Meldung');

reset();
[st, b] = await call(exam, 'Bearer schlecht'); assert.equal(st, 401);
[st, b] = await call({ ...exam, subjectId: 'fremd' }); assert.equal(st, 404);
[st, b] = await call({ ...exam, level: 'extrem' }); assert.equal(st, 400);
[st, b] = await call({ ...exam, level: undefined }); assert.equal(st, 400);
[st, b] = await call({ ...exam, mode: 'irgendwas' }); assert.equal(st, 400);
[st, b] = await call({ ...exam, practiceId: '' }); assert.equal(st, 400);
[st, b] = await call({ ...exam, subjectId: '' }); assert.equal(st, 400);
assert.equal(calls.length, 0);
ok('Anmeldung, unbekanntes Fach, falsche Stufe oder Modus, fehlende Angaben: abgelehnt, nichts an Claude');
reset([reply(examJson())]); await call({ ...exam, noteIds: Array.from({ length: 40 }, () => 'n1'), topic: 'x'.repeat(2000) });
assert.ok(calls[0].body.system.includes('Themenwunsch: ' + 'x'.repeat(400)) && !calls[0].body.system.includes('x'.repeat(401)));
ok('Themenwunsch wird auf die erlaubte Länge gekürzt');
env.ANTHROPIC_API_KEY = ''; reset(); [st, b] = await call(exam); assert.equal(st, 500); assert.equal(b.error, 'not_configured'); env.ANTHROPIC_API_KEY = 'sk-test';
ok('ohne ANTHROPIC_API_KEY: deutsche Meldung');
