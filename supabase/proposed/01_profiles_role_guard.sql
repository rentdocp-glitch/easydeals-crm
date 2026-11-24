-- PROPOSED (not applied). Stops self-promotion: only an admin can change profiles.role.
-- Works whatever the current RLS policy on profiles is. Name changes are not affected.
-- Safe to run twice. Validated on local Postgres 16 (see supabase/proposed/tests/).
-- Needs: public.ed_is_admin() (from phase2_1_setup_tables.sql).

create or replace function public.ed_guard_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the SQL editor / service role / signup trigger (owner maintenance): allowed.
  if auth.uid() is null or public.ed_is_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    raise exception 'Only an admin can change a role';
  end if;
  if tg_op = 'INSERT' and new.role = 'admin' then
    raise exception 'Only an admin can create an admin profile';
  end if;
  return new;
end $$;

drop trigger if exists a_guard_role on public.profiles;
create trigger a_guard_role before insert or update on public.profiles
  for each row execute function public.ed_guard_role_change();

-- LIVE TEST (rolls back, changes nothing): replace <telecaller-uuid> with a real telecaller id from profiles.
-- begin;
--   select set_config('request.jwt.claims','{"sub":"<telecaller-uuid>","role":"authenticated"}',true);
--   set local role authenticated;
--   update public.profiles set role='admin' where id='<telecaller-uuid>';   -- expected: ERROR Only an admin can change a role
-- rollback;

-- ROLLBACK:
-- drop trigger if exists a_guard_role on public.profiles; drop function if exists public.ed_guard_role_change();
