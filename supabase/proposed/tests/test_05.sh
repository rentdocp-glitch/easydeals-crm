#!/bin/bash
# LOCAL TEST ONLY for 05_security_hardening.sql: throwaway Postgres with stub functions of the same signatures.
# Usage: PGHOST=/tmp/pg PGPORT=5499 ./test_05.sh
set -e; cd "$(dirname "$0")"; P="psql -U postgres -X -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists ed05" -c "create database ed05" >/dev/null
$P -d ed05 <<'SQL'
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
create schema if not exists extensions;
create table public.leads(id bigint primary key, status text);
create function public.enq_counts() returns int language sql security definer as 'select 1';
create function public.wa_sent_today() returns int language sql security definer as 'select 0';
create function public.ed_area_exact(text) returns int language sql security definer as 'select 1';
create function public.approve_dup(bigint) returns void language sql security definer as 'select';
create function public.reject_dup(bigint,text) returns void language sql security definer as 'select';
create function public.request_dup(jsonb,text) returns void language sql security definer as 'select';
create function public.merge_leads(bigint,bigint) returns void language sql security definer as 'select';
create function public.unassign_leads(bigint[],text) returns int language sql security definer as 'select 0';
create function public.share_lead(bigint,uuid) returns void language sql security definer as 'select';
create function public.unshare_lead(bigint,uuid) returns void language sql security definer as 'select';
create function public.transfer_lead(bigint,uuid,text) returns text language sql security definer as 'select ''x''';
create function public.ed_save_invoice(jsonb) returns int language sql security definer as 'select 1';
create function public.prop_leads(text) returns json language sql security definer as 'select ''[]''::json';
create function public.wa_set(boolean,integer) returns void language sql security definer as 'select';
create function public.lead_counts() returns int language sql as 'select 1';
create function public.filt_values() returns int language sql as 'select 1';
create function public.area_lead_counts() returns int language sql as 'select 1';
create function public.ed_p10(text) returns text language sql immutable as 'select right($1,10)';
create function public.ed_norm(text) returns text language sql immutable as 'select lower($1)';
create function public.ed_touch() returns trigger language plpgsql as 'begin return new; end';
create function public.leads_track() returns trigger language plpgsql as 'begin return new; end';
create function public.caller_id(text,text) returns int language sql security definer as 'select 1';
create view public.emp_props as select id from public.leads;
grant execute on all functions in schema public to anon, authenticated;
SQL
echo "--- apply twice (must be clean both times)"; $P -d ed05 -f ../05_security_hardening.sql; $P -d ed05 -f ../05_security_hardening.sql
$P -d ed05 -At <<'SQL'
select 'A anon blocked: '||bool_and(not has_function_privilege('anon',p.oid,'execute'))||' | authenticated kept: '||bool_and(has_function_privilege('authenticated',p.oid,'execute'))
 from pg_proc p where pronamespace='public'::regnamespace and proname in ('enq_counts','wa_sent_today','ed_area_exact','approve_dup','reject_dup','request_dup','merge_leads','unassign_leads','share_lead','unshare_lead','transfer_lead','ed_save_invoice','prop_leads','wa_set','lead_counts','filt_values');
select 'A caller_id untouched for anon (Android app): '||has_function_privilege('anon','public.caller_id(text,text)','execute');
select 'B emp_props security_invoker: '||coalesce((select option_value from pg_options_to_table((select reloptions from pg_class where oid='public.emp_props'::regclass)) where option_name='security_invoker'),'none');
select 'C search_path set on 7: '||count(*) from pg_proc where pronamespace='public'::regnamespace and proconfig::text like '%search_path%';
select 'D data untouched: leads rows '||count(*) from public.leads;
SQL
