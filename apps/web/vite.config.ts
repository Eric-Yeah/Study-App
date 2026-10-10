import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// Die Version steht nur in src/releaseNotes.ts (oberster Eintrag), so kann sie nicht von den Release Notes abweichen.
const version = /version:\s*'([\d.]+)'/.exec(readFileSync(new URL('./src/releaseNotes.ts', import.meta.url), 'utf8'))?.[1];
if (!version) throw new Error('Keine Version in src/releaseNotes.ts gefunden');

/** Schreibt version.json, damit offene Apps neue Versionen erkennen (auch im Dev-Server). */
function versionFile(): Plugin {
  const body = JSON.stringify({ version });
  return {
    name: 'version-file',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0].endsWith('/version.json')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(body);
        } else next();
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body });
    },
  };
}

/**
 * Content-Security-Policy als meta-Tag (GitHub Pages kann keine Header setzen), nur im Build: Skripte nur von der App selbst und das
 * eine Skript in index.html über seinen Hash, Verbindungen nur zur App und zu Supabase, keine Plugins, keine fremden Formulare.
 * Im Dev-Server fehlt sie, weil Vite dort eigene Skripte einfügt.
 */
export function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
          (m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`,
        );
        const supabase = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
        const ws = supabase.replace(/^https:/, 'wss:');
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`.trim(),
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data: blob:",
          `connect-src 'self' ${supabase} ${ws}`.trim(),
          "worker-src 'self' blob:",
          "frame-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "manifest-src 'self'",
        ].join('; ');
        return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
      },
    },
  };
}

// GitHub Pages: die App liegt unter /<Repository-Name>/. Im Workflow kommt der Name aus
// GITHUB_REPOSITORY (Groß- und Kleinschreibung wie im Repository), lokal gilt /study-app/.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];

export default defineConfig({
  base: repo ? `/${repo}/` : '/study-app/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), versionFile(), contentSecurityPolicy()],
  server: { port: 5173 },
});
