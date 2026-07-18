-- Performance Dashboard — persistência dos relatórios semanais.
-- Substitui o antigo file store (backend/data/weekly-reports.json).
-- Rode isto no SQL Editor do projeto Supabase (ou via Supabase CLI).

create extension if not exists "pgcrypto";

create table if not exists public.weekly_reports (
  id          uuid primary key default gen_random_uuid(),
  week_code   text not null unique,
  start_date  date,
  end_date    date,
  summary     text not null default '',
  sections    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists weekly_reports_week_code_idx
  on public.weekly_reports (week_code);

-- Mantém updated_at coerente mesmo em updates diretos no banco.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists weekly_reports_set_updated_at on public.weekly_reports;
create trigger weekly_reports_set_updated_at
  before update on public.weekly_reports
  for each row
  execute function public.set_updated_at();

-- RLS ligada e SEM policies públicas: o acesso acontece apenas pelo backend,
-- que usa a service_role key (a service_role ignora RLS). Assim os dados não
-- ficam expostos via anon key no cliente.
alter table public.weekly_reports enable row level security;
