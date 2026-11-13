-- Team access: admin can tick which employees get the Properties page.
create table if not exists public.team_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  props boolean not null default false
);
alter table public.team_access enable row level security;
drop policy if exists admin_all on public.team_access;
create policy admin_all on public.team_access for all to authenticated using (ed_is_admin()) with check (ed_is_admin());
drop policy if exists own_read on public.team_access;
create policy own_read on public.team_access for select to authenticated using (user_id = auth.uid());

-- All buyer leads of one property, only for admin or employees with props access.
create or replace function public.prop_leads(pid text) returns json
language sql security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select b.buyer_name, b.buyer_phone, b.lead_date, b.status, b.source
    from public.buyer_leads b
    where b.property_id = pid
      and (ed_is_admin() or exists (select 1 from public.team_access t where t.user_id = auth.uid() and t.props))
    order by b.lead_date desc, b.id desc
  ) x $$;
grant execute on function public.prop_leads(text) to authenticated;
