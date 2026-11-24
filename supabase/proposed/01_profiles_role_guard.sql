-- PROPOSED (not applied). Stops self-promotion: only an admin can change profiles.role.
-- Works whatever the current RLS policy on profiles is. Name changes are not affected.
create or replace function public.ed_guard_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    -- auth.uid() is null for the SQL editor / service role (owner maintenance): allowed.
    if auth.uid() is not null and not public.ed_is_admin() then
      raise exception 'Only an admin can change a role';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists a_guard_role on public.profiles;
create trigger a_guard_role before update on public.profiles for each row execute function public.ed_guard_role_change();

-- TEST (rolls back, changes nothing): replace <telecaller-uuid> with a real telecaller id from profiles.
-- do $$ begin
--   perform set_config('request.jwt.claims','{"sub":"<telecaller-uuid>","role":"authenticated"}',true);
--   set local role authenticated;
--   begin update public.profiles set role='admin' where id='<telecaller-uuid>'; raise notice 'FAIL: role changed';
--   exception when others then raise notice 'PASS: %', sqlerrm; end;
--   reset role; raise exception 'rolled back on purpose';
-- end $$;

-- ROLLBACK:
-- drop trigger if exists a_guard_role on public.profiles; drop function if exists public.ed_guard_role_change();
