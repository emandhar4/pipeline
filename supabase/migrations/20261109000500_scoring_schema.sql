-- Phase 4: schema for scoring, one bar per user, one relation per company, AI job links.

-- Postings: stated sponsorship (Simplify only). Unknown stays null.
alter table public.postings
  add column sponsorship text check (sponsorship in ('offers', 'none', 'citizens_only'));

-- Bars: one per user, the offer role's field slugs, and sane pay.
alter table public.bars
  add constraint bars_user_id_key unique (user_id),
  add column role_field_slugs text[] not null default '{}',
  add constraint bars_pay_period_check check (pay_period is null or pay_period in ('hour', 'year')),
  add constraint bars_pay_cents_check check (pay_cents is null or pay_cents > 0);

-- User companies: one relation per (user, company). Keep the oldest row per pair first.
delete from public.user_companies uc
 using public.user_companies older
 where uc.user_id = older.user_id
   and uc.company_id = older.company_id
   and (older.created_at, older.id) < (uc.created_at, uc.id);
alter table public.user_companies drop constraint user_companies_user_id_company_id_relation_key;
alter table public.user_companies add constraint user_companies_user_id_company_id_key unique (user_id, company_id);

-- AI jobs: link to the posting; one job per (user, kind, posting); claim ordering index.
alter table public.ai_jobs
  add column posting_id uuid references public.postings on delete cascade;
create unique index ai_jobs_user_kind_posting_key on public.ai_jobs (user_id, kind, posting_id);
create index ai_jobs_status_claimed_at_idx on public.ai_jobs (status, claimed_at);

-- Matches: ranking index for the dashboard panel.
create index posting_matches_user_passed_score_idx
  on public.posting_matches (user_id, passed_filter, base_score desc);

-- Yearly pay in cents: hour x 2080, year as is, anything else null.
create function public.pay_year_cents(cents int, period text) returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when cents is null or cents <= 0 then null
    when period = 'hour' then cents * 2080
    when period = 'year' then cents
    else null
  end;
$$;
revoke execute on function public.pay_year_cents(int, text) from public, anon;
grant execute on function public.pay_year_cents(int, text) to authenticated, service_role;

-- Worker claim: up to least(p_limit, 10) queued jobs, or claimed ones stale for over 2 hours.
create function public.claim_ai_jobs(p_limit int, p_worker text) returns setof public.ai_jobs
language sql
set search_path = ''
as $$
  update public.ai_jobs j
     set status = 'claimed', claimed_by = p_worker, claimed_at = now()
   where j.id in (
     select c.id from public.ai_jobs c
      where c.status = 'queued'
         or (c.status = 'claimed' and c.claimed_at < now() - interval '2 hours')
      order by c.created_at
      limit greatest(least(p_limit, 10), 0)
      for update skip locked
   )
  returning j.*;
$$;
revoke execute on function public.claim_ai_jobs(int, text) from public, anon, authenticated;
grant execute on function public.claim_ai_jobs(int, text) to service_role;

-- watch_company: as before, but a target row is inserted only when the user has no row at all
-- for the company (one relation per company now).
create or replace function public.watch_company(
  p_name text,
  p_careers_url text,
  p_ats text,
  p_token text,
  p_meta jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_norm text;
  v_ats public.ats_kind;
  v_company uuid;
  v_cur_ats public.ats_kind;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'name' using hint = 'Name must be 1 to 120 characters';
  end if;
  v_norm := public.normalize_company(v_name);
  if v_norm = '' then
    raise exception 'name' using hint = 'Name needs letters or digits';
  end if;
  if p_ats is not null then
    v_ats := p_ats::public.ats_kind;
    if v_ats in ('unknown', 'other') or coalesce(btrim(p_token), '') = '' then
      raise exception 'ats';
    end if;
  end if;
  if p_careers_url is not null and char_length(p_careers_url) > 500 then
    raise exception 'careers_url';
  end if;

  insert into public.companies (name, normalized_name)
  values (v_name, v_norm)
  on conflict (normalized_name) do nothing;

  select c.id, c.ats into v_company, v_cur_ats
    from public.companies c where c.normalized_name = v_norm for update;

  if v_ats is not null and v_cur_ats = 'unknown' then
    update public.companies c
       set ats = v_ats,
           ats_token = btrim(p_token),
           ats_meta = coalesce(p_meta, '{}'::jsonb),
           careers_url = p_careers_url,
           coverage = 'unknown',
           coverage_reason = null,
           resolved_at = null
     where c.id = v_company;
  end if;

  if not exists (
    select 1 from public.user_companies uc
     where uc.user_id = v_user and uc.company_id = v_company
  ) then
    if (select count(*) from public.user_companies uc where uc.user_id = v_user) >= 100 then
      raise exception 'limit';
    end if;
    insert into public.user_companies (user_id, company_id, relation)
    values (v_user, v_company, 'target');
  end if;

  return v_company;
end;
$$;

revoke execute on function public.watch_company(text, text, text, text, jsonb) from public, anon;
grant execute on function public.watch_company(text, text, text, text, jsonb) to authenticated;
