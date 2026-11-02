-- =====================================================================
-- EasyDeals CRM - STEP 4: Paperless property onboarding (test version)
-- properties table mein nayi columns + ek function jo agla ED-ID dekar
-- property save karta hai. Purani tables ko nahi badalta. Do baar safe.
-- =====================================================================

alter table public.properties
  add column if not exists intent        text,      -- Sell / Rent / Both
  add column if not exists wing          text,
  add column if not exists flat_no       text,
  add column if not exists floor_no      text,
  add column if not exists total_floors  text,
  add column if not exists pincode       text,
  add column if not exists landmark      text,
  add column if not exists owner_phone2  text,
  add column if not exists owner_email   text,
  add column if not exists carpet        numeric,
  add column if not exists builtup       numeric,
  add column if not exists super_builtup numeric,
  add column if not exists baths         text,
  add column if not exists balconies     text,
  add column if not exists furnishing    text,
  add column if not exists age_years     text,
  add column if not exists occupancy     text,      -- Self / Tenant / Empty
  add column if not exists available_from text,
  add column if not exists final_price   numeric,   -- sirf andar ke liye
  add column if not exists rent          numeric,
  add column if not exists deposit       numeric,
  add column if not exists maintenance   numeric,
  add column if not exists plan          text,
  add column if not exists plan_amount   numeric,
  add column if not exists payment_mode  text,
  add column if not exists service_till  date,
  add column if not exists photos        text[],    -- storage paths
  add column if not exists details       jsonb,     -- baaki saare optional sawaal
  add column if not exists created_by    uuid,
  add column if not exists source        text;      -- onboarding_form / sheet_import

-- Staff check (admin / telecaller / fe)
create or replace function public.ed_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','telecaller','fe'));
$$;

-- Property save: agla ED-ID khud deta hai, duplicate (same owner phone + society + flat) rokta hai
create or replace function public.onboard_property(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare nid text; dup text; ph text;
begin
  if not ed_is_staff() then raise exception 'not allowed'; end if;
  if coalesce(trim(p->>'owner_name'),'') = '' or coalesce(trim(p->>'project'),'') = '' then
    raise exception 'owner name and society are required';
  end if;
  ph := ed_p10(p->>'owner_phone');
  select id into dup from properties
   where ed_p10(split_part(coalesce(owner_phone,''),'/',1)) = ph and ph <> ''
     and lower(coalesce(project,'')) = lower(coalesce(p->>'project',''))
     and lower(coalesce(flat_no,'')) = lower(coalesce(p->>'flat_no',''))
   limit 1;
  if dup is not null then raise exception 'duplicate: %', dup; end if;
  lock table properties in share row exclusive mode;
  select 'ED-' || lpad((coalesce(max(nullif(regexp_replace(id,'\D','','g'),'')::int),0) + 1)::text, 3, '0')
    into nid from properties;
  insert into properties (id, owner_lead_id, owner_name, owner_phone, owner_phone2, owner_email, project, ptype, bhk,
    address, locality, city, pincode, landmark, wing, flat_no, floor_no, total_floors, intent,
    sqft, carpet, builtup, super_builtup, baths, balconies, furnishing, age_years, occupancy, available_from,
    price, final_price, rent, deposit, maintenance, plan, plan_amount, payment_mode, service_till,
    status, date_added, remarks, photos, details, created_by, source, portal_status)
  values (nid, nullif(p->>'owner_lead_id',''), p->>'owner_name',
    p->>'owner_phone', nullif(p->>'owner_phone2',''), nullif(p->>'owner_email',''),
    p->>'project', coalesce(nullif(p->>'ptype',''),'Flat'), p->>'bhk',
    p->>'address', p->>'locality', coalesce(nullif(p->>'city',''),'Pune'), p->>'pincode', p->>'landmark',
    p->>'wing', p->>'flat_no', p->>'floor_no', p->>'total_floors', p->>'intent',
    nullif(p->>'carpet','')::numeric, nullif(p->>'carpet','')::numeric, nullif(p->>'builtup','')::numeric, nullif(p->>'super_builtup','')::numeric,
    p->>'baths', p->>'balconies', p->>'furnishing', p->>'age_years', p->>'occupancy', p->>'available_from',
    nullif(p->>'price','')::numeric, nullif(p->>'final_price','')::numeric, nullif(p->>'rent','')::numeric,
    nullif(p->>'deposit','')::numeric, nullif(p->>'maintenance','')::numeric,
    p->>'plan', nullif(p->>'plan_amount','')::numeric, p->>'payment_mode', nullif(p->>'service_till','')::date,
    case when p->>'intent' = 'Rent' then 'Available - Rent' else 'Available - Sale' end,
    current_date, p->>'remarks',
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'photos','[]'::jsonb)) x), '{}'),
    p->'details', auth.uid(), 'onboarding_form',
    '99acres: Not listed | Housing: Not listed | Magicbricks: Not listed');
  return nid;
end $$;
revoke all on function public.onboard_property(jsonb) from public, anon;
grant execute on function public.onboard_property(jsonb) to authenticated;

-- Photos: private bucket (staff upload karte hain, admin dekhta hai)
insert into storage.buckets (id, name, public) values ('property-photos', 'property-photos', false)
on conflict (id) do nothing;
drop policy if exists ed_photos_insert on storage.objects;
create policy ed_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'property-photos' and public.ed_is_staff());
drop policy if exists ed_photos_read on storage.objects;
create policy ed_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'property-photos' and public.ed_is_staff());

select 'onboarding ready' as status;
