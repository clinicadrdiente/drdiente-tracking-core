-- Esquema del agente en la nube. Aplicar en el proyecto Supabase
-- (SQL Editor) o con la CLI de Supabase.

create extension if not exists "pgcrypto";

-- Leads recibidos del workflow de salida de Elevator (ambas cuentas).
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  event_id        text unique not null,        -- idempotencia
  occurred_at     timestamptz not null,
  received_at     timestamptz not null default now(),
  account         text not null check (account in ('roma','general')),
  elevator_id     text,
  first_name      text,
  last_name       text,
  email           text,
  phone           text,
  source          text,                        -- origen
  location        text,                        -- localización del paciente
  initial_message text,                        -- mensaje inicial
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  fbclid          text,
  gclid           text,
  ttclid          text,
  landing_url     text,
  distributed_to  text[] default '{}',
  created_at      timestamptz not null default now()
);
create index if not exists leads_occurred_at_idx on public.leads (occurred_at);
create index if not exists leads_account_idx on public.leads (account);

-- Agendamientos (citas) para el conteo del reporte.
create table if not exists public.appointments (
  id             uuid primary key default gen_random_uuid(),
  event_id       text unique not null,
  occurred_at    timestamptz not null,
  account        text not null check (account in ('roma','general')),
  appointment_id text not null,
  elevator_id    text,
  patient_id     text,
  branch         text,
  scheduled_at   timestamptz,
  source         text,
  created_at     timestamptz not null default now()
);
create index if not exists appointments_occurred_at_idx on public.appointments (occurred_at);

-- Reportes diarios de recepción / plataforma SAC.
create table if not exists public.daily_reports (
  report_id    text primary key,               -- "{branch}_{date}"
  branch       text not null,
  date         date not null,
  account      text,
  submitted_at timestamptz not null default now(),
  payload      jsonb not null
);
create index if not exists daily_reports_date_idx on public.daily_reports (date);

-- Marca de envíos de reporte (idempotencia de los crons).
create table if not exists public.report_sends (
  send_key text primary key,                    -- "daily_2026-06-23" / "eod_2026-06-23"
  sent_at  timestamptz not null default now()
);
