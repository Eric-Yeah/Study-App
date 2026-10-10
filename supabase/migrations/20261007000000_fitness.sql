-- Konzentrationsscore und Kopplung an die Fitness-App Overload.
--
-- daily_checkins: Selbsteinschätzung pro Tag (Energie, Schlaf, Training von Hand)
-- fitness_daily:  Tageszusammenfassung (Training und Schlaf), die Overload über die Edge Function fitness-ingest schickt
-- fitness_links:  Verbindungscodes für Overload (nur der SHA-256-Hash, der Code selbst wird nie gespeichert)

create table public.daily_checkins (
  user_id           uuid not null references auth.users(id) on delete cascade,
  date              date not null,
  energy            smallint check (energy between 1 and 5),
  sleep_hours       real check (sleep_hours between 0 and 14),
  training_sessions smallint check (training_sessions between 0 and 10),
  training_minutes  smallint check (training_minutes between 0 and 600),
  primary key (user_id, date)
);

create table public.fitness_daily (
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  sessions   smallint not null check (sessions between 0 and 10),
  minutes    smallint not null check (minutes between 0 and 600),
  kinds      text[] not null default '{}',
  sleep_hours real check (sleep_hours between 0 and 14),
  source     text not null default 'overload',
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table public.fitness_links (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  token_hash   text not null unique,
  label        text not null default 'Overload',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index on public.fitness_links (user_id);

alter table public.daily_checkins enable row level security;
alter table public.fitness_daily  enable row level security;
alter table public.fitness_links  enable row level security;

create policy "own rows" on public.daily_checkins for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- fitness_daily: Nutzer dürfen lesen, schreiben darf nur die Edge Function (service_role umgeht RLS).
create policy "read own" on public.fitness_daily for select to authenticated
  using (user_id = (select auth.uid()));

-- fitness_links: Nutzer legen eigene Verbindungen an, sehen sie und trennen sie wieder.
create policy "read own" on public.fitness_links for select to authenticated
  using (user_id = (select auth.uid()));
create policy "insert own" on public.fitness_links for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "delete own" on public.fitness_links for delete to authenticated
  using (user_id = (select auth.uid()));
