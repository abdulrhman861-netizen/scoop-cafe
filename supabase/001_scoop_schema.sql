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
