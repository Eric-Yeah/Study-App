// Kopiert den gemeinsamen Code aus packages/core in die Edge Functions (Deno kann nicht aus packages/core importieren).
// Quelle bleibt packages/core. Nach Änderungen an config.ts, worksheets.ts, cardsAi.ts, languages.ts oder examGrading.ts, taskStyle.ts: npm run sync:shared
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['config.ts', 'worksheets.ts', 'cardsAi.ts', 'languages.ts', 'examGrading.ts', 'practiceExam.ts', 'topics.ts', 'taskStyle.ts', 'access.ts', 'icalUrl.ts']) {
  copyFileSync(join(root, 'packages/core/src', name), join(root, 'supabase/functions/_shared', name));
  console.log(`kopiert: ${name}`);
}
