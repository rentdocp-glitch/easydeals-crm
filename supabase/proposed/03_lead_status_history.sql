-- PROPOSED (not applied). Status history for owner leads: one row per status change.
create table if not exists public.lead_status_log (
  id bigserial primary key, lead_id bigint not null, old_status text, new_status text,
  by_id uuid default auth.uid(), at timestamptz default now()
);
create index if not exists lead_status_log_lead_idx on public.lead_status_log(lead_id, at desc);
alter table public.lead_status_log enable row level security;
drop policy if exists read_own_or_admin on public.lead_status_log;
-- Visible to anyone who can see the lead (re-uses the leads RLS through a sub-select).
create policy read_own_or_admin on public.lead_status_log for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_status_log.lead_id));
create or replace function public.ed_log_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.lead_status_log(lead_id, old_status, new_status) values (new.id, old.status, new.status);
  end if;
  return new;
end $$;
drop trigger if exists z_log_status on public.leads;
create trigger z_log_status after update of status on public.leads for each row execute function public.ed_log_status();
-- ROLLBACK: drop trigger if exists z_log_status on public.leads; drop function if exists public.ed_log_status(); -- keep table
