-- Karteikarten: Schwierigkeit 1 bis 4 (einfach, mittel, schwer, sehr schwer). Schwere Karten kommen früher wieder.

alter table public.flashcards add column if not exists difficulty smallint not null default 2 check (difficulty between 1 and 4);
