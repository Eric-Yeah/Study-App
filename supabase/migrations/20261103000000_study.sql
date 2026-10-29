-- Studierenden-Modus: Module (ECTS) an subjects, Prüfungsart und Versuch an exams, dazu Studieneinstellungen,
-- Ergebnisse mit Noten 1,0 bis 5,0, Fristen und Stundenplan mit freier Uhrzeit.
-- Die Schul-Daten bleiben unberührt: subjects.scope trennt Schule und Studium, die Oberfläche zeigt immer nur eine Seite.

alter table public.subjects
  add column scope    text not null default 'school' check (scope in ('school', 'uni')),
  add column ects     numeric(4, 1) check (ects is null or (ects > 0 and ects <= 60)),
  add column semester smallint check (semester is null or semester between 1 and 30),
  add column required boolean not null default true,
  add column lecturer text not null default '' check (char_length(lecturer) <= 120);

alter table public.exams
  add column kind          text not null default 'written' check (kind in ('written', 'oral', 'paper', 'presentation', 'project', 'testat', 'other')),
  add column attempt       smallint not null default 1 check (attempt between 1 and 9),
  add column free_attempt  boolean not null default false,
  add column register_by   date,
  add column withdraw_by   date,
  add column graded        boolean not null default true;

-- Studiengang, Startsemester, Semesterzeiten: eine JSON-Zeile je Nutzer, die App liest und prüft den Inhalt selbst
create table public.study_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 20000),
  updated_at timestamptz not null default now()
);

-- Ergebnisse einer Prüfung (ein Versuch je Zeile)
create table public.module_results (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  subject_id text not null references public.subjects(id) on delete cascade,
  exam_id    text references public.exams(id) on delete set null,
  grade      numeric(2, 1) check (grade is null or grade between 1 and 5),
  passed     boolean,
  attempt    smallint not null default 1 check (attempt between 1 and 9),
  ects       numeric(4, 1) not null check (ects >= 0 and ects <= 60),
  weight     numeric(4, 1) not null check (weight >= 0 and weight <= 60),
  date       date not null,
  title      text not null default '' check (char_length(title) <= 120),
  created_at timestamptz not null default now()
);
create index on public.module_results (user_id, subject_id);

create table public.deadlines (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  date        date not null,
  kind        text not null default 'other' check (kind in ('reregister', 'exam_register', 'exam_withdraw', 'bafoeg', 'submission', 'other')),
  done        boolean not null default false,
  remind_days smallint not null default 7 check (remind_days between 0 and 60),
  created_at  timestamptz not null default now()
);
create index on public.deadlines (user_id, date);

-- Stundenplan: wiederkehrende Termine (weekday gesetzt) oder einzelne (date gesetzt), Zeiten als Minuten seit Mitternacht
create table public.events (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  subject_id text references public.subjects(id) on delete set null,
  kind       text not null default 'lecture' check (kind in ('lecture', 'exercise', 'seminar', 'tutorial', 'lab', 'other', 'blocked')),
  title      text not null default '' check (char_length(title) <= 160),
  room       text not null default '' check (char_length(room) <= 120),
  lecturer   text not null default '' check (char_length(lecturer) <= 120),
  weekday    smallint check (weekday is null or weekday between 0 and 6),
  date       date,
  start_min  smallint not null check (start_min between 0 and 1439),
  end_min    smallint not null check (end_min between 1 and 1440),
  every      smallint not null default 1 check (every in (1, 2)),
  valid_from date,
  valid_to   date,
  skipped    text[] not null default '{}' check (cardinality(skipped) <= 400),
  uid        text check (uid is null or char_length(uid) <= 300),
  created_at timestamptz not null default now(),
  check (end_min > start_min),
  check (weekday is not null or date is not null)
);
create index on public.events (user_id);
create index on public.events (subject_id);
create index on public.module_results (subject_id);

alter table public.study_settings enable row level security;
alter table public.module_results enable row level security;
alter table public.deadlines      enable row level security;
alter table public.events         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['study_settings', 'module_results', 'deadlines', 'events']
  loop
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    -- Nur freigegebene Konten schreiben
    execute format('create policy "nur aktive Konten anlegen" on public.%I as restrictive for insert to authenticated with check (public.is_active())', t);
    execute format('create policy "nur aktive Konten ändern" on public.%I as restrictive for update to authenticated using (public.is_active()) with check (public.is_active())', t);
  end loop;
end $$;

-- Verknüpfungen nur mit eigenen Modulen und Prüfungen
create policy "eigene Verknüpfung anlegen" on public.module_results as restrictive for insert to authenticated
  with check (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid()))
    and (exam_id is null or exists (select 1 from public.exams e where e.id = exam_id and e.user_id = (select auth.uid())))
  );
create policy "eigene Verknüpfung ändern" on public.module_results as restrictive for update to authenticated
  using (true)
  with check (
    exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid()))
    and (exam_id is null or exists (select 1 from public.exams e where e.id = exam_id and e.user_id = (select auth.uid())))
  );
create policy "eigene Verknüpfung anlegen" on public.events as restrictive for insert to authenticated
  with check (subject_id is null or exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid())));
create policy "eigene Verknüpfung ändern" on public.events as restrictive for update to authenticated
  using (true)
  with check (subject_id is null or exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid())));

-- Höchstens 600 Termine, 400 Ergebnisse und 200 Fristen je Konto
create or replace function public.study_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare cap int;
begin
  cap := case tg_table_name when 'events' then 600 when 'module_results' then 400 else 200 end;
  -- ein Upsert auf eine vorhandene Zeile ist keine neue
  if exists (select 1 from public.events where tg_table_name = 'events' and id = new.id)
     or exists (select 1 from public.module_results where tg_table_name = 'module_results' and id = new.id)
     or exists (select 1 from public.deadlines where tg_table_name = 'deadlines' and id = new.id) then
    return new;
  end if;
  if tg_table_name = 'events' and (select count(*) from public.events where user_id = new.user_id) >= cap then
    raise exception 'Zu viele Termine';
  elsif tg_table_name = 'module_results' and (select count(*) from public.module_results where user_id = new.user_id) >= cap then
    raise exception 'Zu viele Ergebnisse';
  elsif tg_table_name = 'deadlines' and (select count(*) from public.deadlines where user_id = new.user_id) >= cap then
    raise exception 'Zu viele Fristen';
  end if;
  return new;
end $$;
revoke all on function public.study_limit() from public, anon, authenticated;
create trigger study_limit before insert on public.events         for each row execute function public.study_limit();
create trigger study_limit before insert on public.module_results for each row execute function public.study_limit();
create trigger study_limit before insert on public.deadlines      for each row execute function public.study_limit();

-- Live auf allen Geräten
alter publication supabase_realtime add table public.study_settings;
alter publication supabase_realtime add table public.module_results;
alter publication supabase_realtime add table public.deadlines;
alter publication supabase_realtime add table public.events;
