-- Phase 4: WhatsApp Cloud API (Easy Deals). Additive only: new tables, nothing existing is changed.
-- Master switch is OFF by default; nothing is ever sent until admin turns it on.
create table if not exists public.wa_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  daily_cap int not null default 50 check (daily_cap between 0 and 5000),
  phone_number_id text,
  waba_id text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.wa_settings (id, enabled, daily_cap, phone_number_id, waba_id)
values (1, false, 50, '1386142974589463', '2116012342361890')
on conflict (id) do nothing;

create table if not exists public.wa_messages (
  id bigserial primary key,
  direction text not null check (direction in ('in','out','status')),
  wa_phone text,                 -- customer phone, last 10 digits
  lead_kind text,                -- 'buyer' | 'lead' | null
  lead_id bigint,
  body text,
  status text,                   -- sent/delivered/read/failed (for out/status)
  wa_msg_id text,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists wa_messages_phone_idx on public.wa_messages (wa_phone, created_at desc);
create index if not exists wa_messages_day_idx on public.wa_messages (created_at, direction);

alter table public.wa_settings enable row level security;
alter table public.wa_messages enable row level security;
drop policy if exists admin_all on public.wa_settings;
create policy admin_all on public.wa_settings for all to authenticated using (ed_is_admin()) with check (ed_is_admin());
drop policy if exists admin_all on public.wa_messages;
create policy admin_all on public.wa_messages for all to authenticated using (ed_is_admin()) with check (ed_is_admin());

-- Count of messages we sent today (IST) — used for the daily cap.
create or replace function public.wa_sent_today() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.wa_messages
  where direction = 'out' and created_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')
$$;
grant execute on function public.wa_sent_today() to authenticated;

-- Admin-only update of the master switch / daily cap.
create or replace function public.wa_set(p_enabled boolean, p_cap int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not ed_is_admin() then raise exception 'only admin'; end if;
  update public.wa_settings set enabled = p_enabled, daily_cap = greatest(0, least(coalesce(p_cap, daily_cap), 5000)),
    updated_by = auth.uid(), updated_at = now() where id = 1;
end $$;
grant execute on function public.wa_set(boolean, int) to authenticated;
