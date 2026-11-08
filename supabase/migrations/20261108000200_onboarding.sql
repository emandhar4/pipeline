-- Phase 2 onboarding: field category vocabulary and stricter profile constraints.

-- Global vocabulary (source: intern-list.com categories, 2026-11-08) -----------------
create table public.field_categories (
  slug text primary key,
  name text not null unique,
  sort int not null,
  source text not null default 'intern-list'
);

alter table public.field_categories enable row level security;
create policy "authenticated read" on public.field_categories
  for select to authenticated using (true);
revoke insert, update, delete on public.field_categories from anon, authenticated;

insert into public.field_categories (slug, name, sort) values
  ('software-engineering', 'Software Engineering', 1),
  ('data-analysis', 'Data Analysis', 2),
  ('machine-learning-and-ai', 'Machine Learning and AI', 3),
  ('product-management', 'Product Management', 4),
  ('accounting-and-finance', 'Accounting and Finance', 5),
  ('engineering-and-development', 'Engineering and Development', 6),
  ('business-analyst', 'Business Analyst', 7),
  ('marketing', 'Marketing', 8),
  ('cybersecurity', 'Cybersecurity', 9),
  ('consulting', 'Consulting', 10),
  ('creatives-and-design', 'Creatives and Design', 11),
  ('management-and-executive', 'Management and Executive', 12),
  ('public-sector-and-government', 'Public Sector and Government', 13),
  ('legal-and-compliance', 'Legal and Compliance', 14),
  ('human-resources', 'Human Resources', 15),
  ('arts-and-entertainment', 'Arts and Entertainment', 16),
  ('sales', 'Sales', 17),
  ('customer-service-and-support', 'Customer Service and Support', 18),
  ('education-and-training', 'Education and Training', 19),
  ('healthcare', 'Healthcare', 20),
  ('supply-chain', 'Supply Chain', 21);

-- profile_fields ---------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.profile_fields) <> 0 then
    raise exception 'profile_fields is not empty; migrate its rows before renaming category';
  end if;
  if exists (select 1 from public.profile_industries where industry is null or preference is null)
     or exists (select 1 from public.profile_industries group by user_id, lower(industry) having count(*) > 1) then
    raise exception 'profile_industries has null or case-duplicate rows; clean them first';
  end if;
end $$;

alter table public.profile_fields rename column category to category_slug;
alter table public.profile_fields
  add constraint profile_fields_category_slug_fkey
  foreign key (category_slug) references public.field_categories (slug);
alter table public.profile_fields alter column label set not null;
alter table public.profile_fields alter column weight set not null;
create unique index profile_fields_user_label_key
  on public.profile_fields (user_id, lower(label));

-- profile_industries ---------------------------------------------------------------------
alter table public.profile_industries alter column industry set not null;
alter table public.profile_industries alter column preference set not null;
create unique index profile_industries_user_industry_key
  on public.profile_industries (user_id, lower(industry));

-- profiles ---------------------------------------------------------------------------------
-- Null out any legacy free-text work_auth value that would break the new check.
update public.profiles set work_auth = null
  where work_auth is not null
    and work_auth not in ('citizen_or_pr', 'no_sponsorship_needed', 'needs_sponsorship');
update public.profiles set pay_floor_cents = null where pay_floor_cents < 0;
update public.profiles set onboarding_step = 0
  where onboarding_step is null or onboarding_step not between 0 and 6;

alter table public.profiles
  add constraint profiles_work_auth_check
    check (work_auth is null or work_auth in ('citizen_or_pr', 'no_sponsorship_needed', 'needs_sponsorship')),
  add constraint profiles_pay_floor_cents_check check (pay_floor_cents >= 0),
  add constraint profiles_onboarding_step_check check (onboarding_step between 0 and 6);
