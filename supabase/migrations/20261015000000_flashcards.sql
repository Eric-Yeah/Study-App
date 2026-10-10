-- Karteikarten (Leitner-Kästen), ohne KI. note_id merkt, aus welcher Notiz eine Karte stammt.

create table public.flashcards (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  subject_id    text references public.subjects(id) on delete set null,
  note_id       text references public.lesson_notes(id) on delete set null,
  front         text not null check (char_length(front) between 1 and 1000),
  back          text not null check (char_length(back) between 1 and 2000),
  box           integer not null default 0 check (box between 0 and 12),
  due           date not null,
  reps          integer not null default 0 check (reps >= 0),
  lapses        integer not null default 0 check (lapses >= 0),
  last_reviewed date,
  created_at    timestamptz not null default now()
);

create index on public.flashcards (user_id, due);
create index on public.flashcards (user_id, subject_id);

alter table public.flashcards enable row level security;

create policy "own rows" on public.flashcards for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (subject_id is null or exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid())))
    and (note_id is null or exists (select 1 from public.lesson_notes n where n.id = note_id and n.user_id = (select auth.uid())))
  );

-- Live auf allen Geräten
alter publication supabase_realtime add table public.flashcards;
