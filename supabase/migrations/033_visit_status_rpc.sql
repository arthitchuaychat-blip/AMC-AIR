-- 033 · ทำให้เปลี่ยนสถานะรอบ/ใบงานทำงานได้จริง (รวม migration 032 ไว้ในนี้ด้วย — รันไฟล์เดียวจบ)
-- ปัญหาเดิม: เปลี่ยนสถานะแตะ 2 ตาราง (job_visits + job_orders) ช่างอัปเดต job_orders ข้ามทีมไม่ได้ (RLS)
-- แก้: ใช้ฟังก์ชัน SECURITY DEFINER อัปเดต + คำนวณสถานะใบงานให้ในตัว

-- (1) เปิดรับสถานะใหม่ awaiting_approval / reschedule
alter table job_orders drop constraint if exists job_orders_status_check;
alter table job_orders add constraint job_orders_status_check
  check (status in ('pending','scheduled','in_progress','awaiting_approval','reschedule','done','cancelled'));
alter table job_visits drop constraint if exists job_visits_status_check;
alter table job_visits add constraint job_visits_status_check
  check (status in ('pending','scheduled','in_progress','awaiting_approval','reschedule','done','cancelled'));

-- (2) คำนวณสถานะใบงานจากรอบทั้งหมด
create or replace function recompute_job_status(p_job text) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select case
    when count(*) filter (where status <> 'cancelled') = 0
      then (case when count(*) > 0 then 'cancelled' else 'pending' end)
    when count(*) filter (where status <> 'cancelled' and status <> 'done') = 0 then 'done'
    when count(*) filter (where status = 'in_progress') > 0 then 'in_progress'
    when count(*) filter (where status = 'awaiting_approval') > 0 then 'awaiting_approval'
    when count(*) filter (where status = 'reschedule') > 0 then 'reschedule'
    when count(*) filter (where status = 'scheduled') > 0 then 'scheduled'
    else 'pending'
  end into v
  from job_visits where job_no = p_job;
  if v is null then v := 'pending'; end if;
  update job_orders set status = v where job_no = p_job;
  return v;
end $$;

-- (3) เปลี่ยนสถานะรอบเดียว (ช่างใช้: เริ่มทำ/ส่งอนุมัติ/ขอเลื่อนนัด)
create or replace function set_visit_status(p_visit_id bigint, p_status text) returns text
language plpgsql security definer set search_path = public as $$
declare v_job text; v_team text;
begin
  select job_no, assigned_team into v_job, v_team from job_visits where id = p_visit_id;
  if v_job is null then raise exception 'visit not found'; end if;
  if not (my_role() in ('admin','sales','exec','finance','lead_tech')
          or (my_role() = 'tech' and v_team = my_team())) then
    raise exception 'not allowed';
  end if;
  update job_visits set status = p_status where id = p_visit_id;
  return recompute_job_status(v_job);
end $$;

-- (4) เปลี่ยนสถานะหลายรอบของใบงานเดียว (ออฟฟิศใช้: อนุมัติ/ให้นัดใหม่)
create or replace function set_job_visits_status(p_job text, p_from text[], p_to text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not (my_role() in ('admin','sales','exec','finance','lead_tech')) then
    raise exception 'not allowed';
  end if;
  update job_visits set status = p_to where job_no = p_job and status = any(p_from);
  return recompute_job_status(p_job);
end $$;

grant execute on function recompute_job_status(text) to authenticated;
grant execute on function set_visit_status(bigint, text) to authenticated;
grant execute on function set_job_visits_status(text, text[], text) to authenticated;
