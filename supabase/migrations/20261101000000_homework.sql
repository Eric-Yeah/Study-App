-- Hausaufgaben und Anhänge aus den Kursmappen in Lanis ("Mein Unterricht").
-- Stand der Einträge als weiterer Snapshot, Aufgaben und Notizen merken sich ihre Herkunft.

alter table public.lanis_snapshots drop constraint if exists lanis_snapshots_kind_check;
alter table public.lanis_snapshots add constraint lanis_snapshots_kind_check check (kind in ('timetable', 'substitutions', 'absences', 'homework'));

-- Aufgabe aus einer Hausaufgabe: Schlüssel KURS:EINTRAG, je Nutzer höchstens eine Aufgabe pro Hausaufgabe
alter table public.tasks add column if not exists external_id text check (external_id is null or length(external_id) <= 60);
create unique index if not exists tasks_user_external_idx on public.tasks (user_id, external_id) where external_id is not null;

-- Anhänge aus Lanis, die in einer Notiz stehen (KURS:EINTRAG:Dateiname), damit die App weiß, was schon übernommen wurde
alter table public.lesson_notes add column if not exists lanis_keys text[] not null default '{}';
