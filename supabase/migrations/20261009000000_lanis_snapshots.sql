-- Zuletzt aus Lanis gelesene Pläne (Stundenplan, Vertretungen) als JSON pro Nutzer.
-- JSON statt eigener Tabellen, weil sich das Format bei Lanis ändern kann und die Pläne bei jedem Import ersetzt werden.

create table public.lanis_snapshots (
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('timetable', 'substitutions')),
  data       jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.lanis_snapshots enable row level security;

create policy "own rows" on public.lanis_snapshots for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
