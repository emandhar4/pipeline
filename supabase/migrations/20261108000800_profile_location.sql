-- Phase 2b (expand): structured location columns on profiles.
-- relocate stays for now; Task 6 drops it once nothing reads it.

-- us_state_from_location -----------------------------------------------------------------
-- SQL twin of stateFromLocation (src/lib/onboarding/regions.ts): takes the text after the
-- last comma (or the whole text), trims it, and accepts a USPS code or a full state name,
-- in any case. The 50 states plus DC; anything else (territories, 'D.C.', provinces) is null.
create function public.us_state_from_location(t text) returns text
language sql
immutable
set search_path = ''
as $$
  with part as (
    select regexp_replace(regexp_replace(t, '^.*,', ''), '^\s+|\s+$', '', 'g') as p
  )
  select s.code
  from part,
    (values
      ('AL', 'alabama'), ('AK', 'alaska'), ('AZ', 'arizona'), ('AR', 'arkansas'),
      ('CA', 'california'), ('CO', 'colorado'), ('CT', 'connecticut'), ('DE', 'delaware'),
      ('DC', 'district of columbia'), ('FL', 'florida'), ('GA', 'georgia'), ('HI', 'hawaii'),
      ('ID', 'idaho'), ('IL', 'illinois'), ('IN', 'indiana'), ('IA', 'iowa'),
      ('KS', 'kansas'), ('KY', 'kentucky'), ('LA', 'louisiana'), ('ME', 'maine'),
      ('MD', 'maryland'), ('MA', 'massachusetts'), ('MI', 'michigan'), ('MN', 'minnesota'),
      ('MS', 'mississippi'), ('MO', 'missouri'), ('MT', 'montana'), ('NE', 'nebraska'),
      ('NV', 'nevada'), ('NH', 'new hampshire'), ('NJ', 'new jersey'), ('NM', 'new mexico'),
      ('NY', 'new york'), ('NC', 'north carolina'), ('ND', 'north dakota'), ('OH', 'ohio'),
      ('OK', 'oklahoma'), ('OR', 'oregon'), ('PA', 'pennsylvania'), ('RI', 'rhode island'),
      ('SC', 'south carolina'), ('SD', 'south dakota'), ('TN', 'tennessee'), ('TX', 'texas'),
      ('UT', 'utah'), ('VT', 'vermont'), ('VA', 'virginia'), ('WA', 'washington'),
      ('WV', 'west virginia'), ('WI', 'wisconsin'), ('WY', 'wyoming')
    ) as s(code, name)
  where part.p <> '' and (upper(part.p) = s.code or lower(part.p) = s.name)
  limit 1
$$;

revoke execute on function public.us_state_from_location(text) from public, anon;
grant execute on function public.us_state_from_location(text) to authenticated;

-- columns --------------------------------------------------------------------------------
-- The 51 codes, in US_STATES order (alphabetical by name).
alter table public.profiles
  add column school_id uuid references public.schools(id) on delete set null,
  add column major_cip text references public.majors(cip_code) on delete set null,
  add column home_state text,
  add column school_state text,
  add column work_states text[] not null default '{}',
  add column work_anywhere_us boolean not null default false,
  add column work_countries text[] not null default '{}',
  add column open_to_remote boolean,
  add constraint profiles_home_state_check check (home_state is null or home_state = any (array[
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC',
    'ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
  ]::text[])),
  add constraint profiles_school_state_check check (school_state is null or school_state = any (array[
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC',
    'ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
  ]::text[])),
  add constraint profiles_work_states_check check (
    work_states <@ array[
      'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
      'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC',
      'ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
    ]::text[]
    and cardinality(work_states) <= 51
  ),
  add constraint profiles_work_countries_check check (
    cardinality(work_countries) <= 20 and not ('US' = any (work_countries))
  );

-- backfill (order matters: states first, then work_* from relocate) -----------------------
update public.profiles set
  home_state = public.us_state_from_location(home_location),
  school_state = public.us_state_from_location(school_location);

update public.profiles set work_anywhere_us = true
  where relocate = 'anywhere';

-- Non-null of home_state and school_state, deduped, in US_STATES order.
update public.profiles set work_states = array(
    select d.s
    from (
      select distinct s from unnest(array[home_state, school_state]) as s where s is not null
    ) as d
    order by array_position(array[
      'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
      'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC',
      'ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
    ]::text[], d.s)
  )
  where relocate = 'within_region';

update public.profiles set work_states = array[home_state]
  where relocate = 'no' and home_state is not null;

-- grants ---------------------------------------------------------------------------------
grant update (
  school_id, major_cip, home_state, school_state, work_states, work_anywhere_us,
  work_countries, open_to_remote
) on public.profiles to authenticated;
