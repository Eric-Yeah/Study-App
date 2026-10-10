-- Fächer ohne Note: points darf leer sein (noch keine Note oder bewusst nicht einbezogen).
-- Die Prüfung "points between 0 and 15" bleibt, ein leerer Wert besteht sie.

alter table public.subjects alter column points drop not null;
