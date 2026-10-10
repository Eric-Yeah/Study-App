# Study App

Lern-App für die Oberstufe: Lernplan mit Deadlines, Fokus-Timer und eine App, die Priorität, Vorlauf und Lernzeit pro Fach vorschlägt.

## Starten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm run dev
```

Dann im Browser http://localhost:5173/study-app/ öffnen. Für das Handy im selben WLAN die Netzwerk-Adresse nehmen, die Vite im Terminal anzeigt.

## Backend (Supabase)

Die App nutzt Supabase für Anmeldung und Daten. Lege `apps/web/.env.local` nach dem Muster von `apps/web/.env.example` an (Projekt-URL und öffentlicher anon-Schlüssel). Die Tabellen kommen aus `supabase/migrations/` (im SQL Editor von Supabase ausführen), die Edge Function aus `supabase/functions/lanis-calendar/`.

## Veröffentlichen

Push auf `main` baut die App und veröffentlicht sie über GitHub Pages (`.github/workflows/deploy.yml`). Dafür müssen die Repository-Variablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` gesetzt sein.

## Weiterbauen mit Claude Code

Ordner in Claude Code öffnen. Claude Code liest `CLAUDE.md` automatisch, die vollständige Beschreibung steht in `docs/spec.md`.
