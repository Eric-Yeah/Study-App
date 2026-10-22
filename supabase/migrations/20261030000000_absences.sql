-- Fehlstunden aus Lanis ("Mein Unterricht", Tabelle Anwesenheit) als weiterer Stand in lanis_snapshots.
alter table public.lanis_snapshots drop constraint if exists lanis_snapshots_kind_check;
alter table public.lanis_snapshots add constraint lanis_snapshots_kind_check check (kind in ('timetable', 'substitutions', 'absences'));
