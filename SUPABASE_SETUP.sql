-- SCOOP Cafe: run once in Supabase SQL Editor.
-- Existing categories/products/orders tables are not modified.
begin;
create table if not exists public.scoop_records (
 id text primary key,
 kind text not null,
 data jsonb not null
);
create index if not exists scoop_records_kind_idx on public.scoop_records(kind);
create table if not exists public.scoop_orders (
 id bigint generated always as identity primary key,
 token uuid not null unique,
 nonce text not null unique,
 data jsonb not null,
 status text not null default 'new' check(status in ('new','received','preparing','ready','out','done','cancelled')),
 created timestamptz not null default now()
);
alter table public.scoop_records enable row level security;
alter table public.scoop_orders enable row level security;
revoke all on public.scoop_records,public.scoop_orders from anon,authenticated;
grant all on public.scoop_records,public.scoop_orders to service_role;
grant usage,select on sequence public.scoop_orders_id_seq to service_role;
-- This is an operation allowlist, not an arbitrary SQL execution endpoint.
-- Only the server-side service_role may invoke it.
create or replace function public.scoop_db(p_op text,p_args jsonb default '[]'::jsonb)
returns setof jsonb language plpgsql security invoker set search_path=public as $$
begin
 case p_op
 when 'record_get' then
  return query select jsonb_build_object('data',r.data::text) from public.scoop_records r where r.id=p_args->>0;
 when 'record_put' then
  insert into public.scoop_records(id,kind,data) values(p_args->>0,p_args->>1,(p_args->>2)::jsonb)
   on conflict(id) do update set data=excluded.data;
 when 'record_seed' then
  insert into public.scoop_records(id,kind,data) values(p_args->>0,p_args->>1,(p_args->>2)::jsonb) on conflict(id) do nothing;
 when 'records_kind' then
  return query select jsonb_build_object('id',r.id,'data',r.data::text) from public.scoop_records r where r.kind=p_args->>0 order by r.id;
 when 'record_delete' then
  delete from public.scoop_records r where r.id=p_args->>0 and r.kind=p_args->>1;
 when 'order_insert' then
  insert into public.scoop_orders(token,nonce,data,status,created) values((p_args->>0)::uuid,p_args->>1,(p_args->>2)::jsonb,p_args->>3,(p_args->>4)::timestamptz) on conflict(nonce) do nothing;
 when 'order_nonce' then
  return query select jsonb_build_object('id',o.id,'token',o.token) from public.scoop_orders o where o.nonce=p_args->>0;
 when 'order_track' then
  return query select jsonb_build_object('id',o.id,'data',o.data::text,'status',o.status,'created',o.created) from public.scoop_orders o where o.token=(p_args->>0)::uuid;
 when 'orders_list' then
  return query select jsonb_build_object('id',o.id,'token',o.token,'nonce',o.nonce,'data',o.data::text,'status',o.status,'created',o.created) from public.scoop_orders o order by o.id desc limit 200;
 when 'order_get' then
  return query select jsonb_build_object('id',o.id,'data',o.data::text,'status',o.status) from public.scoop_orders o where o.id=(p_args->>0)::bigint;
 when 'order_status' then
  return query with updated as(update public.scoop_orders o set status=p_args->>0 where o.id=(p_args->>1)::bigint and o.status=p_args->>2 returning o.id) select jsonb_build_object('id',updated.id) from updated;
 when 'order_data' then
  update public.scoop_orders o set data=(p_args->>0)::jsonb where o.id=(p_args->>1)::bigint;
 when 'sessions_cleanup' then
  delete from public.scoop_records r where r.kind='session' and (r.data->>'expires')::bigint<(p_args->>0)::bigint;
 when 'login_attempt' then
  return query with updated as(
   insert into public.scoop_records(id,kind,data) values(p_args->>0,'authLimit',jsonb_build_object('count',1,'until',(p_args->>1)::bigint))
   on conflict(id) do update set data=case when (scoop_records.data->>'until')::bigint<(p_args->>2)::bigint then excluded.data else jsonb_set(scoop_records.data,'{count}',to_jsonb((scoop_records.data->>'count')::integer+1)) end returning data
  ) select jsonb_build_object('data',updated.data::text) from updated;
 else raise exception 'Unsupported SCOOP operation';
 end case;
 return;
end;
$$;
revoke all on function public.scoop_db(text,jsonb) from public,anon,authenticated;
grant execute on function public.scoop_db(text,jsonb) to service_role;
commit;

-- Private bucket. Images are served through the application's /api/image route.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('scoop-images','scoop-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
-- No anonymous Storage upload policy is created.

-- Manager reports across all orders in the selected period, not only the last 200.
begin;
create index if not exists scoop_orders_created_idx on public.scoop_orders(created);
create or replace function public.scoop_reports(p_from date,p_to date,p_source text default 'web')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 if p_from is null or p_to is null or p_to<p_from or p_to>p_from+365 or p_source not in ('web','all') then
  raise exception 'Invalid report period or source';
 end if;
 with scoped as (
  select o.id,o.status,o.data,(o.created at time zone 'Asia/Baghdad')::date as day,
   coalesce((o.data->>'total')::numeric,0) as total,
   coalesce((o.data->>'paid')::boolean,false) as paid
  from public.scoop_orders o
  where o.created >= (p_from::timestamp at time zone 'Asia/Baghdad')
   and o.created < ((p_to+1)::timestamp at time zone 'Asia/Baghdad')
   and coalesce(o.data->>'kind','')<>'queue'
   and (p_source='all' or o.data->>'source'='web')
 ), summary as (
  select count(*) as orders,
   count(*) filter(where status='cancelled') as cancelled,
   count(*) filter(where status='done') as completed,
   count(*) filter(where status not in ('done','cancelled')) as pending,
   coalesce(sum(total) filter(where status<>'cancelled'),0) as order_value,
   coalesce(sum(total) filter(where status<>'cancelled' and paid),0) as collected
  from scoped
 ), daily as (
  select d::date as day,count(s.id) as orders,
   count(s.id) filter(where s.status='cancelled') as cancelled,
   count(s.id) filter(where s.status='done') as completed,
   coalesce(sum(s.total) filter(where s.status<>'cancelled'),0) as order_value,
   coalesce(sum(s.total) filter(where s.status<>'cancelled' and s.paid),0) as collected
  from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d
  left join scoped s on s.day=d::date group by d::date order by d::date desc
 ), components as (
  select s.id,btrim(c->>'name') as name,
   coalesce((i->>'qty')::integer,1)*coalesce((c->>'qty')::integer,1) as quantity
  from scoped s
  cross join lateral jsonb_array_elements(coalesce(s.data->'items','[]'::jsonb)) i
  cross join lateral jsonb_array_elements(case when coalesce((i->>'offer')::boolean,false)
    then coalesce(i->'bundleItems','[]'::jsonb)
    else jsonb_build_array(jsonb_build_object('name',i->>'name','qty',1)) end) c
  where s.status<>'cancelled'
 ), ranked as (
  select name,sum(quantity) as quantity,count(distinct id) as orders
  from components where name is not null and name<>'' group by name
  order by quantity desc,orders desc,name
 )
 select jsonb_build_object('from',p_from,'to',p_to,'source',p_source,'timezone','Asia/Baghdad',
  'summary',(select to_jsonb(summary) from summary),
  'daily',coalesce((select jsonb_agg(to_jsonb(daily) order by day desc) from daily),'[]'::jsonb),
  'items',coalesce((select jsonb_agg(to_jsonb(ranked) order by quantity desc,orders desc,name) from ranked),'[]'::jsonb)) into result;
 return result;
end;
$$;
revoke all on function public.scoop_reports(date,date,text) from public,anon,authenticated;
grant execute on function public.scoop_reports(date,date,text) to service_role;
commit;


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
