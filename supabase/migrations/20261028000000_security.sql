-- Sicherheit für mehrere Konten: Anfragegrenzen, Grenzen für Speicher und Warteschlange.
-- * rate_limits / rate_hit: zählt Aufrufe je Schlüssel in einem Zeitfenster (Lanis-Abruf je Konto, Overload-Sendungen je Verbindung).
--   Nur service_role.
-- * Speicher: höchstens so viele Dateien je Konto und Speicher (worksheets 3000, documents 1000, exams 300), damit ein Konto den
--   Speicher nicht vollschreiben kann.
-- * Erinnerungen: höchstens 60 offene Mitteilungen je Gerät.
-- * Overload-Verbindungen: höchstens 5 je Konto.

create table public.rate_limits (
  key          text primary key check (char_length(key) <= 120),
  window_start timestamptz not null default now(),
  hits         integer not null default 0
);
alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;

-- true: Aufruf erlaubt (und gezählt), false: Grenze erreicht
create or replace function public.rate_hit(p_key text, p_max integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into n;
  delete from public.rate_limits where window_start < now() - interval '2 days';
  return n <= p_max;
end $$;
revoke all on function public.rate_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_hit(text, integer, integer) to service_role;

-- Dateien eines Kontos in einem Speicher zählen (für die Grenze, ohne die Policies von storage.objects erneut zu durchlaufen)
create or replace function public.my_object_count(p_bucket text) returns integer
language sql stable security definer set search_path = public, storage as $$
  select count(*)::integer from storage.objects
   where bucket_id = p_bucket and (storage.foldername(name))[1] = (select auth.uid())::text;
$$;
revoke all on function public.my_object_count(text) from public, anon;
grant execute on function public.my_object_count(text) to authenticated;

drop policy if exists "Grenze je Konto" on storage.objects;
create policy "Grenze je Konto" on storage.objects as restrictive for insert to authenticated
  with check (
    case bucket_id
      when 'worksheets' then public.my_object_count('worksheets') < 3000
      when 'documents' then public.my_object_count('documents') < 1000
      when 'exams' then public.my_object_count('exams') < 300
      else true
    end
  );

-- Höchstens 60 offene Mitteilungen je Gerät
create or replace function public.push_queue_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.push_queue where sub_id = new.sub_id and sent_at is null) >= 60 then
    raise exception 'Zu viele offene Mitteilungen für dieses Gerät';
  end if;
  return new;
end $$;
revoke all on function public.push_queue_limit() from public, anon, authenticated;
drop trigger if exists push_queue_limit on public.push_queue;
create trigger push_queue_limit before insert on public.push_queue for each row execute function public.push_queue_limit();

-- Höchstens 5 Overload-Verbindungen je Konto
create or replace function public.my_fitness_links() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.fitness_links where user_id = (select auth.uid());
$$;
revoke all on function public.my_fitness_links() from public, anon;
grant execute on function public.my_fitness_links() to authenticated;
drop policy if exists "höchstens 5" on public.fitness_links;
create policy "höchstens 5" on public.fitness_links as restrictive for insert to authenticated with check (public.my_fitness_links() < 5);
