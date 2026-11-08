-- Invite-only signup ---------------------------------------------------------------
create table public.invites (
  email text primary key check (email = lower(email)),
  invited_at timestamptz not null default now(),
  note text,
  accepted_at timestamptz
);

alter table public.invites enable row level security;
-- No policies for anon/authenticated: service role only. The auth hook role gets
-- its own narrow select policy below.
create policy invites_auth_admin_select on public.invites
  for select to supabase_auth_admin using (true);

create function public.hook_require_invite(event jsonb) returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.invites
    where email = lower(event->'user'->>'email')
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Pipeline is invite-only. Ask for an invite.'
    )
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant select on public.invites to supabase_auth_admin;
grant execute on function public.hook_require_invite(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_require_invite(jsonb) from anon, authenticated, public;

-- Mark the invite accepted when the profile is created ------------------------------
create function public.mark_invite_accepted() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invites i
     set accepted_at = coalesce(i.accepted_at, now())
    from auth.users u
   where u.id = new.user_id
     and i.email = lower(u.email);
  return new;
end;
$$;

revoke execute on function public.mark_invite_accepted() from public, anon, authenticated;

create trigger on_profile_created_mark_invite
  after insert on public.profiles
  for each row execute function public.mark_invite_accepted();
