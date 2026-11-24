-- PROPOSED (not applied). Keeps a copy of every deleted owner lead with its history, so a delete can be undone by hand.
-- Additive only: new table + trigger. The CRM code does not need any change.
-- Safe to run twice. Validated on local Postgres 16 (see supabase/proposed/tests/).

-- PRE-CHECK: stop here (nothing created) if leads.id is not an integer type.
do $$ declare t text; begin
  select data_type into t from information_schema.columns where table_schema='public' and table_name='leads' and column_name='id';
  if t is null or t not in ('bigint','integer') then raise exception 'leads.id is % - script expects bigint/integer, not applied', t; end if;
end $$;
create table if not exists public.lead_archive (
  id          bigserial primary key,
  lead_id     bigint,
  lead        jsonb not null,          -- the full lead row
  related     jsonb,                   -- calls, device_calls, lead_assignment_log, lead_shares at delete time
  deleted_by  uuid default auth.uid(),
  deleted_at  timestamptz default now()
);
alter table public.lead_archive enable row level security;
drop policy if exists admin_read on public.lead_archive;
create policy admin_read on public.lead_archive for select to authenticated using (public.ed_is_admin());
-- no insert/update/delete policy: only the trigger (security definer) writes here.
revoke all on public.lead_archive from anon;
revoke insert, update, delete, truncate on public.lead_archive from authenticated;
grant select on public.lead_archive to authenticated;

create or replace function public.ed_archive_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare rel jsonb := '{}'::jsonb;
begin
  begin rel := rel || jsonb_build_object('calls',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.calls c where c.lead_id=old.id)); exception when others then null; end;
  begin rel := rel || jsonb_build_object('device_calls',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.device_calls d where d.lead_id=old.id)); exception when others then null; end;
  begin rel := rel || jsonb_build_object('lead_assignment_log',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.lead_assignment_log a where a.lead_id=old.id)); exception when others then null; end;
  begin rel := rel || jsonb_build_object('lead_shares',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.lead_shares s where s.lead_id=old.id)); exception when others then null; end;
  insert into public.lead_archive(lead_id, lead, related) values (old.id, to_jsonb(old), rel);
  return old;
end $$;
drop trigger if exists a_archive_lead on public.leads;
create trigger a_archive_lead before delete on public.leads for each row execute function public.ed_archive_lead();

-- RESTORE one lead (admin, SQL editor): insert the saved row back.
-- insert into public.leads overriding system value
--   select * from jsonb_populate_record(null::public.leads, (select lead from public.lead_archive where lead_id=<ID> order by id desc limit 1));
-- ("overriding system value" is needed only if leads.id is an identity column; harmless otherwise.)
-- (calls can be restored the same way from related->'calls' with jsonb_populate_recordset.)

-- ROLLBACK:
-- drop trigger if exists a_archive_lead on public.leads; drop function if exists public.ed_archive_lead(); -- keep the table (it holds data)
