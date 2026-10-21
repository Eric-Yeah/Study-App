-- Indizes auf Fremdschlüsseln, die beim Löschen eines Fachs, einer Klausur oder einer Notiz geprüft werden
-- (on delete cascade / set null). Ohne sie liest Postgres dafür jedes Mal die ganze Tabelle. Ändert keine Daten.
create index if not exists tasks_subject_id_idx on public.tasks (subject_id);
create index if not exists focus_sessions_subject_id_idx on public.focus_sessions (subject_id);
create index if not exists exams_subject_id_idx on public.exams (subject_id);
create index if not exists exam_topics_exam_id_idx on public.exam_topics (exam_id);
create index if not exists flashcards_note_id_idx on public.flashcards (note_id);
create index if not exists exam_reviews_exam_id_idx on public.exam_reviews (exam_id);
create index if not exists exam_reviews_practice_id_idx on public.exam_reviews (practice_id);
create index if not exists subject_rubrics_subject_id_idx on public.subject_rubrics (subject_id);
create index if not exists task_styles_subject_id_idx on public.task_styles (subject_id);
