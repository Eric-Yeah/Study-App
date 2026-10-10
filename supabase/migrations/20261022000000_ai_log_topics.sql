-- Themenliste aus Notizen vorschlagen: neue Art der KI-Anfrage im Protokoll
alter table public.ai_log drop constraint if exists ai_log_kind_check;
alter table public.ai_log add constraint ai_log_kind_check check (kind in ('summarize', 'cards', 'exam', 'exam_learn', 'practice', 'topics'));
