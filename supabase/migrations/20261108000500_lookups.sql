-- Phase 2b: school and major lookups with type-ahead search.

create extension if not exists pg_trgm with schema extensions;

-- schools ------------------------------------------------------------------------------
alter table public.schools
  add column unitid int unique,
  add column city text,
  add column alias text;

do $$
begin
  if exists (select 1 from public.schools where unitid is null) then
    raise exception 'schools has rows with null unitid; migrate or delete them before seeding';
  end if;
end $$;

alter table public.schools
  add column search_text text generated always as
    (lower(name || ' ' || coalesce(alias, '') || ' ' || coalesce(city, ''))) stored;

create index schools_search_text_trgm_idx
  on public.schools using gin (search_text extensions.gin_trgm_ops);

-- majors -------------------------------------------------------------------------------
create table public.majors (
  cip_code text primary key check (cip_code ~ '^\d{2}\.\d{4}$'),
  title text not null,
  family text not null
);

create index majors_title_trgm_idx
  on public.majors using gin (lower(title) extensions.gin_trgm_ops);

alter table public.majors enable row level security;
create policy "authenticated read" on public.majors
  for select to authenticated using (true);
revoke all on public.majors from anon, authenticated;
grant select on public.majors to authenticated;

-- search functions -----------------------------------------------------------------------
-- Every word of q must appear (ilike, with LIKE wildcards escaped); prefix matches first,
-- then trigram word similarity, then name.
create function public.search_schools(q text, lim int default 8)
returns setof public.schools
language sql stable security invoker set search_path = ''
as $$
  with p as (select left(lower(trim(coalesce(q, ''))), 100) as t)
  select s.*
  from public.schools s, p
  where p.t <> ''
    and s.search_text ilike all (array(
      select '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      from unnest(regexp_split_to_array(p.t, '\s+')) as w
    ))
  order by
    (not starts_with(lower(s.name), p.t)),
    extensions.word_similarity(p.t, s.search_text) desc,
    s.name
  limit least(greatest(coalesce(lim, 8), 1), 20)
$$;

create function public.search_majors(q text, lim int default 8)
returns setof public.majors
language sql stable security invoker set search_path = ''
as $$
  with p as (select left(lower(trim(coalesce(q, ''))), 100) as t)
  select m.*
  from public.majors m, p
  where p.t <> ''
    and lower(m.title) ilike all (array(
      select '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      from unnest(regexp_split_to_array(p.t, '\s+')) as w
    ))
  order by
    (not starts_with(lower(m.title), p.t)),
    extensions.word_similarity(p.t, lower(m.title)) desc,
    m.title
  limit least(greatest(coalesce(lim, 8), 1), 20)
$$;

revoke execute on function public.search_schools(text, int) from public, anon;
revoke execute on function public.search_majors(text, int) from public, anon;
grant execute on function public.search_schools(text, int) to authenticated;
grant execute on function public.search_majors(text, int) to authenticated;
