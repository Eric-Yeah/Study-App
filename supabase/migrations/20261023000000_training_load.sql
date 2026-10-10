-- Belastung aus Overload (Dauer mal Anstrengung, 7:28-Verhältnis) und Anstrengung von Hand im Check-in.
-- Alle Spalten sind frei (null), damit ältere Versionen von Overload weiter funktionieren.

alter table public.fitness_daily
  add column if not exists load         integer  check (load between 0 and 5000),   -- Punkte des Tages: Summe aus Minuten mal Anstrengung
  add column if not exists rpe          real     check (rpe between 1 and 10),      -- Anstrengung 1 bis 10, nach Minuten gewichtet
  add column if not exists rpe_set      boolean,                                    -- true: vom Nutzer eingestellt, false: von Overload geschätzt
  add column if not exists acute_load   real     check (acute_load between 0 and 5000),   -- 7-Tage-Mittel (EWMA) in Punkten pro Tag
  add column if not exists chronic_load real     check (chronic_load between 0 and 5000), -- 28-Tage-Mittel (EWMA) in Punkten pro Tag
  add column if not exists load_ready   boolean;                                    -- genug Daten für das Verhältnis (ab etwa 14 Tagen)

alter table public.daily_checkins
  add column if not exists training_rpe smallint check (training_rpe between 1 and 10);  -- Anstrengung von Hand
