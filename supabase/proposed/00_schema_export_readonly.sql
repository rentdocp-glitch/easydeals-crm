-- READ ONLY. Changes nothing. Run in Supabase SQL Editor and copy each result into supabase/schema_snapshot.sql.
-- 1) Tables and columns
select table_name, string_agg(column_name||' '||data_type||case when is_nullable='NO' then ' not null' else '' end||coalesce(' default '||column_default,''), ', ' order by ordinal_position) as columns
from information_schema.columns where table_schema='public' group by table_name order by table_name;
-- 2) RLS on/off per table
select relname as table_name, relrowsecurity as rls_on, relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1;
-- 3) Policies (the most important part for security review)
select tablename, policyname, cmd, roles::text, qual as using_expr, with_check from pg_policies where schemaname='public' order by tablename, policyname;
-- 4) Functions / RPCs with full source and security mode
select p.proname, pg_get_function_identity_arguments(p.oid) as args, case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end as security, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1;
-- 5) Triggers
select event_object_table as table_name, trigger_name, action_timing, event_manipulation, action_statement from information_schema.triggers where trigger_schema='public' order by 1,2;
-- 6) Foreign keys (what is deleted along with a lead)
select tc.table_name, kcu.column_name, ccu.table_name as refers_to, rc.delete_rule
from information_schema.table_constraints tc join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name
join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name
join information_schema.referential_constraints rc on rc.constraint_name=tc.constraint_name
where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' order by 1;
-- 7) Grants for anon / authenticated
select table_name, grantee, string_agg(privilege_type, ',') from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated') group by 1,2 order by 1,2;
