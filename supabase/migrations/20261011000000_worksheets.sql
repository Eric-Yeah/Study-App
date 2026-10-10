-- Arbeitsblätter zusammenfassen: Notizen pro Fach, hochgeladene Bilder, KI-Verbrauch.

create table public.lesson_notes (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  subject_id  text references public.subjects(id) on delete set null,
  lesson_date date not null,
  title       text not null default '',
  summary     jsonb,
  legibility  text check (legibility in ('sicher', 'unsicher')),
  effort      text check (effort in ('low', 'medium', 'high')),
  created_at  timestamptz not null default now()
);

create table public.worksheet_files (
  id             uuid primary key default gen_random_uuid(),
  lesson_note_id text not null references public.lesson_notes(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  storage_path   text not null unique,
  created_at     timestamptz not null default now()
);

create table public.ai_usage (
  user_id       uuid not null references auth.users(id) on delete cascade,
  month         text not null check (month ~ '^\d{4}-\d{2}$'), -- JJJJ-MM
  requests      integer not null default 0,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (user_id, month)
);

create index on public.lesson_notes (user_id, subject_id, lesson_date desc);
create index on public.worksheet_files (lesson_note_id);

alter table public.lesson_notes    enable row level security;
alter table public.worksheet_files enable row level security;
alter table public.ai_usage        enable row level security;

create policy "own rows" on public.lesson_notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Dateien nur für eigene Notizen eintragen
create policy "own rows" on public.worksheet_files for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.lesson_notes n where n.id = lesson_note_id and n.user_id = (select auth.uid()))
  );

-- ai_usage: Nutzer dürfen nur lesen. Gezählt wird von der Edge Function über ai_usage_add (service_role).
create policy "read own" on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.ai_usage_add(p_user uuid, p_month text, p_input integer, p_output integer)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage as u (user_id, month, requests, input_tokens, output_tokens)
  values (p_user, p_month, 1, greatest(p_input, 0), greatest(p_output, 0))
  on conflict (user_id, month) do update
    set requests = u.requests + 1,
        input_tokens = u.input_tokens + greatest(p_input, 0),
        output_tokens = u.output_tokens + greatest(p_output, 0);
$$;

revoke all on function public.ai_usage_add(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_usage_add(uuid, text, integer, integer) to service_role;

-- Privater Speicher für die verkleinerten Blätter, Pfad {user_id}/{uuid}.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('worksheets', 'worksheets', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "worksheets: eigener Ordner lesen" on storage.objects for select to authenticated
  using (bucket_id = 'worksheets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "worksheets: eigener Ordner hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'worksheets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "worksheets: eigener Ordner löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'worksheets' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Notizen live auf allen Geräten
alter publication supabase_realtime add table public.lesson_notes;
