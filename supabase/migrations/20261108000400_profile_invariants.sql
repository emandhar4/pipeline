-- Profile invariants the daily finder relies on.
-- Only onboarding_step nulls are rewritten (to 0); any other violation aborts the migration.

update public.profiles set onboarding_step = 0 where onboarding_step is null;

do $$
declare
  bad_pay int;
  bad_season int;
begin
  select count(*) into bad_pay from public.profiles
    where (pay_floor_cents is null) <> (pay_floor_period is null);
  if bad_pay > 0 then
    raise exception 'profile_invariants: % profile row(s) have only one of pay_floor_cents / pay_floor_period set', bad_pay;
  end if;

  select count(*) into bad_season from public.profiles
    where season is not null and char_length(season) > 50;
  if bad_season > 0 then
    raise exception 'profile_invariants: % profile row(s) have a season longer than 50 characters', bad_season;
  end if;
end $$;

alter table public.profiles
  alter column onboarding_step set not null,
  add constraint profiles_pay_floor_pair_check
    check ((pay_floor_cents is null) = (pay_floor_period is null)),
  add constraint profiles_season_length_check
    check (season is null or char_length(season) <= 50);
