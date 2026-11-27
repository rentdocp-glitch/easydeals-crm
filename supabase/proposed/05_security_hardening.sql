-- PROPOSED, NOT APPLIED. Needs Ashok's approval before running.
-- Security hardening from the AI Hub security review (Supabase advisor findings).
-- Changes PERMISSIONS only. No table data, RLS policy, trigger or function body is changed.
-- Safe to run twice. ROLLBACK block at the end restores the old permissions exactly.
--
-- 1) Logged-out visitors (role "anon") can call 33 SECURITY DEFINER functions today.
--    After this, anon keeps only the 3 functions that are meant to work without a login and check a secret key:
--      ingest_lead  (portal lead intake)   caller_id / call_missed  (Android caller-ID with device key)
--    Logged-in users (role "authenticated") keep every function they have today, so the CRM works the same.
-- 2) View emp_props runs with its creator's rights. It is not used by the app; make it respect the viewer's RLS
--    and remove anon access.
-- 3) Pin search_path on 7 functions (advisor "function_search_path_mutable").

begin;

do $$
declare f record;
  keep_anon text[] := array['ingest_lead','caller_id','call_missed'];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.proname = any (array['approve_dup','auto_assign','ed_archive_lead','ed_area_exact','ed_block_dealclosed',
        'ed_guard_role_change','ed_is_admin','ed_is_staff','ed_link_area','ed_log_assign','ed_log_status','ed_save_invoice',
        'ed_status_by','ed_unique_phone','enq_counts','merge_leads','my_role','new_user','prop_leads','reject_dup',
        'request_dup','rls_auto_enable','rm_by_property','rm_prop_changed','share_lead','transfer_lead','unassign_leads',
        'unshare_lead','wa_sent_today','wa_set'])
      and not (p.proname = any (keep_anon))
  loop
    -- authenticated + service_role keep access explicitly, then PUBLIC/anon lose it
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;

-- 2) emp_props: respect RLS of the person reading it; no anon access
alter view if exists public.emp_props set (security_invoker = on);
revoke all on public.emp_props from anon;

-- 3) fixed search_path
alter function public.area_lead_counts() set search_path = public;
alter function public.ed_norm(text)      set search_path = public;
alter function public.ed_p10(text)       set search_path = public;
alter function public.ed_touch()         set search_path = public;
alter function public.filt_values()      set search_path = public;
alter function public.lead_counts()      set search_path = public;
alter function public.leads_track()      set search_path = public;

commit;

-- CHECK after running (should list only call_missed, caller_id, ingest_lead):
-- select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'execute') order by 1;

-- ROLLBACK (restores today's permissions):
-- begin;
-- do $$ declare f record; begin
--   for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' and p.prosecdef and p.proname = any (array['approve_dup','auto_assign','ed_archive_lead',
--       'ed_area_exact','ed_block_dealclosed','ed_guard_role_change','ed_is_admin','ed_is_staff','ed_link_area','ed_log_assign',
--       'ed_log_status','ed_save_invoice','ed_status_by','ed_unique_phone','enq_counts','merge_leads','my_role','new_user',
--       'prop_leads','reject_dup','request_dup','rls_auto_enable','rm_by_property','rm_prop_changed','share_lead',
--       'transfer_lead','unassign_leads','unshare_lead','wa_sent_today','wa_set']) loop
--     execute format('grant execute on function %s to public, anon, authenticated, service_role', f.sig);
--   end loop; end $$;
-- alter view if exists public.emp_props reset (security_invoker);
-- grant all on public.emp_props to anon;
-- alter function public.area_lead_counts() reset search_path; alter function public.ed_norm(text) reset search_path;
-- alter function public.ed_p10(text) reset search_path; alter function public.ed_touch() reset search_path;
-- alter function public.filt_values() reset search_path; alter function public.lead_counts() reset search_path;
-- alter function public.leads_track() reset search_path;
-- commit;
