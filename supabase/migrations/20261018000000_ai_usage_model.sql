-- KI-Verbrauch pro Modell: je Nutzer, Monat und Modell eine Zeile, damit man die Kosten pro Modell sieht.
-- Bisherige Zeilen stammen alle von claude-sonnet-5-5.

alter table public.ai_usage add column if not exists model text not null default 'claude-sonnet-5-5';

alter table public.ai_usage drop constraint if exists ai_usage_pkey;
alter table public.ai_usage add primary key (user_id, month, model);

create or replace function public.ai_usage_add(p_user uuid, p_month text, p_model text, p_input integer, p_output integer)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage as u (user_id, month, model, requests, input_tokens, output_tokens)
  values (p_user, p_month, p_model, 1, greatest(p_input, 0), greatest(p_output, 0))
  on conflict (user_id, month, model) do update
    set requests = u.requests + 1,
        input_tokens = u.input_tokens + greatest(p_input, 0),
        output_tokens = u.output_tokens + greatest(p_output, 0);
$$;

revoke all on function public.ai_usage_add(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_usage_add(uuid, text, text, integer, integer) to service_role;

-- Die alte Funktion ohne Modell bleibt als Weiterleitung, damit eine noch nicht neu deployte Edge Function weiter zählt
create or replace function public.ai_usage_add(p_user uuid, p_month text, p_input integer, p_output integer)
returns void
language sql
security definer
set search_path = public
as $$
  select public.ai_usage_add(p_user, p_month, 'claude-sonnet-5-5', p_input, p_output);
$$;

revoke all on function public.ai_usage_add(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_usage_add(uuid, text, integer, integer) to service_role;
