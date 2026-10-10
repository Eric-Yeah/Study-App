-- Ausfälle im Plan (Tage mit weniger oder ohne Lernzeit) und Themenliste pro Klausur.

create table public.day_overrides (
  user_id      uuid not null references auth.users(id) on delete cascade,
  date         date not null,
  capacity_min smallint not null check (capacity_min between 0 and 600), -- 0 = fällt aus
  primary key (user_id, date)
);

create table public.exam_topics (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  exam_id    text not null references public.exams(id) on delete cascade,
  title      text not null,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

create index on public.exam_topics (user_id, exam_id);

alter table public.day_overrides enable row level security;
alter table public.exam_topics   enable row level security;

create policy "own rows" on public.day_overrides for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.exam_topics for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
