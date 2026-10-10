-- Konten für Freunde: Freigabe, Rollen, KI-Funktionen pro Konto, gemeinsames Budget der Freunde, Sperre fürs Admin-Protokoll.
-- * accounts: ein Eintrag je Konto (legt ein Trigger bei der Registrierung an). Neue Konten warten ("pending"), bis der Admin sie im
--   Admin-Protokoll freigibt. Nur der Server schreibt (Edge Function admin-log), jeder liest seine eigene Zeile.
-- * app_settings: Budget der Freunde (gemeinsamer Topf) und Tageslimit für KI-Karten, nur service_role.
-- * admin_attempts: Fehlversuche beim Passwort des Admin-Protokolls (Sperre), nur service_role.
-- * ai_inflight: höchstens eine laufende KI-Anfrage je Konto, damit gleichzeitige Anfragen das Budget nicht überholen.
-- * Nur freigegebene Konten dürfen Daten anlegen oder ändern (zusätzliche, einschränkende Policies), auch Dateien im Speicher.
-- * Fremde Fächer und Klausuren lassen sich nicht mehr verknüpfen (Prüfung beim Anlegen).

create table public.accounts (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'active', 'blocked')),
  is_admin    boolean not null default false,
  ai_features text[] not null default '{}' check (ai_features <@ array['summarize', 'cards', 'correct', 'practice', 'topics', 'style']::text[]),
  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  updated_at  timestamptz not null default now()
);
alter table public.accounts enable row level security;
create policy "own row" on public.accounts for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on table public.accounts from anon, authenticated;

-- Neues Konto: wartet auf Freigabe
create or replace function public.handle_new_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.accounts (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_account() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_account on auth.users;
create trigger on_auth_user_created_account after insert on auth.users for each row execute function public.handle_new_account();

-- Bestehende Konten: alle warten, das Konto des Admins ist aktiv mit allen Funktionen
insert into public.accounts (user_id) select id from auth.users on conflict (user_id) do nothing;
update public.accounts
   set status = 'active', is_admin = true, approved_at = now(), updated_at = now(),
       ai_features = array['summarize', 'cards', 'correct', 'practice', 'topics', 'style']::text[]
 where user_id = '6c2b1f16-0ae6-4c56-b257-95e8d2338656';

-- Ist das angemeldete Konto freigegeben? (für die Policies, ohne dass jemand fremde Zeilen sieht)
create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.accounts where user_id = (select auth.uid()) and status = 'active');
$$;
revoke all on function public.is_active() from public, anon;
grant execute on function public.is_active() to authenticated;

-- Einstellungen des Admins
create table public.app_settings (
  id                 integer primary key default 1 check (id = 1),
  friends_budget_usd numeric(8, 2) not null default 3 check (friends_budget_usd between 0 and 100),
  cards_daily_limit  integer not null default 30 check (cards_daily_limit between 0 and 1000),
  updated_at         timestamptz not null default now()
);
alter table public.app_settings enable row level security;
revoke all on table public.app_settings from anon, authenticated;
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

create table public.admin_attempts (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  failed       integer not null default 0,
  locked_until timestamptz
);
alter table public.admin_attempts enable row level security;
revoke all on table public.admin_attempts from anon, authenticated;

create table public.ai_inflight (
  user_id uuid primary key references auth.users(id) on delete cascade,
  since   timestamptz not null default now()
);
alter table public.ai_inflight enable row level security;
revoke all on table public.ai_inflight from anon, authenticated;

-- Eine laufende Anfrage je Konto. Eine hängende gilt nach 3 Minuten als beendet (Functions brechen nach etwa 150 s ab).
create or replace function public.ai_begin(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare got boolean;
begin
  insert into public.ai_inflight (user_id, since) values (p_user, now())
  on conflict (user_id) do update set since = now() where public.ai_inflight.since < now() - interval '3 minutes'
  returning true into got;
  return coalesce(got, false);
end $$;
create or replace function public.ai_end(p_user uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.ai_inflight where user_id = p_user;
$$;
revoke all on function public.ai_begin(uuid), public.ai_end(uuid) from public, anon, authenticated;
grant execute on function public.ai_begin(uuid), public.ai_end(uuid) to service_role;

-- Nur freigegebene Konten schreiben (einschränkende Policy zusätzlich zu "own rows")
do $$
declare t text;
begin
  foreach t in array array['profiles', 'subjects', 'exams', 'plan_settings', 'timer_settings', 'timer_state', 'focus_sessions', 'tasks',
    'daily_checkins', 'fitness_links', 'day_overrides', 'exam_topics', 'lanis_snapshots', 'lesson_notes', 'worksheet_files', 'flashcards',
    'exam_reviews', 'exam_files', 'subject_rubrics', 'practice_exams', 'abitur_plans', 'task_styles', 'push_subs', 'push_queue']
  loop
    execute format('drop policy if exists "nur aktive Konten anlegen" on public.%I', t);
    execute format('drop policy if exists "nur aktive Konten ändern" on public.%I', t);
    execute format('create policy "nur aktive Konten anlegen" on public.%I as restrictive for insert to authenticated with check (public.is_active())', t);
    execute format('create policy "nur aktive Konten ändern" on public.%I as restrictive for update to authenticated using (public.is_active()) with check (public.is_active())', t);
  end loop;
end $$;

drop policy if exists "nur aktive Konten laden hoch" on storage.objects;
create policy "nur aktive Konten laden hoch" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id not in ('worksheets', 'documents', 'exams') or public.is_active());

-- Verknüpfungen nur mit eigenen Fächern und Klausuren (beim Anlegen und Ändern)
do $$
declare
  r record;
begin
  for r in select * from (values
    ('exams', 'exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid()))'),
    ('focus_sessions', 'subject_id is null or exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid()))'),
    ('tasks', 'subject_id is null or exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid()))'),
    ('lesson_notes', 'subject_id is null or exists (select 1 from public.subjects s where s.id = subject_id and s.user_id = (select auth.uid()))'),
    ('exam_topics', 'exists (select 1 from public.exams e where e.id = exam_id and e.user_id = (select auth.uid()))')
  ) as v(tbl, chk)
  loop
    execute format('drop policy if exists "eigene Verknüpfung anlegen" on public.%I', r.tbl);
    execute format('drop policy if exists "eigene Verknüpfung ändern" on public.%I', r.tbl);
    execute format('create policy "eigene Verknüpfung anlegen" on public.%I as restrictive for insert to authenticated with check (%s)', r.tbl, r.chk);
    execute format('create policy "eigene Verknüpfung ändern" on public.%I as restrictive for update to authenticated using (true) with check (%s)', r.tbl, r.chk);
  end loop;
end $$;

-- Protokoll: Freigabe erscheint sofort auf allen Geräten
alter publication supabase_realtime add table public.accounts;

-- Zahlen je Konto für das Admin-Protokoll (keine Inhalte), nur service_role
create or replace function public.admin_account_stats(p_month text) returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
    'confirmed', u.email_confirmed_at is not null,
    'name', (select p.name from public.profiles p where p.user_id = u.id),
    'status', a.status, 'is_admin', a.is_admin, 'ai_features', to_jsonb(a.ai_features), 'approved_at', a.approved_at,
    'subjects', (select count(*) from public.subjects x where x.user_id = u.id),
    'exams', (select count(*) from public.exams x where x.user_id = u.id),
    'notes', (select count(*) from public.lesson_notes x where x.user_id = u.id),
    'cards', (select count(*) from public.flashcards x where x.user_id = u.id),
    'reviews', (select count(*) from public.exam_reviews x where x.user_id = u.id),
    'practice', (select count(*) from public.practice_exams x where x.user_id = u.id),
    'sessions', (select count(*) from public.focus_sessions x where x.user_id = u.id),
    'usage', (select coalesce(jsonb_agg(jsonb_build_object('model', g.model, 'requests', g.requests, 'input_tokens', g.input_tokens, 'output_tokens', g.output_tokens)), '[]'::jsonb)
              from public.ai_usage g where g.user_id = u.id and g.month = p_month)
  ) order by u.created_at), '[]'::jsonb)
  from auth.users u left join public.accounts a on a.user_id = u.id;
$$;
revoke all on function public.admin_account_stats(text) from public, anon, authenticated;
grant execute on function public.admin_account_stats(text) to service_role;
