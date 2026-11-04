-- =====================================================================
-- EasyDeals CRM - STEP 7: Field Exec apni lead dusre FE / Telecaller ko de sake
-- Problem: FE jab "Assign / hand over to" mein dusra FE chunta tha to
-- "new row violates row-level security policy for table leads" aata tha,
-- kyunki FE sirf apni (fe_id = khud) lead badal sakta hai.
-- Hal: ek safe function. Policy nahi badli, baaki sab waisa hi.
-- =====================================================================
create or replace function public.lead_handover(lid bigint, to_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare me_role text; to_role text; l leads%rowtype;
begin
  select role into me_role from profiles where id = auth.uid();
  if me_role is null or me_role not in ('admin','telecaller','fe') then raise exception 'not allowed'; end if;
  select * into l from leads where id = lid;
  if not found then raise exception 'lead not found'; end if;
  -- FE sirf apni lead de sakta hai
  if me_role = 'fe' and l.fe_id is distinct from auth.uid() then raise exception 'not your lead'; end if;
  select role into to_role from profiles where id = to_id;
  if to_role = 'fe' then
    update leads set fe_id = to_id where id = lid;
  elsif to_role = 'telecaller' then
    update leads set tc_id = to_id where id = lid;
  else
    raise exception 'can only hand over to a Field Exec or Telecaller';
  end if;
  return to_role;
end $$;
revoke all on function public.lead_handover(bigint, uuid) from public, anon;
grant execute on function public.lead_handover(bigint, uuid) to authenticated;
select 'handover ready' as status;
