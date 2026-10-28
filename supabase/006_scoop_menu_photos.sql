-- Changes only the image field of selected live products, atomically.
begin;
create or replace function public.scoop_apply_menu_photos(p_photos jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
 p jsonb;
 applied jsonb := '[]'::jsonb;
 skipped jsonb := '[]'::jsonb;
begin
 if jsonb_typeof(p_photos)<>'array' or jsonb_array_length(p_photos)>100 then
  raise exception 'invalid_photos' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(1396916047, 1);
 for p in select value from jsonb_array_elements(p_photos) loop
  if coalesce(p->>'image','') !~ '^/menu-photos/[a-z0-9-]+[.]webp$' or coalesce(p->>'id','')='' then
   raise exception 'invalid_photos' using errcode='22023';
  end if;
  update public.scoop_records set data=jsonb_set(data,'{image}',p->'image')
   where id='product:'||(p->>'id') and kind='product'
    and coalesce(data->>'deleted','false')<>'true'
    and data->>'name'=p->>'expectedName'
    and coalesce(data->>'image','')=coalesce(p->>'expectedImage','');
  if found then applied:=applied||jsonb_build_array(p->>'id');
  else skipped:=skipped||jsonb_build_array(p->>'id'); end if;
 end loop;
 return jsonb_build_object('applied',applied,'skipped',skipped);
end;
$$;
revoke all on function public.scoop_apply_menu_photos(jsonb) from public,anon,authenticated;
grant execute on function public.scoop_apply_menu_photos(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
