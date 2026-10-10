-- Unterrichtssprache eines Fachs: bestimmt die Sprache der KI-Zusammenfassungen und KI-Karten
-- (Englisch für Englisch und bilinguale Fächer wie Bio Bili, Französisch, Spanisch, Latein, ...).

alter table public.subjects
  add column if not exists language text not null default 'de'
  check (language in ('de', 'en', 'fr', 'es', 'la', 'it', 'ru', 'tr'));

-- Bestehende Fächer nach dem Namen vorbelegen (wie defaultLanguageFor in der App), der Nutzer kann es ändern
update public.subjects set language = case
  when lower(name) ~ '(^|[^a-zäöüß])(bili|bilingual|bilingue?)([^a-zäöüß]|$)' or lower(name) like '%(englisch)%' then 'en'
  when lower(trim(name)) ~ '^(englisch|english)([^a-zäöüß]|$)' then 'en'
  when lower(trim(name)) ~ '^(französisch|franzoesisch|french)([^a-zäöüß]|$)' then 'fr'
  when lower(trim(name)) ~ '^(spanisch|spanish)([^a-zäöüß]|$)' then 'es'
  when lower(trim(name)) ~ '^latein' then 'la'
  when lower(trim(name)) ~ '^(italienisch|italian)([^a-zäöüß]|$)' then 'it'
  when lower(trim(name)) ~ '^(russisch|russian)([^a-zäöüß]|$)' then 'ru'
  when lower(trim(name)) ~ '^(türkisch|tuerkisch|turkish)([^a-zäöüß]|$)' then 'tr'
  else 'de'
end
where language = 'de';
