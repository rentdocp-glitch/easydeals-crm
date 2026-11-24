-- PROPOSED (not applied). Status history for owner leads: one row per status change.
-- Safe to run twice. Validated on local Postgres 16 (see supabase/proposed/tests/).
do $$ declare t text; begin
  select data_type into t from information_schema.columns where table_schema='public' and table_name='leads' and column_name='id';
  if t is null or t not in ('bigint','integer') then raise exception 'leads.id is % - script expects bigint/integer, not applied', t; end if;
end $$;
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
revoke all on public.lead_status_log from anon;
revoke insert, update, delete, truncate on public.lead_status_log from authenticated;
grant select on public.lead_status_log to authenticated;
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
