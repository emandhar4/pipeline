-- Phase 2b: three-way work style replaces the yes/no open_to_remote.
-- open_to_remote (added in 0800) is unreleased and only read on this branch, so it is
-- dropped here rather than in a later contract step.

alter table public.profiles
  add column work_style text
    check (work_style is null or work_style in ('in_person', 'either', 'remote_only'));

-- backfill: remote yes with places -> either; remote yes with no places -> remote_only;
-- remote no -> in_person; null stays null.
update public.profiles set work_style = case
    when open_to_remote and (
      work_anywhere_us or cardinality(work_states) > 0 or cardinality(work_countries) > 0
    ) then 'either'
    when open_to_remote then 'remote_only'
    else 'in_person'
  end
  where open_to_remote is not null;

grant update (work_style) on public.profiles to authenticated;

-- Dropping the column also drops its column-level update grant.
alter table public.profiles drop column open_to_remote;
