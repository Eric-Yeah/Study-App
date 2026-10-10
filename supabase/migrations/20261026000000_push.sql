-- Erinnerungen auf dem Handy (Web-Push): Tagesplan morgens, Klausur naht und Rückstand.
-- * push_keys: Zugangsdaten der Edge Function push-send (VAPID-Schlüssel erzeugt die Function beim ersten Aufruf selbst, Token für den Takt).
--   Nur service_role, keine Policy.
-- * push_subs: pro Gerät ein Push-Abo (Adresse beim Push-Dienst von Apple, Google, Mozilla oder Microsoft, nur diese Hosts erlaubt).
-- * push_queue: die Mitteilungen mit Zeitpunkt. Die App berechnet sie aus dem Plan und ersetzt die offenen bei jeder Änderung.
-- * Takt: alle 10 Sekunden prüft pg_cron, ob etwas fällig ist, und ruft dann die Edge Function auf.
-- Enthält kein Passwort und keinen Schlüssel.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table public.push_keys (
  id    integer primary key default 1 check (id = 1),
  token text not null,
  pub   text,
  priv  jsonb
);
alter table public.push_keys enable row level security;
insert into public.push_keys (id, token) values (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

create table public.push_subs (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique check (
    char_length(endpoint) <= 1000
    and endpoint ~ '^https://([a-z0-9-]+\.push\.apple\.com|fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/'
  ),
  p256dh     text not null check (char_length(p256dh) between 20 and 200),
  auth       text not null check (char_length(auth) between 10 and 100),
  created_at timestamptz not null default now()
);

create table public.push_queue (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  sub_id     text not null references public.push_subs(id) on delete cascade,
  kind       text not null check (kind in ('plan', 'exam', 'behind', 'test')),
  title      text not null check (char_length(title) between 1 and 120),
  body       text not null default '' check (char_length(body) <= 300),
  url        text not null default '/' check (char_length(url) <= 120),
  due_at     timestamptz not null,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

create index on public.push_queue (due_at) where sent_at is null;
create index on public.push_queue (sub_id);

alter table public.push_subs  enable row level security;
alter table public.push_queue enable row level security;

create policy "own rows" on public.push_subs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own rows" on public.push_queue for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.push_subs s where s.id = sub_id and s.user_id = (select auth.uid()))
  );

-- Fällige Nachrichten holen und gleich als gesendet markieren (höchstens einmal). Alte verfallen ungesendet.
create or replace function public.push_due() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  out jsonb;
begin
  update public.push_queue set sent_at = now() where sent_at is null and due_at < now() - interval '3 hours';
  with due as (
    update public.push_queue q set sent_at = now()
    where q.sent_at is null and q.due_at <= now()
    returning q.id, q.kind, q.title, q.body, q.url, q.sub_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'kind', d.kind, 'title', d.title, 'body', d.body, 'url', d.url, 'device', s.id,
    'sub', jsonb_build_object('endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)))), '[]'::jsonb)
  into out from due d join public.push_subs s on s.id = d.sub_id;
  delete from public.push_queue where sent_at < now() - interval '2 days';
  return out;
end $$;

create or replace function public.push_gone(p_id text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_subs where id = p_id;
$$;

revoke all on function public.push_due(), public.push_gone(text) from public, anon, authenticated;
grant execute on function public.push_due(), public.push_gone(text) to service_role;

-- Takt: alle 10 Sekunden, ruft die Edge Function nur auf, wenn etwas fällig ist
do $$ begin perform cron.unschedule('study-push-tick'); exception when others then null; end $$;
select cron.schedule('study-push-tick', '10 seconds', $job$
  select net.http_post(
    url := 'https://mhyunfeirajnmbrpdojm.supabase.co/functions/v1/push-send',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('op', 'tick', 'token', (select token from public.push_keys where id = 1)),
    timeout_milliseconds := 8000)
  where exists (select 1 from public.push_queue where sent_at is null and due_at <= now())
$job$);
