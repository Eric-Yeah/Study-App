-- Abiturrechner: die Eingaben pro Nutzer (Punkte der Kurse, gewählte Grundkurse, Prüfungsfächer und -ergebnisse).
-- Ein Datensatz je Nutzer, die App liest und prüft den Inhalt selbst (readAbiturPlan).

create table public.abitur_plans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 20000),
  updated_at timestamptz not null default now()
);

alter table public.abitur_plans enable row level security;

create policy "own rows" on public.abitur_plans for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Live auf allen Geräten
alter publication supabase_realtime add table public.abitur_plans;
