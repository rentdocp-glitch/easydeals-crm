-- EasyDeals CRM - STEP 5: onboarding form photos ka Drive folder link property mein save karna
create or replace function public.ed_set_photos(pid text, folder text, n int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not ed_is_staff() then raise exception 'not allowed'; end if;
  update properties
     set photos_url = coalesce(nullif(folder,''), photos_url),
         details = coalesce(details,'{}'::jsonb) || jsonb_build_object('photo_count', n, 'photos_at', now())
   where id = pid and (ed_is_admin() or created_by = auth.uid());
end $$;
revoke all on function public.ed_set_photos(text,text,int) from public, anon;
grant execute on function public.ed_set_photos(text,text,int) to authenticated;
select 'photo link ready' as status;
