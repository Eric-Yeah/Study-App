-- Geräte koppeln: Änderungen an allen Tabellen live an andere Geräte melden (Supabase Realtime).
-- timer_state ist schon in der Veröffentlichung. Die Row-Level-Security-Regeln gelten auch für Realtime.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'subjects', 'exams', 'plan_settings', 'timer_settings', 'focus_sessions', 'tasks',
    'daily_checkins', 'day_overrides', 'exam_topics', 'lanis_snapshots', 'fitness_daily'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
