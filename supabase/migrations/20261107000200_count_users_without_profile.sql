-- Test/ops helper: number of auth users lacking a profile row.
create function public.count_users_without_profile() returns bigint
language sql
security definer
set search_path = ''
as $$
  select count(*) from auth.users u
  where not exists (select 1 from public.profiles p where p.user_id = u.id);
$$;

revoke execute on function public.count_users_without_profile() from public, anon, authenticated;
grant execute on function public.count_users_without_profile() to service_role;
