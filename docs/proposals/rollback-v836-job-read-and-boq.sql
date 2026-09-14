-- Emergency database rollback for v836 only. Revert the BOQ UI before removing boq_page.
-- This restores pre-v836 access; keep the field header/visit boundary installed on 14 Sep.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
drop policy if exists job_orders_actor_read_scope on public.job_orders;
drop policy if exists job_visits_actor_read_scope on public.job_visits;
drop policy if exists job_logs_actor_read_scope on public.job_logs;
drop policy if exists jobs_actor_read_scope on public.jobs;
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
    and (p_job is null or jo.job_no = p_job)
    and (p_group is null or jo.group_no = p_group or jo.job_no = p_group)
    and (a.role <> 'tech' or (a.team is not null and (
      jo.assigned_team = a.team or exists (
        select 1 from public.job_visits v where v.job_no = jo.job_no and v.assigned_team = a.team
      )
    )))
  order by jo.job_no;
$function$;
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
$function$;
drop function if exists public.boq_page(text,date,date,text,text,integer);
notify pgrst, 'reload schema';
commit;
