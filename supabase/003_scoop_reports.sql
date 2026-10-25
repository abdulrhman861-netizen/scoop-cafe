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
