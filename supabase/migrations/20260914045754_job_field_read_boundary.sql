-- Read-only compatibility API: shared timelines and notification metadata need
-- job references, never the raw row containing labor_lines/internal_note.
-- No data/column changes. Existing status transitions and payment formulas remain.
-- Status authorization also fails closed when either team is NULL.
set local lock_timeout = '2s';
set local statement_timeout = '15s';

create or replace function public.job_field_refs(p_job text default null, p_group text default null)
returns table(job_no text, group_no text, customer_id bigint, customer_name text,
              assigned_team text, scheduled_at timestamptz)
language sql stable security definer set search_path = public
as $function$
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
revoke all on function public.job_field_refs(text,text) from public, anon;
grant execute on function public.job_field_refs(text,text) to authenticated, service_role;

-- RESTRICTIVE policies combine with existing role policies. They cannot grant
-- a new role access. Office read/write rules and field status RPCs stay intact.
-- Field users read jobs via jobs_for_team (explicit safe column projection).
create policy job_orders_field_read_boundary on public.job_orders
as restrictive for select to authenticated
using ((select public.my_role()) not in ('tech','lead_tech'));

-- Keep every visit belonging to an authorized job visible, including another
-- team's visit on a shared job. The existing RPC presents the same context.
create policy job_visits_field_read_boundary on public.job_visits
as restrictive for select to authenticated
using ((select public.my_role()) <> 'tech' or job_no in (
  select r.job_no from public.job_field_refs() r
));

-- NULL is not permission: SQL NOT(NULL) previously skipped these guards.
CREATE OR REPLACE FUNCTION public.set_job_status(p_job text, p_status text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cur text; v_locked boolean; v_team text;
begin
 if public.app_actor_role() is null or public.app_actor_role()='hr' then raise exception 'ไม่มีสิทธิ์เข้าถึงงาน' using errcode='42501'; end if;
  select status, coalesce(locked, false), assigned_team into v_cur, v_locked, v_team from job_orders where job_no = p_job;
  if v_cur is null then raise exception 'job not found'; end if;
  if my_role() in ('admin','sales','exec','finance','stock') then
    null;  -- ออฟฟิศ/หัวหน้าช่าง เปลี่ยนได้ทุกสถานะ (รวมยกเลิก/คืนชีพ)
  elsif my_role() in ('tech','lead_tech') then
    if v_cur in ('done','cancelled') or v_locked then raise exception 'งานถูกปิด/ยกเลิกแล้ว (รีเฟรชหน้าจอ)'; end if;
    if p_status not in ('in_progress','awaiting_approval','reschedule') then
      raise exception 'สถานะนี้ออฟฟิศเป็นคนตั้งเท่านั้น';
    end if;
    if (v_team = my_team()
            or exists (select 1 from job_visits where job_no = p_job and assigned_team = my_team())) is not true then
      raise exception 'not allowed';
    end if;
  else
    raise exception 'not allowed';
  end if;
  update job_orders set status = p_status where job_no = p_job;
  -- ยกเลิกใบงาน → ปิดรอบที่ยังไม่จบด้วย (ต้นเหตุงานคืนชีพ: รอบยังเดินอยู่หลังยกเลิก)
  if p_status = 'cancelled' then
    update job_visits set status = 'cancelled' where job_no = p_job and status not in ('done','cancelled');
  end if;
  return p_status;
end $function$
;


CREATE OR REPLACE FUNCTION public.set_visit_status(p_visit_id bigint, p_status text, p_job_override text DEFAULT NULL::text, p_lock boolean DEFAULT NULL::boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_job text; v_team text; v_cur text; v_jstatus text; v_locked boolean;
begin
 if public.app_actor_role() is null or public.app_actor_role()='hr' then raise exception 'ไม่มีสิทธิ์เข้าถึงงาน' using errcode='42501'; end if;
  select job_no, assigned_team, status into v_job, v_team, v_cur from job_visits where id = p_visit_id;
  if v_job is null then raise exception 'visit not found'; end if;
  if (my_role() in ('admin','sales','exec','finance','stock')
          or (my_role() in ('tech','lead_tech') and v_team = my_team())) is not true then
    raise exception 'not allowed';
  end if;
  select status, coalesce(locked, false) into v_jstatus, v_locked from job_orders where job_no = v_job;
  if v_jstatus = 'cancelled' then raise exception 'ใบงานถูกยกเลิกแล้ว — เปลี่ยนสถานะรอบไม่ได้ (รีเฟรชหน้าจอ)'; end if;
  if my_role() in ('tech','lead_tech') then
    if v_locked then raise exception 'ใบงานถูกอนุมัติปิดแล้ว — แก้ไม่ได้ (รีเฟรชหน้าจอ)'; end if;
    if v_cur = 'done' then raise exception 'รอบนี้อนุมัติปิดแล้ว — แก้ไม่ได้'; end if;
    if p_status not in ('in_progress','awaiting_approval','reschedule') then
      raise exception 'สถานะนี้ออฟฟิศเป็นคนตั้งเท่านั้น';
    end if;
    if p_job_override is not null or p_lock is not null then raise exception 'not allowed'; end if;
  end if;
  update job_visits set status = p_status where id = p_visit_id;
  if p_job_override is not null then
    update job_orders set status = p_job_override, locked = coalesce(p_lock, locked) where job_no = v_job;
    return p_job_override;
  end if;
  if p_lock is not null then update job_orders set locked = p_lock where job_no = v_job; end if;
  return recompute_job_status(v_job);
end $function$
;


notify pgrst, 'reload schema';
