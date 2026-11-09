-- Fix: qualify column references in finish_finder_run ("found" clashed with PL/pgSQL FOUND).

create or replace function public.finish_finder_run(p_run uuid) returns jsonb
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
  select r.started_at into v_started from public.finder_runs r where r.id = p_run for update;
  if not found then
    raise exception 'finder run % not found', p_run;
  end if;

  select coalesce(array_agg(distinct i.scope), '{}') into v_scopes
    from public.finder_run_items i where i.run_id = p_run and i.status = 'ok';

  -- Source rows of a scope that succeeded but did not return them are gone.
  with upd as (
    update public.posting_sources ps
       set gone_at = now()
     where ps.scope = any (v_scopes)
       and ps.gone_at is null
       and ps.last_seen < v_started
    returning ps.posting_id
  )
  select coalesce(array_agg(distinct upd.posting_id), '{}') into v_affected from upd;

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

  select count(*) into v_new from public.postings p where p.first_seen >= v_started;
  select coalesce(sum(i.found), 0), count(*) filter (where i.status = 'failed')
    into v_found, v_failed
    from public.finder_run_items i where i.run_id = p_run;

  v_totals := jsonb_build_object(
    'found', v_found, 'new', v_new, 'seen', v_seen, 'gone', v_gone,
    'failed_scopes', v_failed);

  update public.finder_runs r
     set finished_at = now(), status = 'finished', totals = v_totals
   where r.id = p_run;

  return v_totals;
end;
$$;

revoke execute on function public.finish_finder_run(uuid) from public, anon, authenticated;
grant execute on function public.finish_finder_run(uuid) to service_role;
