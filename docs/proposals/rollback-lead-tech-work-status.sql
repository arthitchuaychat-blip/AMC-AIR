-- Restore only the two status routines to their inspected pre-fix definitions.
-- Existing rows, read policies, trigger functions and routine ACLs are untouched.
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
end $function$;

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
end $function$;

