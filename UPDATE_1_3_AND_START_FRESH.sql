-- SCOOP 1.3 — تشغيل لمرة واحدة قبل الإطلاق فقط
-- يضيف إدارة الأقسام ثم يؤرشف ويصفر جميع الطلبات ويوقف استقبال الطلبات حتى تجهيز المنيو.

-- Upgrade 1.3: categories and product writes share a transaction lock.
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
 if p_action='product' then
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
  if exists(select 1 from public.scoop_records where kind='product' and data->>'category'=cid) then
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


-- ONE-TIME LAUNCH RESET, explicitly requested by the owner.
-- Archives all existing orders, clears live orders, restarts the queue at 1,
-- and pauses customer orders while the staff finish entering the menu.
-- Accounts, products, images, categories, offers and settings are retained.
-- Do not run this again after accepting real customer orders.
begin;
lock table public.scoop_orders in access exclusive mode;
create table if not exists public.scoop_launch_order_archive (
 launch_id uuid not null,
 archived_at timestamptz not null default now(),
 order_record jsonb not null
);
alter table public.scoop_launch_order_archive enable row level security;
revoke all on public.scoop_launch_order_archive from public,anon,authenticated;
grant all on public.scoop_launch_order_archive to service_role;
insert into public.scoop_launch_order_archive(launch_id,order_record)
 select batch.id,to_jsonb(o) from public.scoop_orders o cross join (select gen_random_uuid() as id) batch;
truncate table public.scoop_orders restart identity;
insert into public.scoop_records(id,kind,data)
 values('settings','settings','{"open":false,"phone":"","instagram":"","deliveryFee":0,"deliveryEnabled":true}'::jsonb)
 on conflict(id) do update set data=jsonb_set(scoop_records.data,'{open}','false'::jsonb);
commit;
select 'تم تصفير الطلبات وحفظ أرشيفها. الطلب التالي رقمه 1. أكمل المنيو ثم فعّل استقبال الطلبات.' as result;
