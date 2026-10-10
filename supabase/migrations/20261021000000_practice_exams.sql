-- Übungsklausuren: von der KI erstellte Klausuren mit Erwartungshorizont, Rückmeldung zur Schwierigkeit und Verknüpfung mit der
-- Korrektur der Lösung. Das PDF entsteht im Browser aus dem gespeicherten Inhalt, es liegt nichts im Speicher.

create table public.practice_exams (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  subject_id   text references public.subjects(id) on delete set null,
  title        text not null default '' check (char_length(title) <= 200),
  difficulty   text not null check (difficulty in ('leicht', 'mittel', 'schwer')),
  teacher      text not null default '' check (char_length(teacher) <= 60),
  quarter      text check (quarter in ('Q1', 'Q2', 'Q3', 'Q4')),
  note_ids     jsonb not null default '[]'::jsonb check (jsonb_typeof(note_ids) = 'array'),
  topic        text not null default '' check (char_length(topic) <= 400),
  duration_min integer not null default 90 check (duration_min between 20 and 300),
  content      jsonb not null, -- Material, Aufgaben, Erwartungshorizont (PracticeContent)
  meta         jsonb not null default '{}'::jsonb, -- womit erstellt: Vorbild, Verschiebung, Zielmischung
  rating       smallint check (rating in (-1, 0, 1)), -- -1 zu leicht, 0 passend, 1 zu schwer
  created_at   timestamptz not null default now()
);

create index on public.practice_exams (user_id, subject_id, created_at desc);

alter table public.practice_exams enable row level security;

create policy "own rows" on public.practice_exams for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (subject_id is null or exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid())))
  );

-- Korrektur: gehört zu einer Übungsklausur (dann kein echtes Vorbild für das Profil), und der Erwartungshorizont darf länger sein
alter table public.exam_reviews add column practice_id text references public.practice_exams(id) on delete set null;
alter table public.exam_reviews drop constraint if exists exam_reviews_horizon_text_check;
alter table public.exam_reviews add constraint exam_reviews_horizon_text_check check (char_length(horizon_text) <= 12000);

drop policy "own rows" on public.exam_reviews;
create policy "own rows" on public.exam_reviews for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (subject_id is null or exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid())))
    and (exam_id is null or exists (select 1 from public.exams e where e.id = exam_id and e.user_id = (select auth.uid())))
    and (practice_id is null or exists (select 1 from public.practice_exams p where p.id = practice_id and p.user_id = (select auth.uid())))
  );

-- Protokoll: neue Art der KI-Anfrage
alter table public.ai_log drop constraint if exists ai_log_kind_check;
alter table public.ai_log add constraint ai_log_kind_check check (kind in ('summarize', 'cards', 'exam', 'exam_learn', 'practice'));

-- Live auf allen Geräten
alter publication supabase_realtime add table public.practice_exams;
