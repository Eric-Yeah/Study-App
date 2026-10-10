-- Stil der echten Aufgabenblätter: pro Fach und Lehrkraft ein oder mehrere gelernte Blätter. Der Nutzer sieht und ändert sie,
-- generate-exam nutzt sie im Prompt der Übungsklausur. Die hochgeladenen Seiten werden nach dem Lernen gelöscht.

create table public.task_styles (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  subject_id text not null references public.subjects(id) on delete cascade,
  teacher    text not null default '' check (char_length(teacher) <= 60),
  title      text not null default '' check (char_length(title) <= 120),
  style      jsonb not null check (jsonb_typeof(style) = 'object' and pg_column_size(style) <= 12000),
  edited     boolean not null default false,
  created_at timestamptz not null default now()
);

create index on public.task_styles (user_id, subject_id, created_at desc);

alter table public.task_styles enable row level security;

create policy "own rows" on public.task_styles for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid()))
  );

-- Protokoll: neue Art der KI-Anfrage
alter table public.ai_log drop constraint if exists ai_log_kind_check;
alter table public.ai_log add constraint ai_log_kind_check check (kind in ('summarize', 'cards', 'exam', 'exam_learn', 'practice', 'topics', 'style'));

-- Live auf allen Geräten
alter publication supabase_realtime add table public.task_styles;
