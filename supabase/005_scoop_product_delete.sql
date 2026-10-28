-- Upgrade 1.5: manager product deletion, protected history and linked offers.
-- Safe to rerun; does not remove orders, products or accounts.
begin;
create or replace function public.scoop_catalog(p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
 cats jsonb;
 cid text;
 cname text;
begin
 perform pg_advisory_xact_lock(1396916047, 1);
 select data into cats from public.scoop_records where id='categories';
 cats := coalesce(cats,'[{"id":"hot","name":"مشروبات ساخنة"},{"id":"cold","name":"مشروبات باردة"},{"id":"bakery","name":"مخبوزات ومعجنات"}]'::jsonb);
 if p_action='remove_product' then
  cid := p_payload->>'id';
  if not exists(select 1 from public.scoop_records where id='product:'||cid and kind='product' and coalesce(data->>'deleted','false')<>'true') then
   raise exception 'product_not_found' using errcode='22023';
  end if;
  update public.scoop_records set data=data||jsonb_build_object('deleted',true,'available',false,'deletedAt',now()) where id='product:'||cid and kind='product';
  update public.scoop_records set data=data||jsonb_build_object('enabled',false)
   where kind='offer' and exists(select 1 from jsonb_array_elements(coalesce(data->'items','[]'::jsonb)) i where i->>'productId'=cid);
  return jsonb_build_object('ok',true);
 elsif p_action='availability' then
  cid := p_payload->>'id';
  update public.scoop_records set data=jsonb_set(data,'{available}',to_jsonb(coalesce((p_payload->>'available')::boolean,false)))
   where id='product:'||cid and kind='product' and coalesce(data->>'deleted','false')<>'true';
  if not found then raise exception 'product_not_found' using errcode='22023'; end if;
  return jsonb_build_object('ok',true);
 elsif p_action='product' then
  if exists(select 1 from public.scoop_records where id='product:'||(p_payload->>'id') and data->>'deleted'='true') then
   raise exception 'product_deleted' using errcode='22023';
  end if;
  if not exists(select 1 from jsonb_array_elements(cats) c where c->>'id'=p_payload->>'category') then
   raise exception 'invalid_category' using errcode='22023';
  end if;
  insert into public.scoop_records(id,kind,data) values('product:'||(p_payload->>'id'),'product',p_payload)
   on conflict(id) do update set data=excluded.data;
  return jsonb_build_object('ok',true);
 elsif p_action='save' then
  cid := coalesce(nullif(p_payload->>'id',''),gen_random_uuid()::text);
  cname := btrim(p_payload->>'name');
  if cname is null or length(cname)<1 or length(cname)>60 or length(cid)>80 then
   raise exception 'invalid_category' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(cats) c where lower(btrim(c->>'name'))=lower(cname) and c->>'id'<>cid) then
   raise exception 'duplicate_category' using errcode='22023';
  end if;
  if p_payload ? 'id' then
   if not exists(select 1 from jsonb_array_elements(cats) c where c->>'id'=cid) then
    raise exception 'category_not_found' using errcode='22023';
   end if;
   select jsonb_agg(case when c->>'id'=cid then jsonb_build_object('id',cid,'name',cname) else c end order by pos)
    into cats from jsonb_array_elements(cats) with ordinality as v(c,pos);
  else
   if jsonb_array_length(cats)>=50 then raise exception 'category_limit' using errcode='22023'; end if;
   cats := cats || jsonb_build_array(jsonb_build_object('id',cid,'name',cname));
  end if;
 elsif p_action='remove' then
  cid := p_payload->>'id';
  if not exists(select 1 from jsonb_array_elements(cats) c where c->>'id'=cid) then
   raise exception 'category_not_found' using errcode='22023';
  end if;
  if jsonb_array_length(cats)<=1 then raise exception 'last_category' using errcode='22023'; end if;
  if exists(select 1 from public.scoop_records where kind='product' and data->>'category'=cid and coalesce(data->>'deleted','false')<>'true') then
   raise exception 'category_has_products' using errcode='22023';
  end if;
  select jsonb_agg(c order by pos) into cats from jsonb_array_elements(cats) with ordinality as v(c,pos) where c->>'id'<>cid;
 else
  raise exception 'invalid_action' using errcode='22023';
 end if;
 insert into public.scoop_records(id,kind,data) values('categories','categories',cats)
  on conflict(id) do update set data=excluded.data;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.scoop_catalog(text,jsonb) from public,anon,authenticated;
grant execute on function public.scoop_catalog(text,jsonb) to service_role;
commit;
