-- Companies to watch: SQL twin of src/lib/companies/normalize.ts and the watch_company RPC.

-- normalize_company: keep in sync with normalizeCompany (TS). Steps: lowercase; delete
-- apostrophes (' and ’) and dots; & -> " and "; non letter/digit runs -> space; split;
-- while more than one token remains and the last is a suffix word, drop it (and a then-trailing "and").
create function public.normalize_company(p_name text) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  tokens text[];
  n int;
begin
  tokens := array_remove(
    string_to_array(
      regexp_replace(
        replace(regexp_replace(lower(coalesce(p_name, '')), '[''’.]', '', 'g'), '&', ' and '),
        '[^[:alnum:]]+', ' ', 'g'),
      ' '),
    '');
  n := coalesce(array_length(tokens, 1), 0);
  while n > 1 and tokens[n] = any (array['inc', 'llc', 'ltd', 'corp', 'corporation', 'co',
                                         'company', 'plc', 'group', 'holdings']) loop
    n := n - 1;
    if n > 1 and tokens[n] = 'and' then
      n := n - 1;
    end if;
  end loop;
  return array_to_string(tokens[1:n], ' ');
end;
$$;

-- watch_company: the caller watches a company by name. Finds or creates the shared company row;
-- ATS fields (and careers_url) are written only when the row is new or still ats = 'unknown',
-- and then coverage resets to 'unknown' so the next finder run verifies them.
create function public.watch_company(
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
     where uc.user_id = v_user and uc.company_id = v_company and uc.relation = 'target'
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

revoke execute on function public.normalize_company(text) from public, anon;
grant execute on function public.normalize_company(text) to authenticated, service_role;
revoke execute on function public.watch_company(text, text, text, text, jsonb) from public, anon;
grant execute on function public.watch_company(text, text, text, text, jsonb) to authenticated;
