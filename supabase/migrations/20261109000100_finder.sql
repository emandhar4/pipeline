-- Phase 3 finder: derived posting columns, scopes, run status, watcher counts
-- and the two service-role functions that close a run and prune old data.

-- postings: derived filter columns -----------------------------------------------------
alter table public.postings
  add column states text[] not null default '{}',            -- USPS codes
  add column countries text[] not null default '{}',         -- ISO-2
  add column terms text[] not null default '{}',             -- e.g. 'Summer 2027'
  add column field_slugs text[] not null default '{}',
  add column location_unknown boolean not null default false;

create index postings_states_idx on public.postings using gin (states);
create index postings_field_slugs_idx on public.postings using gin (field_slugs);
create index postings_status_level_idx on public.postings (status, level);

-- posting_sources: one row per (posting, scope) that can go gone ------------------------
alter table public.posting_sources
  add column scope text not null,
  add column gone_at timestamptz;

create index posting_sources_scope_live_idx on public.posting_sources (scope)
  where gone_at is null;

-- finder_run_items / finder_runs ----------------------------------------------------------
alter table public.finder_run_items
  add column scope text not null,
  add column found int not null default 0;

alter table public.finder_runs
  add column status text not null default 'running'
    check (status in ('running', 'finished', 'failed'));

-- companies --------------------------------------------------------------------------------
alter table public.companies
  add column watchers int not null default 0,
  add column careers_url text,
  add column resolved_at timestamptz;

-- watchers: number of user_companies rows per company, kept by trigger ------------------------
create function public.refresh_company_watchers() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
begin
  if tg_op = 'INSERT' then
    ids := array[new.company_id];
  elsif tg_op = 'DELETE' then
    ids := array[old.company_id];
  else
    ids := array[old.company_id, new.company_id];
  end if;

  update public.companies c
     set watchers = (select count(*) from public.user_companies uc where uc.company_id = c.id)
   where c.id = any (ids);
  return null;
end;
$$;

create trigger refresh_company_watchers
  after insert or update of company_id or delete on public.user_companies
  for each row execute function public.refresh_company_watchers();

-- finish_finder_run ------------------------------------------------------------------------
create function public.finish_finder_run(p_run uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started timestamptz;
  v_scopes text[];
  v_affected uuid[];
  v_gone int := 0;
  v_seen int := 0;
  v_new int;
  v_found int;
  v_failed int;
  v_totals jsonb;
begin
  select started_at into v_started from public.finder_runs where id = p_run for update;
  if not found then
    raise exception 'finder run % not found', p_run;
  end if;

  select coalesce(array_agg(distinct scope), '{}') into v_scopes
    from public.finder_run_items where run_id = p_run and status = 'ok';

  -- Source rows of a scope that succeeded but did not return them are gone.
  with upd as (
    update public.posting_sources ps
       set gone_at = now()
     where ps.scope = any (v_scopes)
       and ps.gone_at is null
       and ps.last_seen < v_started
    returning ps.posting_id
  )
  select coalesce(array_agg(distinct posting_id), '{}') into v_affected from upd;

  -- A posting with no live source row is gone.
  update public.postings p
     set status = 'gone'
   where p.id = any (v_affected)
     and p.status <> 'gone'
     and not exists (
       select 1 from public.posting_sources ps
        where ps.posting_id = p.id and ps.gone_at is null);
  get diagnostics v_gone = row_count;

  -- New in an earlier run becomes seen, but only for postings that belong to a
  -- scope this run worked on (any item status).
  update public.postings p
     set status = 'seen'
   where p.status = 'new'
     and p.first_seen < v_started
     and exists (
       select 1
         from public.posting_sources ps
         join public.finder_run_items i on i.scope = ps.scope and i.run_id = p_run
        where ps.posting_id = p.id);
  get diagnostics v_seen = row_count;

  select count(*) into v_new from public.postings where first_seen >= v_started;
  select coalesce(sum(found), 0), count(*) filter (where status = 'failed')
    into v_found, v_failed
    from public.finder_run_items where run_id = p_run;

  v_totals := jsonb_build_object(
    'found', v_found, 'new', v_new, 'seen', v_seen, 'gone', v_gone,
    'failed_scopes', v_failed);

  update public.finder_runs
     set finished_at = now(), status = 'finished', totals = v_totals
   where id = p_run;

  return v_totals;
end;
$$;

-- prune_finder_data -------------------------------------------------------------------------
-- Gone postings unseen for 60 days are deleted unless a user saved or applied to them;
-- run items older than 30 days are deleted (only when p_key_prefix is empty); runs are kept.
-- p_key_prefix limits posting deletion to dedupe_key values starting with it (tests use 'test:').
create function public.prune_finder_data(p_key_prefix text default '') returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_postings int;
  v_items int;
begin
  delete from public.postings p
   where p.status = 'gone'
     and p.last_seen < now() - interval '60 days'
     and p.dedupe_key like
       replace(replace(replace(p_key_prefix, '\', '\\'), '%', '\%'), '_', '\_') || '%'
     and not exists (
       select 1 from public.posting_matches m
        where m.posting_id = p.id and m.state in ('saved', 'applied'));
  get diagnostics v_postings = row_count;

  -- finder_run_items has no timestamp; age comes from its run.
  if p_key_prefix = '' then
    delete from public.finder_run_items i
     using public.finder_runs r
     where r.id = i.run_id and r.started_at < now() - interval '30 days';
    get diagnostics v_items = row_count;
  else
    v_items := 0;
  end if;

  return jsonb_build_object('postings', v_postings, 'run_items', v_items);
end;
$$;

revoke execute on function public.finish_finder_run(uuid) from public, anon, authenticated;
revoke execute on function public.prune_finder_data(text) from public, anon, authenticated;
grant execute on function public.finish_finder_run(uuid) to service_role;
grant execute on function public.prune_finder_data(text) to service_role;

revoke execute on function public.refresh_company_watchers() from public, anon, authenticated;
