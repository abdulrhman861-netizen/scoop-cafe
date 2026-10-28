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
