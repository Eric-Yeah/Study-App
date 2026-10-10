-- Arbeitsblätter: Hashes der hochgeladenen Dateien, damit dieselbe Datei nicht noch einmal zusammengefasst (und bezahlt) wird.
-- Die App prüft vor dem Hochladen gegen die Hashes der vorhandenen Notizen. Alte Notizen haben eine leere Liste.

alter table public.lesson_notes add column if not exists file_hashes text[] not null default '{}';
