-- 05 SECURITY HARDENING (PROPOSED, NOT APPLIED). Needs Ashok's approval before it runs on the live project.
-- What it does (no data is read, changed or deleted; no table, column, status or workflow changes):
--   A) Logged-out visitors (role anon) can no longer call 16 CRM functions they never need.
--      Logged-in staff keep exactly the access they have today (each function still does its own admin/owner check).
--      NOT touched: caller_id, call_missed, ingest_lead (the Android app and portal ingest call these with their own key),
--      my_role, ed_is_admin, ed_is_staff (used inside security rules), and all trigger functions.
--   B) View emp_props runs with the caller's permissions instead of its owner's (Supabase advisor ERROR). No code reads it.
--   C) 7 helper functions get a fixed search_path (Supabase advisor WARN). Behaviour is the same.
-- Rollback: section at the bottom.
begin;

do $$
declare f text;
begin
  foreach f in array array[
    'public.enq_counts()','public.wa_sent_today()','public.ed_area_exact(text)',
    'public.approve_dup(bigint)','public.reject_dup(bigint,text)','public.request_dup(jsonb,text)',
    'public.merge_leads(bigint,bigint)','public.unassign_leads(bigint[],text)',
    'public.share_lead(bigint,uuid)','public.unshare_lead(bigint,uuid)','public.transfer_lead(bigint,uuid,text)',
    'public.ed_save_invoice(jsonb)','public.prop_leads(text)','public.wa_set(boolean,integer)',
    'public.lead_counts()','public.filt_values()']
  loop
    if to_regprocedure(f) is null then raise notice 'skip (not found): %', f; continue; end if;
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

do $$ begin
  if to_regclass('public.emp_props') is not null then
    execute 'alter view public.emp_props set (security_invoker = true)';
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.ed_p10(text)','public.leads_track()','public.ed_norm(text)','public.ed_touch()',
    'public.filt_values()','public.lead_counts()','public.area_lead_counts()']
  loop
    if to_regprocedure(f) is null then raise notice 'skip (not found): %', f; continue; end if;
    execute format('alter function %s set search_path = public, extensions', f);
  end loop;
end $$;

commit;

-- CHECK after running (expect anon=false, authenticated=true for every row):
-- select p.oid::regprocedure, has_function_privilege('anon',p.oid,'execute') anon,
--        has_function_privilege('authenticated',p.oid,'execute') authenticated
-- from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('enq_counts','wa_set','merge_leads');

-- ROLLBACK (restores today's state):
-- begin;
-- do $$ declare f text; begin foreach f in array array['public.enq_counts()','public.wa_sent_today()','public.ed_area_exact(text)',
--   'public.approve_dup(bigint)','public.reject_dup(bigint,text)','public.request_dup(jsonb,text)','public.merge_leads(bigint,bigint)',
--   'public.unassign_leads(bigint[],text)','public.share_lead(bigint,uuid)','public.unshare_lead(bigint,uuid)',
--   'public.transfer_lead(bigint,uuid,text)','public.ed_save_invoice(jsonb)','public.prop_leads(text)','public.wa_set(boolean,integer)',
--   'public.lead_counts()','public.filt_values()']
--   loop if to_regprocedure(f) is not null then execute format('grant execute on function %s to public, anon', f); end if; end loop; end $$;
-- alter view public.emp_props set (security_invoker = false);
-- (search_path: 'alter function ... reset search_path' for the 7 functions)
-- commit;
