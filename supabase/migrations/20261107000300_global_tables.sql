-- Global (shared) tables, per-user matches and the AI job queue.

create type public.ats_kind as enum (
  'greenhouse', 'lever', 'ashby', 'smartrecruiters', 'recruitee', 'rippling',
  'personio', 'workable', 'workday', 'other', 'unknown');
create type public.coverage_status as enum ('covered', 'not_covered', 'unknown');
create type public.remote_kind as enum ('onsite', 'hybrid', 'remote', 'unknown');
create type public.job_level as enum ('internship', 'new_grad', 'experienced', 'unknown');
create type public.posting_status as enum ('new', 'seen', 'gone');
create type public.bar_verdict as enum ('beats', 'does_not_beat', 'no_bar');
create type public.match_state as enum ('new', 'saved', 'hidden', 'applied');
create type public.ai_job_kind as enum ('score_fit', 'tailor_resume', 'draft_outreach', 'parse_resume');
create type public.ai_job_status as enum ('queued', 'claimed', 'done', 'failed');
create type public.run_item_status as enum ('ok', 'failed', 'skipped');

-- Global tables ------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  aliases text[] not null default '{}',
  ats public.ats_kind not null default 'unknown',
  ats_token text,
  ats_meta jsonb not null default '{}',
  regions text[] not null default '{}',
  is_fortune500 boolean not null default false,
  industry text,
  coverage public.coverage_status not null default 'unknown',
  coverage_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.postings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies on delete set null,
  company_name text not null,
  title text not null,
  locations text[] not null default '{}',
  remote public.remote_kind not null default 'unknown',
  apply_url text,
  posted_date date,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  pay_min_cents int,
  pay_max_cents int,
  pay_period public.pay_period,
  season text,
  level public.job_level not null default 'unknown',
  snippet text check (char_length(snippet) <= 1000),
  status public.posting_status not null default 'new',
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.posting_sources (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid not null references public.postings on delete cascade,
  source text not null,
  source_url text,
  external_id text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (source, external_id)
);

create table public.finder_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text,
  totals jsonb not null default '{}'
);

create table public.finder_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.finder_runs on delete cascade,
  source text not null,
  company_id uuid references public.companies on delete set null,
  fetched int not null default 0,
  new int not null default 0,
  seen int not null default 0,
  gone int not null default 0,
  status public.run_item_status not null default 'ok',
  error text
);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text
);

create table public.school_companies (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools on delete cascade,
  company_id uuid not null references public.companies on delete cascade,
  relation text,
  source text
);

-- Per-user tables ----------------------------------------------------------------
create table public.posting_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  posting_id uuid not null references public.postings on delete cascade,
  passed_filter boolean not null default false,
  filter_reasons text[] not null default '{}',
  base_score numeric,
  ai_score numeric,
  reasons jsonb not null default '{}',
  bar_verdict public.bar_verdict not null default 'no_bar',
  confirm_pay boolean not null default false,
  state public.match_state not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, posting_id)
);

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  kind public.ai_job_kind not null,
  input jsonb not null default '{}',
  status public.ai_job_status not null default 'queued',
  result jsonb,
  error text,
  claimed_by text,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Foreign keys deferred from the per-user migration ------------------------------------
alter table public.user_companies
  add constraint user_companies_company_id_fkey
  foreign key (company_id) references public.companies on delete set null;
alter table public.contacts
  add constraint contacts_company_id_fkey
  foreign key (company_id) references public.companies on delete set null;
alter table public.applications
  add constraint applications_posting_id_fkey
  foreign key (posting_id) references public.postings on delete set null;

-- Indexes (FK columns and common lookups) ---------------------------------------------
create index on public.postings (company_id);
create index on public.postings (status, last_seen);
create index on public.posting_sources (posting_id);
create index on public.finder_run_items (run_id);
create index on public.finder_run_items (company_id);
create index on public.school_companies (school_id);
create index on public.school_companies (company_id);
create index on public.posting_matches (user_id);
create index on public.posting_matches (posting_id);
create index on public.ai_jobs (user_id);
create index on public.ai_jobs (status, created_at);
create index on public.user_companies (company_id);
create index on public.contacts (company_id);
create index on public.applications (posting_id);

-- updated_at triggers -----------------------------------------------------------------
create trigger set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.postings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.posting_matches
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.ai_jobs
  for each row execute function public.set_updated_at();

-- RLS: global tables are read-only for signed-in users ---------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'postings', 'posting_sources', 'finder_runs', 'finder_run_items',
    'schools', 'school_companies'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "authenticated read" on public.%I for select to authenticated using (true)', t);
    -- Defence in depth: no write privileges at all for client roles.
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- RLS: per-user tables -------------------------------------------------------------------
alter table public.posting_matches enable row level security;
create policy "owner full access" on public.posting_matches for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.ai_jobs enable row level security;
create policy "owner full access" on public.ai_jobs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- AI queue guard: client roles may only enqueue, never progress or complete a job.
-- The service role (and direct postgres connections) are unrestricted.
create function public.guard_ai_jobs() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'queued'
       or new.result is not null or new.error is not null
       or new.claimed_by is not null or new.claimed_at is not null
       or new.completed_at is not null then
      raise exception 'ai_jobs: clients may only insert queued jobs'
        using errcode = '42501';
    end if;
  elsif new.status is distinct from old.status
     or new.result is distinct from old.result
     or new.error is distinct from old.error
     or new.claimed_by is distinct from old.claimed_by
     or new.claimed_at is distinct from old.claimed_at
     or new.completed_at is distinct from old.completed_at then
    raise exception 'ai_jobs: clients cannot change job status or results'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_ai_jobs before insert or update on public.ai_jobs
  for each row execute function public.guard_ai_jobs();
