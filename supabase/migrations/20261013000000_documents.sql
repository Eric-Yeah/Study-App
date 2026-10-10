-- Zusammengefügte PDF-Dokumente pro Notiz: Lehrkraft, Q-Phase und Pfad zur PDF im privaten Speicher "documents".

alter table public.lesson_notes
  add column if not exists pdf_path text,
  add column if not exists teacher  text not null default '',
  add column if not exists quarter  text check (quarter in ('Q1', 'Q2', 'Q3', 'Q4'));

-- Privater Speicher für die PDFs, Pfad {user_id}/{uuid}.pdf, höchstens 30 MB je Datei
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 31457280, array['application/pdf'])
on conflict (id) do nothing;

create policy "documents: eigener Ordner lesen" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents: eigener Ordner hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents: eigener Ordner löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
