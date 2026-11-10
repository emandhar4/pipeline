-- Phase 4 matching: new hard filters, a 0-100 fit score and the verdict against the user's bar.
--
-- refresh_matches(p_user) keeps every Phase 3 rule (incomplete profile, level, season, place,
-- field, label escaping, keeping rows that stop passing, never touching state) and adds:
--
-- Filters (filter_reasons, in this order after Phase 3's):
--   industry  the company's industry matches one of the user's 'avoid' industries
--   company   the user marked the company 'rejected'
--   pay       pay is known and the best yearly pay is below the user's yearly floor
--   work_auth needs_sponsorship fails sponsorship 'none'/'citizens_only';
--             no_sponsorship_needed fails 'citizens_only'; unknown passes
--
-- Score (passing rows only, else null), clamped to 0-100:
--   best field primary 40 / secondary 15; age <=3/<=7/<=14/<=30 days 20/15/10/5;
--   dream company 20; preferred industry 10; pay known and at or above the floor (or no floor) 5;
--   capped company -25.
--
-- Industry label rule: ignoring case, the label with a trailing "s", "e" or "es" dropped must
-- begin a word of the company's industry ('<GICS Sector> / <GICS Sub-Industry>'). Dropping the
-- "e" is what lets 'Finance' match 'Financials'. Unknown industry never matches.
--
-- The bar (one per user): pay, brand and function, each 'better' | 'same' | 'worse'.
--   pay      better when the posting's yearly pay is at least 10% above the offer's, worse when
--            below it, else same; null when either side is unknown. pay_pct is the rounded %
--            difference, only when compared.
--   brand    tier 2 dream, 1 S&P 500 (is_fortune500), 0 anything else (an offer company with no
--            companies row is tier 0). No company on the bar: 'same'.
--   function best field weight (primary > secondary > none) of the posting against the offer
--            role's (role_field_slugs and the role text, same rules as postings). No role and no
--            slugs: 'same'.
--   'beats' = better on at least one and worse on none; else 'does_not_beat'; no bar: 'no_bar'.
--
-- reasons keeps an existing ai_reason; ai_score and state are never touched.
--
-- Pay to yearly cents goes through pay_year_cents; hourly cents are capped at 1,000,000 ($10,000
-- an hour) first so a mislabelled posting cannot overflow int and fail the refresh for everyone.

create or replace function public.refresh_matches(p_user uuid) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_has_places boolean;
  v_floor_year int;
  v_bar public.bars%rowtype;
  v_has_bar boolean;
  v_bar_pay_year int;        -- null: pay not compared
  v_bar_tier int;            -- null: brand not compared
  v_bar_role boolean := false; -- false: function not compared
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

  v_floor_year := public.pay_year_cents(
    case when v_profile.pay_floor_period = 'hour' and v_profile.pay_floor_cents > 1000000
         then 1000000 else v_profile.pay_floor_cents end,
    v_profile.pay_floor_period::text);

  select * into v_bar from public.bars b where b.user_id = p_user;
  v_has_bar := found;
  if v_has_bar then
    v_bar_pay_year := public.pay_year_cents(
      case when v_bar.pay_period = 'hour' and v_bar.pay_cents > 1000000
           then 1000000 else v_bar.pay_cents end,
      v_bar.pay_period);
    if btrim(coalesce(v_bar.company, '')) <> '' then
      select case when uc.relation = 'dream' then 2 when c.is_fortune500 then 1 else 0 end
        into v_bar_tier
        from public.companies c
        left join public.user_companies uc on uc.user_id = p_user and uc.company_id = c.id
       where c.normalized_name = public.normalize_company(v_bar.company);
      v_bar_tier := coalesce(v_bar_tier, 0);
    end if;
    v_bar_role := btrim(coalesce(v_bar.role, '')) <> ''
      or cardinality(coalesce(v_bar.role_field_slugs, '{}')) > 0;
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
  offer as (
    -- The offer role's best field rank (2 primary, 1 secondary, 0 none), same rules as postings.
    select coalesce(max(case f.weight when 'primary' then 2 else 1 end), 0) as rank
      from fields f
     where v_bar_role
       and ((f.category_slug is not null and f.category_slug = any (v_bar.role_field_slugs))
            or (f.pattern is not null and v_bar.role ~* f.pattern))
  ),
  industries as (
    -- Label with a trailing s / e / es dropped, escaped like field labels, at a word start.
    select i.industry as label,
           i.preference,
           '(?:^|[^[:alnum:]])'
           || regexp_replace(s.stem, '([^[:alnum:][:space:]_])', '\\\1', 'g') as pattern
      from public.profile_industries i
      cross join lateral (
        select regexp_replace(lower(btrim(coalesce(i.industry, ''))), 'e?s?$', '') as stem
      ) s
     where i.user_id = p_user
       and i.preference is not null
       and char_length(s.stem) >= 2
  ),
  evaluated as (
    select p.id,
           p.location_unknown,
           p.sponsorship,
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
           m.best_weight,
           -- best pay (max, else min) in yearly cents; 0 or missing is unknown
           coalesce(
             public.pay_year_cents(
               case when p.pay_period = 'hour' and p.pay_max_cents > 1000000 then 1000000
                    else p.pay_max_cents end, p.pay_period::text),
             public.pay_year_cents(
               case when p.pay_period = 'hour' and p.pay_min_cents > 1000000 then 1000000
                    else p.pay_min_cents end, p.pay_period::text)) as pay_year,
           current_date - greatest(p.posted_date, p.first_seen::date) as age_days,
           uc.relation,
           case when uc.relation = 'dream' then 2
                when coalesce(c.is_fortune500, false) then 1
                else 0 end as tier,
           coalesce(c.industry is not null and exists (
             select 1 from industries i
              where i.preference = 'avoid' and c.industry ~* i.pattern), false) as avoided,
           case when c.industry is not null then (
             select i.label from industries i
              where i.preference = 'prefer' and c.industry ~* i.pattern
              order by i.label
              limit 1)
           end as preferred_industry
      from public.postings p
      left join public.companies c on c.id = p.company_id
      left join public.user_companies uc on uc.user_id = p_user and uc.company_id = p.company_id
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
             case when e.best_weight is null then 'field' end,
             case when e.avoided then 'industry' end,
             case when e.relation = 'rejected' then 'company' end,
             case when e.pay_year < v_floor_year then 'pay' end,
             case when (v_profile.work_auth = 'needs_sponsorship'
                        and e.sponsorship in ('none', 'citizens_only'))
                    or (v_profile.work_auth = 'no_sponsorship_needed'
                        and e.sponsorship = 'citizens_only') then 'work_auth' end
           ], null) as failed,
           case when e.pay_year is null then null
                else v_floor_year is null or e.pay_year >= v_floor_year end as pay_ok,
           case e.best_weight when 'primary' then 2 when 'secondary' then 1 else 0 end as rank
      from evaluated e
  ),
  scored as (
    select j.*,
           greatest(0, least(100,
             case j.best_weight when 'primary' then 40 when 'secondary' then 15 else 0 end
             + case when j.age_days is null then 0
                    when j.age_days <= 3 then 20
                    when j.age_days <= 7 then 15
                    when j.age_days <= 14 then 10
                    when j.age_days <= 30 then 5
                    else 0 end
             + case when j.relation = 'dream' then 20 else 0 end
             + case when j.preferred_industry is not null then 10 else 0 end
             + case when j.pay_ok then 5 else 0 end
             - case when j.relation = 'capped' then 25 else 0 end)) as score,
           case when not v_has_bar or v_bar_pay_year is null or j.pay_year is null then null
                when j.pay_year::numeric * 10 >= v_bar_pay_year::numeric * 11 then 'better'
                when j.pay_year < v_bar_pay_year then 'worse'
                else 'same' end as bar_pay,
           case when not v_has_bar or v_bar_pay_year is null or j.pay_year is null then null
                else round((j.pay_year - v_bar_pay_year)::numeric * 100 / v_bar_pay_year)::int
           end as bar_pay_pct,
           case when v_bar_tier is null or j.tier = v_bar_tier then 'same'
                when j.tier > v_bar_tier then 'better'
                else 'worse' end as bar_brand,
           case when not v_bar_role or j.rank = o.rank then 'same'
                when j.rank > o.rank then 'better'
                else 'worse' end as bar_function
      from judged j
      cross join offer o
  )
  insert into public.posting_matches as pm
    (user_id, posting_id, passed_filter, filter_reasons, base_score, reasons, bar_verdict,
     confirm_pay)
  select p_user,
         s.id,
         cardinality(s.failed) = 0,
         s.failed,
         case when cardinality(s.failed) = 0 then s.score end,
         jsonb_build_object(
           'fields', s.fields,
           'weight', s.best_weight,
           'location_unknown', s.location_unknown,
           'age_days', s.age_days,
           'dream', coalesce(s.relation = 'dream', false),
           'capped', coalesce(s.relation = 'capped', false),
           'preferred_industry', s.preferred_industry,
           'pay_ok', s.pay_ok,
           'bar', case when v_has_bar then jsonb_build_object(
                    'pay', s.bar_pay,
                    'pay_pct', s.bar_pay_pct,
                    'brand', s.bar_brand,
                    'function', s.bar_function) end)
         || case when x.reasons ? 'ai_reason'
                 then jsonb_build_object('ai_reason', x.reasons -> 'ai_reason')
                 else '{}'::jsonb end,
         (case when not v_has_bar then 'no_bar'
               when 'better' in (s.bar_pay, s.bar_brand, s.bar_function)
                    and coalesce(s.bar_pay, '') <> 'worse'
                    and s.bar_brand <> 'worse'
                    and s.bar_function <> 'worse' then 'beats'
               else 'does_not_beat' end)::public.bar_verdict,
         s.pay_year is null
    from scored s
    left join public.posting_matches x on x.user_id = p_user and x.posting_id = s.id
   where cardinality(s.failed) = 0
      or x.id is not null
  on conflict (user_id, posting_id) do update
     set passed_filter = excluded.passed_filter,
         filter_reasons = excluded.filter_reasons,
         base_score = excluded.base_score,
         reasons = excluded.reasons,
         bar_verdict = excluded.bar_verdict,
         confirm_pay = excluded.confirm_pay
   where (pm.passed_filter, pm.filter_reasons, pm.base_score, pm.reasons, pm.bar_verdict,
          pm.confirm_pay)
         is distinct from
         (excluded.passed_filter, excluded.filter_reasons, excluded.base_score,
          excluded.reasons, excluded.bar_verdict, excluded.confirm_pay);

  return 'ok';
end;
$$;

revoke execute on function public.refresh_matches(uuid) from public, anon;
grant execute on function public.refresh_matches(uuid) to authenticated, service_role;
