-- Study App: Datenbankschema für Supabase (Postgres) mit Row Level Security.
-- Feldnamen entsprechen den TypeScript-Typen in packages/core/src/types.ts (snake_case).
-- IDs sind text, damit im Browser erzeugte IDs und der Import lokaler Daten funktionieren.

create table public.profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  role          text not null check (role in ('student_school','student_university','other')),
  federal_state text not null,
  stage         text not null check (stage in ('E','Q1','Q2','Q3','Q4')),
  onboarded     boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.subjects (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  color           text not null,
  is_advanced     boolean not null default false,
  is_exam_subject boolean not null default false,
  status          text not null default 'active' check (status in ('active','drop_q3','dropped')),
  type            text not null check (type in ('problems','knowledge','writing')),
  points          integer not null check (points between 0 and 15),
  difficulty      integer not null check (difficulty between 1 and 5)
);

create table public.exams (
  id                 text primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  subject_id         text not null references public.subjects(id) on delete cascade,
  title              text not null,
  date               date not null,
  priority_manual    integer check (priority_manual between 1 and 10),
  total_hours_manual real check (total_hours_manual >= 0),
  start_days_manual  integer check (start_days_manual >= 1)
);

create table public.plan_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  free_days_per_week integer not null default 1 check (free_days_per_week between 0 and 2),
  daily_limit_min    integer not null default 180 check (daily_limit_min > 0)
);

create table public.timer_settings (
  user_id                   uuid primary key references auth.users(id) on delete cascade,
  focus_min                 integer not null default 25,
  short_break_min           integer not null default 5,
  long_break_min            integer not null default 15,
  sessions_until_long_break integer not null default 4
);

-- Laufender Timer: eine Zeile pro Nutzer, Abgleich zwischen Geräten über Realtime.
-- state hat dieselbe Form wie TimerState in apps/web/src/timer/types.ts.
create table public.timer_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null,
  updated_at bigint not null -- Millisekunden, der neuere Zustand gewinnt
);

create table public.focus_sessions (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  subject_id text references public.subjects(id) on delete set null,
  started_at timestamptz not null,
  ended_at   timestamptz not null,
  minutes    integer not null check (minutes >= 0)
);

create table public.tasks (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  subject_id text references public.subjects(id) on delete set null,
  title      text not null,
  minutes    integer,
  date       date not null,
  done       boolean not null default false
);

create index on public.subjects (user_id);
create index on public.exams (user_id);
create index on public.focus_sessions (user_id, ended_at);
create index on public.tasks (user_id, date);

-- Row Level Security: jede Person sieht und ändert nur ihre eigenen Zeilen.
alter table public.profiles       enable row level security;
alter table public.subjects       enable row level security;
alter table public.exams          enable row level security;
alter table public.plan_settings  enable row level security;
alter table public.timer_settings enable row level security;
alter table public.timer_state    enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.tasks          enable row level security;

create policy "own rows" on public.profiles       for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.subjects       for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.exams          for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.plan_settings  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.timer_settings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.timer_state    for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.focus_sessions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.tasks          for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Realtime für den Timer-Abgleich.
alter publication supabase_realtime add table public.timer_state;
