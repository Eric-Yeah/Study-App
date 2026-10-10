-- Klausurenkorrektur: korrigierte Klausuren, ihre Seiten im privaten Speicher "exams" und das Korrekturmuster pro Fach
-- (Vorgaben der Lehrkraft und Erfahrungen aus früheren Klausuren). Die KI schreibt nichts direkt, die App speichert das Ergebnis.

create table public.exam_reviews (
  id             text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  subject_id     text references public.subjects(id) on delete set null,
  exam_id        text references public.exams(id) on delete set null,
  title          text not null default '' check (char_length(title) <= 200),
  exam_date      date not null,
  teacher        text not null default '' check (char_length(teacher) <= 60),
  quarter        text check (quarter in ('Q1', 'Q2', 'Q3', 'Q4')),
  max_points     numeric(6, 1) check (max_points > 0 and max_points <= 1000),
  horizon_text   text not null default '' check (char_length(horizon_text) <= 8000),
  result         jsonb, -- { main: { model, effort, at, result }, compare?: { ... } }
  teacher_points smallint check (teacher_points between 0 and 15),
  teacher_tasks  jsonb, -- [{ nr, punkte }] laut Lehrkraft
  learned_at     timestamptz, -- Erfahrungen aus der Korrektur der Lehrkraft übernommen
  created_at     timestamptz not null default now()
);

create table public.exam_files (
  id           uuid primary key default gen_random_uuid(),
  review_id    text not null references public.exam_reviews(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  role         text not null check (role in ('aufgabe', 'loesung', 'erwartung', 'korrigiert')),
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

create table public.subject_rubrics (
  user_id      uuid not null references auth.users(id) on delete cascade,
  subject_id   text not null references public.subjects(id) on delete cascade,
  teacher_text text not null default '' check (char_length(teacher_text) <= 6000),
  lessons      jsonb not null default '[]'::jsonb check (jsonb_typeof(lessons) = 'array'),
  updated_at   timestamptz not null default now(),
  primary key (user_id, subject_id)
);

create index on public.exam_reviews (user_id, subject_id, exam_date desc);
create index on public.exam_files (review_id);

alter table public.exam_reviews    enable row level security;
alter table public.exam_files      enable row level security;
alter table public.subject_rubrics enable row level security;

create policy "own rows" on public.exam_reviews for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (subject_id is null or exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid())))
    and (exam_id is null or exists (select 1 from public.exams e where e.id = exam_id and e.user_id = (select auth.uid())))
  );

-- Dateien nur für eigene Korrekturen eintragen
create policy "own rows" on public.exam_files for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.exam_reviews r where r.id = review_id and r.user_id = (select auth.uid()))
  );

create policy "own rows" on public.subject_rubrics for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid()))
  );

-- Privater Speicher für die verkleinerten Seiten, Pfad {user_id}/{uuid}.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exams', 'exams', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "exams: eigener Ordner lesen" on storage.objects for select to authenticated
  using (bucket_id = 'exams' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "exams: eigener Ordner hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'exams' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "exams: eigener Ordner löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'exams' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Protokoll: neue Arten der KI-Anfrage
alter table public.ai_log drop constraint if exists ai_log_kind_check;
alter table public.ai_log add constraint ai_log_kind_check check (kind in ('summarize', 'cards', 'exam', 'exam_learn'));

-- Live auf allen Geräten
alter publication supabase_realtime add table public.exam_reviews;
alter publication supabase_realtime add table public.subject_rubrics;
