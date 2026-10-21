-- Indizes auf den Fremdschlüsseln von grades, die beim Löschen eines Fachs oder einer Klausur geprüft werden
-- (on delete cascade / set null), wie in 20261029000000_fk_indexes.sql. Ändert keine Daten.
create index if not exists grades_subject_id_idx on public.grades (subject_id);
create index if not exists grades_exam_id_idx on public.grades (exam_id);
