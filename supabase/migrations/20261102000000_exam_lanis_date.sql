-- Selbst verlegte Klausuren haben Vorrang vor dem Lanis-Kalender.
-- lanis_date: letztes Datum der Klausur in Lanis (weicht date davon ab, hat der Nutzer sie selbst verlegt).
-- lanis_notice: Lanis-Datum, über das noch ein Hinweis aussteht; lanis_ack: Lanis-Datum, über das schon informiert wurde.

alter table public.exams add column if not exists lanis_date date;
alter table public.exams add column if not exists lanis_notice date;
alter table public.exams add column if not exists lanis_ack date;

-- Bisher wurde das Datum immer an Lanis angeglichen: für bestehende importierte Klausuren gilt das heutige Datum als Lanis-Datum
update public.exams set lanis_date = date where external_id is not null and lanis_date is null;
