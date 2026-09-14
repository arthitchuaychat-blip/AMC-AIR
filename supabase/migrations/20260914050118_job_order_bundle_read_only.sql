-- One consistent snapshot of jobs and only their referenced display data.
-- SECURITY INVOKER preserves every existing table's role/row policy.
-- [] explicitly means no jobs. NULL retains the existing all-jobs reader.
set local lock_timeout = '2s';
set local statement_timeout = '15s';
-- Refuse to install this office reader before the tested field boundary.
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='job_orders'
   and policyname='job_orders_field_read_boundary' and permissive='RESTRICTIVE' and cmd='SELECT')
 then raise exception 'Install job_field_read_boundary before job_order_bundle'; end if;
end $$;
create or replace function public.job_order_bundle(p_nos text[] default null)
returns json language sql stable security invoker set search_path = public
as $function$
 with j as materialized (
   select jo.* from public.job_orders jo
   -- Explicit office-role guard in addition to SECURITY INVOKER table RLS.
   -- These roles retain their existing job read access; tech/assistant/lead_tech,
   -- HR, inactive profiles and every other role receive no raw job data.
   where (select public.app_actor_role()) is not null
     and (select public.my_role()) in ('admin','exec','finance','sales','stock','graphic')
     and (p_nos is null or jo.job_no = any(p_nos))
 ), q as materialized (
   select quote_no,boq_no,discount_type,discount_value,vat,created_by
   from public.quotations where quote_no in (select quote_no from j)
 )
 select json_build_object(
   'jobs',coalesce((select json_agg(j order by created_at desc,job_no) from j),'[]'::json),
   'customers',coalesce((select json_agg(x order by id) from (
     select id,name,address from public.customers where id in(select customer_id from j)
   ) x),'[]'::json),
   'teams',coalesce((select json_agg(x) from(select id,name from public.team_directory)x),'[]'::json),
   'sites',coalesce((select json_agg(x order by id) from (
     select id,site_name,address,map_url,contact_name,phone from public.customer_sites where id in(select site_id from j)
   ) x),'[]'::json),
   'contacts',coalesce((select json_agg(x order by id) from (
     select id,customer_id,name,phone from public.customer_contacts where customer_id in(select customer_id from j)
   ) x),'[]'::json),
   'quotes',coalesce((select json_agg(q order by quote_no) from q),'[]'::json),
   'items',coalesce((select json_agg(x order by id) from (
     select id,quote_no,qty,unit_price,discount,kind,name,unit from public.quotation_items where quote_no in(select quote_no from j)
   ) x),'[]'::json),
   'visits',coalesce((select json_agg(v order by visit_date,id) from public.job_visits v where job_no in(select job_no from j)),'[]'::json),
   'creators',coalesce((select json_object_agg(id,name) from public.profiles
     where id in(select created_by from j union select created_by from q)),'{}'::json)
 );
$function$;
revoke all on function public.job_order_bundle(text[]) from public,anon;
grant execute on function public.job_order_bundle(text[]) to authenticated,service_role;
notify pgrst, 'reload schema';
