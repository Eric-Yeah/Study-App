-- Erinnerungen: Takt einmal pro Minute statt alle 10 Sekunden, und das Protokoll von pg_cron aufräumen.
-- * pg_cron schreibt jeden Lauf in cron.job_run_details, auch wenn nichts fällig ist, und löscht dort nichts von selbst.
--   Bei einem Lauf alle 10 Sekunden waren das 8.640 Zeilen am Tag (grob 130 bis 250 MB Datenbank im Monat).
-- * Die Mitteilungen kommen zu festen Minuten (Tagesplan 7:00, Klausur naht und Rückstand 18:00), eine Minute Takt reicht:
--   Eine Mitteilung kommt höchstens etwa 60 Sekunden später. Das sind 1.440 Läufe am Tag.
-- * Täglich um 3:17 Uhr (UTC) löscht ein zweiter Job alle Einträge im Protokoll, die älter als einen Tag sind.
-- Beide Jobs werden vorher entfernt, die Migration lässt sich gefahrlos noch einmal ausführen. Enthält kein Passwort und keinen Schlüssel.

-- Takt: einmal pro Minute, ruft die Edge Function nur auf, wenn etwas fällig ist (sonst wie in 20261026000000_push.sql)
do $$ begin perform cron.unschedule('study-push-tick'); exception when others then null; end $$;
select cron.schedule('study-push-tick', '* * * * *', $job$
  select net.http_post(
    url := 'https://mhyunfeirajnmbrpdojm.supabase.co/functions/v1/push-send',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('op', 'tick', 'token', (select token from public.push_keys where id = 1)),
    timeout_milliseconds := 8000)
  where exists (select 1 from public.push_queue where sent_at is null and due_at <= now())
$job$);

-- Aufräumen: Protokoll der Cron-Läufe nur einen Tag behalten
do $$ begin perform cron.unschedule('study-cron-cleanup'); exception when others then null; end $$;
select cron.schedule('study-cron-cleanup', '17 3 * * *', $job$
  delete from cron.job_run_details where end_time < now() - interval '1 day'
$job$);
