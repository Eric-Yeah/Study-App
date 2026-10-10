-- Herkunft importierter Klausuren (Lanis-Id), damit ein erneuter Import nichts doppelt anlegt.
alter table public.exams add column external_id text;
create unique index exams_user_external_id on public.exams (user_id, external_id) where external_id is not null;
