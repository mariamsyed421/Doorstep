-- Doorstep Supabase schema (reference).
--
-- Per AGENTS.md, Lovable manages this project's database: do NOT copy this into
-- supabase/migrations by hand. Ask Lovable ("apply docs/supabase-schema.sql") or run it in a
-- user-managed Supabase project's SQL editor. All resident data is SYNTHETIC.

create table if not exists public.residents (
  id text primary key,                         -- synthetic id, e.g. '412'
  name text not null,
  lat double precision not null,               -- synthetic coordinates only
  lng double precision not null,
  preferred_language text not null,
  contact_channels text[] not null default '{sms,voice}',
  phone text,                                  -- synthetic 555-01xx
  household_size int not null default 1,
  lives_alone boolean not null default false,
  needs jsonb not null default '{}'::jsonb,    -- powerDependentEquipment, mobility, transportation, ...
  emergency_contacts jsonb not null default '[]'::jsonb,
  preparedness_plan text,                      -- home | family | shelter | null
  plan_detail text,
  insurance jsonb,                             -- voluntary; never used for scoring
  consent jsonb not null default '{}'::jsonb,  -- automatedMessages, voiceCalls, contactEmergencyContact, ...
  created_at timestamptz not null default now()
);
grant select on public.residents to authenticated;
grant all on public.residents to service_role;

create table if not exists public.incidents (
  id text primary key,
  disaster_type text not null,
  area text not null,
  started_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('pending','active','closed'))
);
grant select on public.incidents to authenticated;
grant all on public.incidents to service_role;

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  resident_id text not null references public.residents(id),
  incident_id text not null references public.incidents(id),
  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  channel text not null check (channel in ('sms','voice')),
  stage int,
  message text,
  delivery_status text,                        -- queued | delivered | failed
  provider text,                               -- mock | photon
  reply text,
  classification jsonb,                        -- validated ClassificationResult
  idempotency_key text unique,
  created_at timestamptz not null default now()
);
grant select on public.check_ins to authenticated;
grant all on public.check_ins to service_role;

create table if not exists public.priority_assessments (
  resident_id text not null references public.residents(id),
  incident_id text not null references public.incidents(id),
  score int not null,
  level text not null,
  factors jsonb not null,
  explanation text not null,
  recommended_action text not null,
  evidence text[] not null,
  confidence text not null,
  updated_at timestamptz not null default now(),
  primary key (resident_id, incident_id)
);
grant select on public.priority_assessments to authenticated;
grant all on public.priority_assessments to service_role;

create table if not exists public.escalation_events (
  id uuid primary key default gen_random_uuid(),
  resident_id text not null references public.residents(id),
  incident_id text not null references public.incidents(id),
  stage int not null check (stage between 0 and 5),
  label text not null,
  approved_by text,                            -- required for stages 3-5
  approved_at timestamptz,
  delivery_status text,
  idempotency_key text unique,                 -- prevents duplicate escalation actions
  created_at timestamptz not null default now(),
  constraint third_party_needs_approval check (stage < 3 or approved_by is not null)
);
grant select on public.escalation_events to authenticated;
grant all on public.escalation_events to service_role;

create table if not exists public.outage_events (
  id text primary key,
  outage_type text not null check (outage_type in ('power','communications')),
  source text not null,                        -- e.g. 'Simulated Ting sensor feed'
  simulated boolean not null default true,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_m int not null,
  severity text,
  estimated_households int,
  confidence real,
  detected_at timestamptz not null default now(),
  active boolean not null default true
);
grant select on public.outage_events to anon, authenticated;
grant all on public.outage_events to service_role;

create table if not exists public.resources (
  id text primary key,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  status text,
  accessible boolean,
  generator boolean,
  pets boolean,
  capacity int,
  population int,
  source text not null,                        -- 'FEMA NSS' | 'Synthetic demo data'
  updated_at timestamptz
);
grant select on public.resources to anon, authenticated;
grant all on public.resources to service_role;

-- Row-level security: no anonymous access to resident data. The server routes use the
-- service-role key (bypasses RLS); authenticated coordinators may read.
alter table public.residents enable row level security;
alter table public.incidents enable row level security;
alter table public.check_ins enable row level security;
alter table public.priority_assessments enable row level security;
alter table public.escalation_events enable row level security;
alter table public.outage_events enable row level security;
alter table public.resources enable row level security;

create policy "coordinators read residents" on public.residents for select to authenticated using (true);
create policy "coordinators read incidents" on public.incidents for select to authenticated using (true);
create policy "coordinators read check_ins" on public.check_ins for select to authenticated using (true);
create policy "coordinators read assessments" on public.priority_assessments for select to authenticated using (true);
create policy "coordinators read escalations" on public.escalation_events for select to authenticated using (true);
create policy "anyone reads outages" on public.outage_events for select using (true);
create policy "anyone reads resources" on public.resources for select using (true);

-- Realtime for status updates.
alter publication supabase_realtime add table public.check_ins, public.priority_assessments,
  public.escalation_events, public.outage_events;
