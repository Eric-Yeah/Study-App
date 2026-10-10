-- Protokoll der KI-Anfragen für das versteckte Admin-Protokoll. Nur die Edge Functions (service_role) schreiben und lesen,
-- die App kommt nur über die Function admin-log (mit Passwort) heran. Gespeichert werden keine Inhalte, nur Zahlen und Fehlercodes.

create table public.ai_log (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  at            timestamptz not null default now(),
  kind          text not null check (kind in ('summarize', 'cards')),
  task          text not null default '',
  model         text not null default '',
  effort        text not null default '',
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd      numeric(12, 6) not null default 0,
  duration_ms   integer not null default 0,
  status        text not null default 'ok',
  note_id       text,
  detail        text not null default ''
);

create index on public.ai_log (user_id, at desc);

alter table public.ai_log enable row level security;
-- bewusst keine Policy: ohne Policy sehen eingeloggte Nutzer nichts, service_role umgeht die Sperre
revoke all on table public.ai_log from anon, authenticated;
