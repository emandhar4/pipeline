-- Per-user tables with RLS, profile trigger and backfill.

-- Enums -------------------------------------------------------------------
create type public.career_stage as enum ('intern', 'new_grad', 'experienced', 'career_switcher');
create type public.relocate_pref as enum ('no', 'within_region', 'anywhere');
create type public.pay_period as enum ('hour', 'year');
create type public.ai_mode as enum ('off', 'queue', 'api');
create type public.field_weight as enum ('primary', 'secondary');
create type public.industry_pref as enum ('prefer', 'avoid');
create type public.company_relation as enum ('dream', 'target', 'capped', 'rejected');
create type public.app_stage as enum ('saved', 'applied', 'screened', 'interviewed', 'final', 'offer', 'closed');
create type public.app_outcome as enum ('rejected', 'withdrawn', 'no_response', 'declined', 'accepted');
create type public.app_channel as enum ('cold', 'referral');
create type public.task_kind as enum ('assessment', 'interview', 'follow_up', 'outreach', 'closing_soon', 'onboarding', 'other');
create type public.task_status as enum ('open', 'done', 'snoozed');
create type public.experience_kind as enum ('role', 'project', 'education', 'skill', 'tool', 'metric', 'never_claim');
create type public.resume_kind as enum ('uploaded', 'generated');

-- Shared updated_at trigger -------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Tables ----------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade default auth.uid(),
  career_stage public.career_stage,
  school text,
  major text,
  grad_date date,
  work_auth text,
  home_location text,
  school_location text,
  in_state_school boolean,
  relocate public.relocate_pref,
  pay_floor_cents int,
  pay_floor_period public.pay_period,
  season text,
  alert_style text default 'in_app',
  onboarding_step int default 0,
  ai_mode public.ai_mode default 'off',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  category text,
  label text,
  weight public.field_weight,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_industries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  industry text,
  preference public.industry_pref,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  company text,
  role text,
  pay_cents int,
  pay_period text,
  rules jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- company_id gets its FK to companies in Task 3.
create table public.user_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  company_id uuid,
  relation public.company_relation,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id, relation)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  company_id uuid,
  name text,
  email text,
  linkedin_url text,
  role text,
  is_referral boolean default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  posting_id uuid,
  company_name text,
  title text,
  stage public.app_stage,
  outcome public.app_outcome,
  channel public.app_channel default 'cold',
  referral_contact_id uuid references public.contacts on delete set null,
  applied_at date,
  last_activity_at timestamptz default now(),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  application_id uuid not null references public.applications on delete cascade,
  kind text,
  from_stage public.app_stage,
  to_stage public.app_stage,
  occurred_at timestamptz default now(),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  kind public.task_kind,
  title text,
  due_at timestamptz,
  status public.task_status default 'open',
  snoozed_until timestamptz,
  ref_table text,
  ref_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.experience_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  kind public.experience_kind,
  title text,
  org text,
  start_date date,
  end_date date,
  bullets jsonb default '[]',
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- user_id null = global default rules.
create table public.resume_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  rules jsonb not null,
  version int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  kind public.resume_kind,
  storage_path text,
  posting_id uuid,
  extraction_ok boolean,
  extraction_report jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes on user_id (policy filter column) ------------------------------------
create index on public.profile_fields (user_id);
create index on public.profile_industries (user_id);
create index on public.bars (user_id);
create index on public.contacts (user_id);
create index on public.applications (user_id);
create index on public.applications (referral_contact_id);
create index on public.application_events (user_id);
create index on public.application_events (application_id);
create index on public.tasks (user_id);
create index on public.experience_items (user_id);
create index on public.resume_rules (user_id);
create index on public.resumes (user_id);

-- updated_at triggers + RLS -----------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'profile_fields', 'profile_industries', 'bars', 'user_companies',
    'contacts', 'applications', 'application_events', 'tasks', 'experience_items',
    'resume_rules', 'resumes'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner full access" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- Global default resume rules are readable by everyone signed in.
create policy "global defaults readable" on public.resume_rules
  for select to authenticated
  using (user_id is null);

-- Events may only be attached to the caller's own applications.
create policy "events on own applications" on public.application_events
  as restrictive for all to authenticated
  using (exists (
    select 1 from public.applications a
    where a.id = application_id and a.user_id = (select auth.uid())))
  with check (exists (
    select 1 from public.applications a
    where a.id = application_id and a.user_id = (select auth.uid())));

-- New-user profile trigger -------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- One-time backfill for users that existed before this migration.
insert into public.profiles (user_id)
select id from auth.users
on conflict do nothing;
