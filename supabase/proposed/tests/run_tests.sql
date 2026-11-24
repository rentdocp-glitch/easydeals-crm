-- LOCAL TEST ONLY. Run after 00_fake_supabase.sql and the 3 proposed scripts.
\set ON_ERROR_STOP 0
\pset footer off
\set TELE '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}'
\set ADMIN '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}'
\echo === T1 telecaller self-promote (expect ERROR Only an admin) ===
begin; select set_config('request.jwt.claims',:'TELE',true); set local role authenticated;
update public.profiles set role='admin' where id='00000000-0000-0000-0000-00000000000b'; rollback;
\echo === T2 telecaller rename self (expect UPDATE 1) ===
begin; select set_config('request.jwt.claims',:'TELE',true); set local role authenticated;
update public.profiles set name='Tele 2' where id='00000000-0000-0000-0000-00000000000b'; select name as t2_name from public.profiles where id='00000000-0000-0000-0000-00000000000b'; rollback;
\echo === T3 telecaller insert admin profile (expect ERROR) ===
begin; select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000d"}',true); set local role authenticated;
insert into public.profiles values ('00000000-0000-0000-0000-00000000000d','X','admin'); rollback;
\echo === T4 admin changes FE to telecaller (expect UPDATE 1) ===
begin; select set_config('request.jwt.claims',:'ADMIN',true); set local role authenticated;
update public.profiles set role='telecaller' where id='00000000-0000-0000-0000-00000000000c'; select role as t4_role from public.profiles where id='00000000-0000-0000-0000-00000000000c'; rollback;
\echo === T5 SQL editor (no jwt) changes role (expect UPDATE 1) ===
begin; update public.profiles set role='fe' where id='00000000-0000-0000-0000-00000000000b'; select role as t5_role from public.profiles where id='00000000-0000-0000-0000-00000000000b'; rollback;
\echo === T6 telecaller changes status of own lead -> log row with by_id=tele (expect 1 row) ===
begin; select set_config('request.jwt.claims',:'TELE',true); set local role authenticated;
update public.leads set status='callback' where id=1;
update public.leads set remarks='note only' where id=1;   -- no status change: no new log row
select lead_id, old_status, new_status, by_id from public.lead_status_log;
\echo === T7 telecaller cannot see log of lead B (expect 0) / cannot insert log (expect ERROR) ===
reset role; insert into public.lead_status_log(lead_id,old_status,new_status) values (2,'a','b'); set local role authenticated;
select count(*) as tele_sees_lead_b from public.lead_status_log where lead_id=2;
insert into public.lead_status_log(lead_id,new_status) values (1,'fake'); rollback;
\echo === T8 admin deletes lead 1 -> archive keeps lead + 2 calls + 1 device + 1 log + 1 share ===
begin; select set_config('request.jwt.claims',:'ADMIN',true); set local role authenticated;
delete from public.leads where id=1;
select lead_id, lead->>'name' as name, jsonb_array_length(related->'calls') c, jsonb_array_length(related->'device_calls') d,
  jsonb_array_length(related->'lead_assignment_log') a, jsonb_array_length(related->'lead_shares') s, deleted_by from public.lead_archive;
\echo === T9 telecaller cannot read archive (expect 0) / cannot write it (expect ERROR) ===
select set_config('request.jwt.claims',:'TELE',true);
select count(*) as tele_sees_archive from public.lead_archive;
savepoint sp; insert into public.lead_archive(lead_id,lead) values (9,'{}'); rollback to savepoint sp;
\echo === T10 restore lead 1 + calls from archive (expect lead back, 2 calls) ===
reset role;
insert into public.leads overriding system value select * from jsonb_populate_record(null::public.leads,(select lead from public.lead_archive where lead_id=1 order by id desc limit 1));
insert into public.calls select * from jsonb_populate_recordset(null::public.calls,(select related->'calls' from public.lead_archive where lead_id=1 order by id desc limit 1));
select l.id, l.name, l.status, (select count(*) from public.calls c where c.lead_id=l.id) calls from public.leads l where id=1;
rollback;
\echo === T11 anon sees nothing in new tables (expect ERROR permission denied x2) ===
begin; set local role anon; select count(*) from public.lead_archive; rollback;
begin; set local role anon; select count(*) from public.lead_status_log; rollback;
