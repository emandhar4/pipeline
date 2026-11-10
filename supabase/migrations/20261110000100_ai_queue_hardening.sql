-- AI queue hardening (before the queue is turned on).
--
-- 1. claim_ai_jobs hands out only score_fit jobs of users whose ai_mode is 'queue'. Owners can
--    insert their own queued jobs (RLS), so the mode gate must live where jobs are claimed. Other
--    jobs stay queued untouched. The pick is a materialized CTE so the limit is applied once
--    (the old `id in (subquery … limit … skip locked)` could be re-run and over-claim).
-- 2. complete_ai_job finishes a claimed job and writes its score in one transaction: the job moves
--    only if it is still claimed, and the match's reasons get ai_reason merged with `||` (no
--    read-modify-write race with refresh_matches).

create or replace function public.claim_ai_jobs(p_limit int, p_worker text) returns setof public.ai_jobs
language sql
set search_path = ''
as $$
  with picked as materialized (
    select c.id
      from public.ai_jobs c
      join public.profiles p on p.user_id = c.user_id
     where c.kind = 'score_fit'
       and p.ai_mode = 'queue'
       and (c.status = 'queued'
            or (c.status = 'claimed' and c.claimed_at < now() - interval '2 hours'))
     order by c.created_at
     limit greatest(least(p_limit, 10), 0)
     for update of c skip locked
  )
  update public.ai_jobs j
     set status = 'claimed', claimed_by = p_worker, claimed_at = now()
    from picked
   where j.id = picked.id
  returning j.*;
$$;
revoke execute on function public.claim_ai_jobs(int, text) from public, anon, authenticated;
grant execute on function public.claim_ai_jobs(int, text) to service_role;

-- Exactly one of (p_score with p_reason) or p_error. Returns 'ok', 'not_found' or 'not_claimed'.
create function public.complete_ai_job(
  p_id uuid,
  p_score int default null,
  p_reason text default null,
  p_error text default null
) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_job public.ai_jobs;
begin
  if (p_error is null) = (p_score is null) or (p_score is not null and p_reason is null) then
    raise exception 'complete_ai_job: give a score with a reason, or an error';
  end if;
  if p_score is not null and (p_score < 1 or p_score > 10) then
    raise exception 'complete_ai_job: score must be 1 to 10';
  end if;

  update public.ai_jobs
     set status = case when p_error is null then 'done' else 'failed' end::public.ai_job_status,
         result = case when p_error is null then jsonb_build_object('score', p_score, 'reason', p_reason) end,
         error = p_error,
         completed_at = now()
   where id = p_id
     and status = 'claimed'
  returning * into v_job;

  if not found then
    if exists (select 1 from public.ai_jobs where id = p_id) then
      return 'not_claimed';
    end if;
    return 'not_found';
  end if;

  if p_error is null and v_job.posting_id is not null then
    update public.posting_matches
       set ai_score = p_score,
           reasons = case when jsonb_typeof(reasons) = 'object' then reasons else '{}'::jsonb end
                     || jsonb_build_object('ai_reason', p_reason)
     where user_id = v_job.user_id
       and posting_id = v_job.posting_id;
  end if;
  return 'ok';
end;
$$;
revoke execute on function public.complete_ai_job(uuid, int, text, text) from public, anon, authenticated;
grant execute on function public.complete_ai_job(uuid, int, text, text) to service_role;
