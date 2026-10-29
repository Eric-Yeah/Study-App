// Prüft die Edge Functions mit simulierten Diensten (Supabase, Anthropic, Groq) in Node, ohne Deno und ohne Netz.
// Aufruf: npm run test:functions
// Jede Function wird als Kopie mit ersetztem Supabase-Import geladen (zz-test-copy.ts, danach gelöscht).
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const suites = [
  ['summarize-worksheet', 'summarize.mjs'],
  ['generate-cards', 'cards.mjs'],
  ['admin-log', 'admin.mjs'],
  ['correct-exam', 'exam.mjs'],
  ['generate-exam', 'practice.mjs'],
  ['suggest-topics', 'topics.mjs'],
  ['learn-style', 'style.mjs'],
  ['push-send', 'push.mjs'],
  ['delete-account', 'deleteAccount.mjs'],
  ['lanis-calendar', 'lanis.mjs'],
  ['dsb-plan', 'dsb.mjs'],
  ['fitness-ingest', 'fitness.mjs'],
  ['ical-fetch', 'ical.mjs'],
];
const only = process.argv[2];
let failed = 0;
for (const [fn, file] of suites) {
  if (only && !fn.includes(only)) continue;
  const copy = join(root, 'supabase', 'functions', fn, 'zz-test-copy.ts');
  const source = readFileSync(join(root, 'supabase', 'functions', fn, 'index.ts'), 'utf8').replace(
    "import { createClient } from 'npm:@supabase/supabase-js@2';",
    'const createClient = (...a: any[]) => (globalThis as any).__cc(...a);',
  );
  writeFileSync(copy, source);
  try {
    console.log(`\n== ${fn}`);
    const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(here, file)], { stdio: 'inherit', env: { ...process.env, FN_COPY: copy } });
    if (r.status !== 0) failed++;
  } finally {
    rmSync(copy, { force: true });
  }
}
process.exit(failed ? 1 : 0);
