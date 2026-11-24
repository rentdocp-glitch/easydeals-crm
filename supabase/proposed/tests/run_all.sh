#!/bin/bash
# LOCAL TEST ONLY: needs a throwaway Postgres. Usage: PGHOST=/tmp/pg PGPORT=5499 ./run_all.sh
set -e; cd "$(dirname "$0")"; P="psql -U postgres -X -q"
$P -c "drop database if exists edtest" -c "create database edtest"
$P -d edtest -v ON_ERROR_STOP=1 -f 00_fake_supabase.sql
for i in 1 2; do echo "--- apply pass $i (must be clean both times) ---"
  for f in ../01_profiles_role_guard.sql ../02_lead_archive_on_delete.sql ../03_lead_status_history.sql; do $P -d edtest -v ON_ERROR_STOP=1 -f $f; done; done
$P -d edtest -f run_tests.sql 2>&1
echo "--- rollback scripts ---"
$P -d edtest -v ON_ERROR_STOP=1 -c "drop trigger if exists a_guard_role on public.profiles; drop function if exists public.ed_guard_role_change();
 drop trigger if exists a_archive_lead on public.leads; drop function if exists public.ed_archive_lead();
 drop trigger if exists z_log_status on public.leads; drop function if exists public.ed_log_status();"
$P -d edtest -c "select tgname from pg_trigger where not tgisinternal" -c "select count(*) leads_untouched from public.leads"
echo "--- pre-check: uuid leads.id must refuse ---"
$P -c "drop database if exists edtest2" -c "create database edtest2"
$P -d edtest2 -c "create schema auth; create function auth.uid() returns uuid language sql as 'select null::uuid'; create table public.leads(id uuid primary key);" >/dev/null
$P -d edtest2 -f ../02_lead_archive_on_delete.sql -v ON_ERROR_STOP=1 2>&1 | head -2 || true
$P -d edtest2 -c "select to_regclass('public.lead_archive') as should_be_null"
