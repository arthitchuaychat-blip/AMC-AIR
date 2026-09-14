-- Tighten job reads using the actual saved menu permissions. No business row updates.
-- Field job headers remain accessible only through the existing safe projection.
set local lock_timeout = '2s';
set local statement_timeout = '15s';
do $$ begin
  if to_regprocedure('public.job_order_bundle(text[])') is null
     or not exists(select 1 from pg_policies where schemaname='public' and tablename='job_orders' and policyname='job_orders_field_read_boundary' and permissive='RESTRICTIVE')
     or not exists(select 1 from pg_policies where schemaname='public' and tablename='job_visits' and policyname='job_visits_field_read_boundary' and permissive='RESTRICTIVE')
  then raise exception 'Install the existing job_field_read_boundary and job_order_bundle_read_only migrations first'; end if;
end $$;

CREATE OR REPLACE FUNCTION public.job_field_refs(p_job text DEFAULT NULL::text, p_group text DEFAULT NULL::text)
 RETURNS TABLE(job_no text, group_no text, customer_id bigint, customer_name text, assigned_team text, scheduled_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with actor as materialized (
    select public.app_actor_role() as actor_role, public.my_role() as role, public.my_team() as team
  )
  select jo.job_no, jo.group_no, jo.customer_id, c.name, jo.assigned_team, jo.scheduled_at
  from public.job_orders jo
  cross join actor a
  left join public.customers c on c.id = jo.customer_id
  where a.actor_role is not null and a.actor_role <> 'hr'
    and ((select public.my_role()) in ('tech','lead_tech') or (select public.app_can('joborders')) or (select public.app_can('myjobs')) or (select public.app_can('schedule')) or (select public.app_can('jobs')))
    and (p_job is null or jo.job_no = p_job)
    and (p_group is null or jo.group_no = p_group or jo.job_no = p_group)
    and (a.role <> 'tech' or (a.team is not null and (
      jo.assigned_team = a.team or exists (
        select 1 from public.job_visits v where v.job_no = jo.job_no and v.assigned_team = a.team
      )
    )))
  order by jo.job_no;
$function$
;
CREATE OR REPLACE FUNCTION public.jobs_for_team(p_team text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with scope as (
    select case when my_role() = 'tech' then my_team() else p_team end as team
  ),
  j as (
    select jo.*
    from job_orders jo, scope s
    where my_role() in ('tech','lead_tech','admin','exec','finance','sales','stock')
      and ((select public.my_role()) in ('tech','lead_tech') or (select public.app_can('joborders')) or (select public.app_can('myjobs')) or (select public.app_can('schedule')) or (select public.app_can('jobs')))
      and not (my_role() = 'tech' and my_team() is null)
      and (
        (s.team is null and my_role() <> 'tech')
        or jo.assigned_team = s.team
        or exists (select 1 from job_visits v where v.job_no = jo.job_no and v.assigned_team = s.team)
      )
  )
  select coalesce(json_agg(row_to_json(x) order by x.created_at desc), '[]'::json) from (
    select
      j.job_no, j.quote_no, j.customer_id, j.site_id, j.title, j.group_no, j.job_type,
      j.contact_name, j.contact_phone, j.address, j.map_url, j.details,
      j.sales_note, j.sales_photos, j.assigned_team, j.scheduled_at, j.end_date, j.slot,
      j.status, j.completion_note, j.photos, j.created_at, j.created_by, j.locked, j.issue_date,
      c.name  as customer_name,
      c.address as customer_address,
      cs.site_name, cs.address as site_address, cs.map_url as site_map_url,
      cs.contact_name as site_contact_name, cs.phone as site_phone,
      (select json_build_object('name', cc.name, 'phone', cc.phone)
         from customer_contacts cc where cc.customer_id = j.customer_id order by cc.id limit 1) as main_contact,
      q.boq_no,
      (select t.name from teams t where t.id = j.assigned_team) as team_name,
      (select coalesce(json_agg(json_build_object('name', qi.name, 'qty', qi.qty, 'unit', qi.unit) order by qi.id), '[]'::json)
         from quotation_items qi
        where qi.quote_no = j.quote_no and qi.kind in ('ac','service')) as confirm_items,
      (select coalesce(json_agg(json_build_object(
                'id', v.id, 'job_no', v.job_no, 'visit_date', v.visit_date, 'end_date', v.end_date,
                'slot', v.slot, 'scheduled_at', v.scheduled_at, 'status', v.status,
                'assigned_team', v.assigned_team, 'note', v.note,
                'teamName', (select t.name from teams t where t.id = v.assigned_team)
              ) order by v.visit_date, v.id), '[]'::json)
         from job_visits v where v.job_no = j.job_no) as visits
    from j
    left join customers      c  on c.id  = j.customer_id
    left join customer_sites cs on cs.id = j.site_id
    left join quotations     q  on q.quote_no = j.quote_no
  ) x;
$function$
;

create policy job_orders_actor_read_scope on public.job_orders
as restrictive for select to authenticated using (((select public.my_role()) in ('tech','lead_tech') or (select public.app_can('joborders')) or (select public.app_can('myjobs')) or (select public.app_can('schedule')) or (select public.app_can('jobs'))));
create policy job_visits_actor_read_scope on public.job_visits
as restrictive for select to authenticated using (((select public.my_role()) in ('tech','lead_tech') or (select public.app_can('joborders')) or (select public.app_can('myjobs')) or (select public.app_can('schedule')) or (select public.app_can('jobs'))));
create policy job_logs_actor_read_scope on public.job_logs
as restrictive for select to authenticated using (
  ((select public.my_role()) in ('tech','lead_tech') or (select public.app_can('joborders')) or (select public.app_can('myjobs')) or (select public.app_can('schedule')) or (select public.app_can('jobs'))) and ((select public.my_role()) <> 'tech'
    or job_no in (select r.job_no from public.job_field_refs() r))
);
create policy jobs_actor_read_scope on public.jobs
as restrictive for select to authenticated using (
  (select public.my_role()) = 'lead_tech' or ((select public.my_role()) <> 'tech' and (select public.app_can('jobs')))
  or ((select public.my_role()) = 'tech' and team = (select public.my_team()))
);

-- BOQ list summaries: stable 50-document pages; line items and print data load on demand.
-- SECURITY INVOKER enforces existing table policies for every joined document.
create or replace function public.boq_page(
  p_search text default '', p_from date default null, p_to date default null,
  p_type text default 'all', p_creator text default '', p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
with needle as (
 select lower(normalize(regexp_replace(trim(coalesce(p_search,'')),'\s+',' ','g'),NFC)) as text,
 regexp_replace(coalesce(p_search,''),'[^0-9]','','g') as phone
), source as materialized (
 select b.boq_no,b.customer_id,b.site_id,b.title,b.job_type,b.status,b.created_at,b.issue_date,
 b.internal_note,b.created_by,coalesce(p.name,'') as creator,
 c.name as customer_name,c.address as customer_address,
 cs.site_name,cs.address as site_address,cs.map_url as site_map_url,
 coalesce(nullif(cs.contact_name,''),ct.name) as contact_name,
 coalesce(nullif(cs.phone,''),ct.phone) as contact_phone,
 coalesce(b.issue_date,(b.created_at at time zone 'UTC')::date) as doc_date,
 -- Keep the existing field-by-field, whitespace-normalized and phone search.
 (n.text='' or exists(select 1 from unnest(array[b.boq_no,c.name,coalesce(nullif(cs.contact_name,''),ct.name),b.title,b.note,b.internal_note]) f
    where strpos(lower(normalize(regexp_replace(trim(coalesce(f,'')),'\s+',' ','g'),NFC)),n.text)>0)
    or (n.phone<>'' and strpos(regexp_replace(coalesce(nullif(cs.phone,''),ct.phone,''),'[^0-9]','','g'),n.phone)>0)) as matches
 from public.boqs b left join public.customers c on c.id=b.customer_id
 left join public.customer_sites cs on cs.id=b.site_id
 left join public.profiles p on p.id=b.created_by
 left join lateral(select name,phone from public.customer_contacts where customer_id=b.customer_id order by id limit 1)ct on true
 cross join needle n
), base as materialized (
 select * from source where matches and (p_from is null or doc_date>=p_from) and (p_to is null or doc_date<=p_to)
), filtered as materialized (
 select * from base where (coalesce(p_type,'all')='all' or job_type=p_type)
 and (coalesce(p_creator,'')='' or creator=p_creator)
), page as materialized (
 select * from filtered order by created_at desc,boq_no limit 50 offset greatest(coalesce(p_offset,0),0)
), rows as materialized (
 select pg.*, q.quote_no,coalesce(q.approved,false) as quote_approved,
 coalesce(it.total,0) as total,coalesce(it.item_count,0) as item_count
 from page pg
 left join lateral (
   select quote_no,status='approved' as approved from public.quotations
   where boq_no=pg.boq_no and status<>'cancelled'
   order by (status='approved') desc,case when status='approved' then quote_no end desc,quote_no asc limit 1
 )q on true
 left join lateral(select sum(qty*unit_cost) as total,count(*) as item_count from public.boq_items where boq_no=pg.boq_no)it on true
), qnos as (select distinct quote_no from rows where quote_no is not null)
select jsonb_build_object(
 'rows',coalesce((select jsonb_agg(jsonb_build_object(
   'boq_no',r.boq_no,'customer_id',r.customer_id,'site_id',r.site_id,'title',r.title,
   'job_type',r.job_type,'status',r.status,'created_at',r.created_at,'issue_date',r.issue_date,
   'internal_note',r.internal_note,'createdByName',r.creator,'customerName',r.customer_name,
   'customerAddr',r.customer_address,'siteName',r.site_name,'siteAddress',r.site_address,
   'mapUrl',r.site_map_url,'contactName',r.contact_name,'contactPhone',r.contact_phone,
   'quoteNo',r.quote_no,'hasQuote',r.quote_no is not null,'quoteApproved',r.quote_approved,
   'total',r.total,'itemCount',r.item_count
 ) order by created_at desc,boq_no) from rows r),'[]'::jsonb),
 'total',(select count(*) from filtered),'baseTotal',(select count(*) from base),
 'allTotal',(select count(*) from source),
 'hidden',(select count(*) from source where (p_from is not null and doc_date<p_from) or (p_to is not null and doc_date>p_to)),
 'creators',coalesce((select jsonb_agg(creator order by creator) from(select distinct creator from source where creator<>'')x),'[]'::jsonb),
 'types',coalesce((select jsonb_object_agg(job_type,n) from(select coalesce(job_type,'') as job_type,count(*) n from base group by job_type)x),'{}'::jsonb),
 'links',jsonb_build_object('byQuote',coalesce((select jsonb_object_agg(q.quote_no,jsonb_build_object(
   'jobNos',coalesce((select jsonb_agg(job_no order by job_no) from public.job_orders where quote_no=q.quote_no),'[]'::jsonb),
   'invoiceNos',coalesce((select jsonb_agg(invoice_no order by invoice_no) from public.invoices where quote_no=q.quote_no and status<>'cancelled'),'[]'::jsonb),
   'receiptNos',coalesce((select jsonb_agg(receipt_no order by receipt_no) from public.receipts where quote_no=q.quote_no and status<>'cancelled'),'[]'::jsonb),
   'poNos',coalesce((select jsonb_agg(po_no order by po_no) from public.purchase_orders where quote_no=q.quote_no and status<>'cancelled'),'[]'::jsonb)
 )) from qnos q),'{}'::jsonb),
 'jobStatusBy',coalesce((select jsonb_object_agg(job_no,status) from public.job_orders where quote_no in(select quote_no from qnos)),'{}'::jsonb))
);
$$;
revoke all on function public.boq_page(text,date,date,text,text,integer) from public,anon;
grant execute on function public.boq_page(text,date,date,text,text,integer) to authenticated;
notify pgrst, 'reload schema';
