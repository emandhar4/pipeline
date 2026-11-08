-- Owners may read and edit their own profile, but not insert/delete it, and
-- not change ai_mode (an owner/admin decision), user_id or the timestamps.
-- handle_new_user is security definer, so it still inserts the profile row.
-- The set_updated_at trigger runs as the table owner's trigger and is unaffected
-- by column grants.
revoke insert, delete on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (
  career_stage, school, major, grad_date, work_auth, home_location,
  school_location, in_state_school, relocate, pay_floor_cents,
  pay_floor_period, season, alert_style, onboarding_step
) on public.profiles to authenticated;
