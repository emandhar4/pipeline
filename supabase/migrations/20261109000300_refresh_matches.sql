-- Phase 3 matching: the per-user filter that decides which postings a user sees.
--
-- refresh_matches(p_user) compares every non-gone posting's derived columns
-- (level, terms, states, countries, remote, location_unknown, field_slugs, title)
-- with the user's profile in one set-based upsert into posting_matches.
--
-- security invoker: the app calls it as the user (RLS: postings are readable by
-- authenticated, the profile and fields are the owner's, posting_matches has an owner
-- policy); the finder calls it as the service role for every user after a run.
--
-- Rows are written for postings that pass, and refreshed for postings that already have
-- a row (so a posting that stops passing keeps its row with passed_filter = false, and a
-- saved/hidden state survives). state is never touched. Rows for gone postings are left
-- as they are (the dashboard hides gone postings).

create function public.refresh_matches(p_user uuid) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_has_places boolean;
begin
  if p_user is null then
    raise exception 'refresh_matches: p_user is required' using errcode = '22004';
  end if;
  if auth.uid() is not null and p_user <> auth.uid() then
    raise exception 'refresh_matches: cannot refresh another user' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles pr where pr.user_id = p_user;
  if not found then
    return 'incomplete';
  end if;

  -- Incomplete profile: no new matches, nothing changed. "No places" never means anywhere.
  v_has_places := v_profile.work_anywhere_us
    or cardinality(v_profile.work_states) > 0
    or cardinality(v_profile.work_countries) > 0;
  if v_profile.career_stage is null
     or v_profile.work_style is null
     or v_profile.season is null or btrim(v_profile.season) = ''
     or (v_profile.work_style <> 'remote_only' and not v_has_places)
     or not exists (
       select 1 from public.profile_fields f
        where f.user_id = p_user and f.weight = 'primary') then
    return 'incomplete';
  end if;

  with fields as (
    -- A category field matches on field_slugs; a free-text field matches the title as a
    -- whole word, case-insensitive. The label is user input: every character that is not
    -- a letter, digit, space or underscore is escaped, and the word boundary is "start/end
    -- or a non-word character" so labels like 'C++' and 'R&D' work (\m/\M would not).
    -- LLM-UPGRADE: a model could judge field fit from the title and snippet instead of
    -- slug overlap and whole-word label matches.
    select f.category_slug,
           f.label,
           f.weight,
           case
             when f.category_slug is null and btrim(f.label) <> '' then
               '(?:^|[^[:alnum:]_])'
               || regexp_replace(btrim(f.label), '([^[:alnum:][:space:]_])', '\\\1', 'g')
               || '(?:$|[^[:alnum:]_])'
           end as pattern
      from public.profile_fields f
     where f.user_id = p_user
  ),
  evaluated as (
    select p.id,
           p.pay_min_cents,
           p.location_unknown,
           -- level
           case v_profile.career_stage
             when 'intern' then p.level = 'internship'
             when 'new_grad' then p.level = 'new_grad'
             else p.level in ('experienced', 'unknown')
           end as ok_level,
           -- season (internships only)
           (p.level <> 'internship'
             or v_profile.season = 'Full-time'
             or p.terms = '{}'
             or v_profile.season = any (p.terms)) as ok_season,
           -- place ('remote' means a remote option exists; offices keep their states).
           -- The in-person test excludes fully remote postings (remote option and no states).
           (p.location_unknown
             or (v_profile.work_style in ('in_person', 'either')
                 and not (p.remote = 'remote' and p.states = '{}')
                 and ((v_profile.work_anywhere_us and 'US' = any (p.countries))
                      or p.states && v_profile.work_states
                      or p.countries && v_profile.work_countries))
             or (v_profile.work_style in ('either', 'remote_only')
                 and p.remote = 'remote'
                 and ('US' = any (p.countries) or p.countries = '{}'))) as ok_place,
           m.fields,
           m.best_weight
      from public.postings p
      cross join lateral (
        select coalesce(
                 jsonb_agg(jsonb_build_object('label', f.label, 'weight', f.weight)
                           order by f.weight, f.label),
                 '[]'::jsonb) as fields,
               min(f.weight) as best_weight
          from fields f
         where (f.category_slug is not null and f.category_slug = any (p.field_slugs))
            or (f.pattern is not null and p.title ~* f.pattern)
      ) m
     where p.status <> 'gone'
  ),
  judged as (
    select e.*,
           array_remove(array[
             case when not e.ok_level then 'level' end,
             case when not e.ok_season then 'season' end,
             case when not e.ok_place then 'place' end,
             case when e.best_weight is null then 'field' end
           ], null) as failed
      from evaluated e
  )
  insert into public.posting_matches as pm
    (user_id, posting_id, passed_filter, filter_reasons, base_score, reasons, confirm_pay)
  select p_user,
         j.id,
         cardinality(j.failed) = 0,
         j.failed,
         null,
         jsonb_build_object(
           'fields', j.fields,
           'weight', j.best_weight,
           'location_unknown', j.location_unknown),
         j.pay_min_cents is null
    from judged j
   where cardinality(j.failed) = 0
      or exists (
        select 1 from public.posting_matches x
         where x.user_id = p_user and x.posting_id = j.id)
  on conflict (user_id, posting_id) do update
     set passed_filter = excluded.passed_filter,
         filter_reasons = excluded.filter_reasons,
         base_score = excluded.base_score,
         reasons = excluded.reasons,
         confirm_pay = excluded.confirm_pay
   where (pm.passed_filter, pm.filter_reasons, pm.base_score, pm.reasons, pm.confirm_pay)
         is distinct from
         (excluded.passed_filter, excluded.filter_reasons, excluded.base_score,
          excluded.reasons, excluded.confirm_pay);

  return 'ok';
end;
$$;

revoke execute on function public.refresh_matches(uuid) from public, anon;
grant execute on function public.refresh_matches(uuid) to authenticated, service_role;
