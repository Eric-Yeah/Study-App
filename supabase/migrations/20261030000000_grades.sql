-- Einzelnoten (Klausuren, mündliche Mitarbeit, Tests, Referate ...) und das Verhältnis Klausuren zu sonstigen Leistungen je Fach.
-- Die Kursnote (Halbjahresnote) rechnet die App aus diesen Noten (packages/core/src/grades.ts).

create table public.grades (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  subject_id text not null references public.subjects(id) on delete cascade,
  exam_id    text references public.exams(id) on delete set null,
  quarter    text not null check (quarter in ('Q1', 'Q2', 'Q3', 'Q4')),
  date       date not null,
  kind       text not null check (kind in ('exam', 'oral', 'test', 'presentation', 'homework', 'project', 'other')),
  title      text not null default '' check (char_length(title) <= 120),
  points     smallint not null check (points between 0 and 15),
  weight     numeric(3, 1) not null default 1 check (weight between 0.5 and 5),
  created_at timestamptz not null default now()
);

create index on public.grades (user_id, subject_id, quarter);

-- Ein Datensatz je Nutzer: Anteil der Klausuren an der Kursnote je Fach (Prozent), die App liest und prüft den Inhalt selbst
create table public.grade_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 20000),
  updated_at timestamptz not null default now()
);

alter table public.grades         enable row level security;
alter table public.grade_settings enable row level security;

create policy "own rows" on public.grades for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.grade_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Nur freigegebene Konten schreiben
do $$
declare t text;
begin
  foreach t in array array['grades', 'grade_settings']
  loop
    execute format('create policy "nur aktive Konten anlegen" on public.%I as restrictive for insert to authenticated with check (public.is_active())', t);
    execute format('create policy "nur aktive Konten ändern" on public.%I as restrictive for update to authenticated using (public.is_active()) with check (public.is_active())', t);
  end loop;
end $$;

-- Verknüpfungen nur mit eigenen Fächern und Klausuren
create policy "eigene Verknüpfung anlegen" on public.grades as restrictive for insert to authenticated
  with check (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid()))
    and (exam_id is null or exists (select 1 from public.exams e where e.id = exam_id and e.user_id = (select auth.uid())))
  );
create policy "eigene Verknüpfung ändern" on public.grades as restrictive for update to authenticated
  using (true)
  with check (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid()))
    and (exam_id is null or exists (select 1 from public.exams e where e.id = exam_id and e.user_id = (select auth.uid())))
  );

-- Höchstens 200 Noten je Fach
create or replace function public.grades_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- ein Upsert auf eine vorhandene Zeile ist keine neue Note
  if exists (select 1 from public.grades where id = new.id) then
    return new;
  end if;
  if (select count(*) from public.grades where subject_id = new.subject_id) >= 200 then
    raise exception 'Zu viele Noten für dieses Fach';
  end if;
  return new;
end $$;
revoke all on function public.grades_limit() from public, anon, authenticated;
create trigger grades_limit before insert on public.grades for each row execute function public.grades_limit();

-- Live auf allen Geräten
alter publication supabase_realtime add table public.grades;
alter publication supabase_realtime add table public.grade_settings;
