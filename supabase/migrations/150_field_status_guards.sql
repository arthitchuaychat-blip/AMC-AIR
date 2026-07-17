-- 150_field_status_guards.sql — เก็บแข็งสถานะงานช่างหน้างาน (จากรีวิว 2026-07-17)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
--
-- ปัญหาที่แก้:
--  (1) งานที่ยกเลิกแล้ว "คืนชีพ" ได้ — ช่างจอค้างกดส่งอนุมัติ ระบบคำนวณสถานะทับ cancelled
--  (2) ช่างยิงตรง (REST) ตั้งสถานะ done เองได้ = ข้ามการอนุมัติของออฟฟิศ · แก้งานที่ล็อกปิดแล้วได้
--  (3) role tech เปลี่ยนสถานะใบงานที่ไม่มีรอบนัดไม่ได้ (RLS เงียบ 0 แถว แต่จอบอกสำเร็จ)
--  (4) อนุมัติแบบ "เสร็จ → รอทำใบเสนอราคา" เป็น 3 คำสั่งแยก เน็ตสะดุดกลางทางงานค้างผิดคิว
--  (5) ช่างแก้/ลบใบส่งมอบงานที่ส่งแล้ว (มีลายเซ็นลูกค้า) ของตัวเองได้ผ่าน REST

-- (1) recompute ห้ามทับงานที่ยกเลิกแล้ว
create or replace function recompute_job_status(p_job text) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if (select status from job_orders where job_no = p_job) = 'cancelled' then return 'cancelled'; end if;
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

-- (2)+(4) เปลี่ยนสถานะรอบ: การ์ดกันงานยกเลิก/ล็อก + จำกัดทิศทางของช่าง + override/ล็อกใบงานจบใน transaction เดียว
drop function if exists set_visit_status(bigint, text);
create or replace function set_visit_status(p_visit_id bigint, p_status text, p_job_override text default null, p_lock boolean default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_job text; v_team text; v_cur text; v_jstatus text; v_locked boolean;
begin
  select job_no, assigned_team, status into v_job, v_team, v_cur from job_visits where id = p_visit_id;
  if v_job is null then raise exception 'visit not found'; end if;
  if not (my_role() in ('admin','sales','exec','finance','hr','stock','lead_tech')
          or (my_role() = 'tech' and v_team = my_team())) then
    raise exception 'not allowed';
  end if;
  select status, coalesce(locked, false) into v_jstatus, v_locked from job_orders where job_no = v_job;
  if v_jstatus = 'cancelled' then raise exception 'ใบงานถูกยกเลิกแล้ว — เปลี่ยนสถานะรอบไม่ได้ (รีเฟรชหน้าจอ)'; end if;
  if my_role() = 'tech' then
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
end $$;
grant execute on function set_visit_status(bigint, text, text, boolean) to authenticated;

-- (2) อัปเดตหลายรอบ (ออฟฟิศใช้อนุมัติ/ตีกลับ): กันงานยกเลิก (ยกเว้นตั้งใจยกเลิกรอบ)
create or replace function set_job_visits_status(p_job text, p_from text[], p_to text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not (my_role() in ('admin','sales','exec','finance','hr','stock','lead_tech')) then
    raise exception 'not allowed';
  end if;
  if p_to <> 'cancelled' and (select status from job_orders where job_no = p_job) = 'cancelled' then
    raise exception 'ใบงานถูกยกเลิกแล้ว';
  end if;
  update job_visits set status = p_to where job_no = p_job and status = any(p_from);
  return recompute_job_status(p_job);
end $$;

-- (3) เปลี่ยนสถานะหัวใบงาน (งานไม่มีรอบนัด/ออฟฟิศสั่งตรง) — ช่างทำได้เฉพาะทิศทางหน้างาน ผ่านการ์ดครบ
create or replace function set_job_status(p_job text, p_status text) returns text
language plpgsql security definer set search_path = public as $$
declare v_cur text; v_locked boolean; v_team text;
begin
  select status, coalesce(locked, false), assigned_team into v_cur, v_locked, v_team from job_orders where job_no = p_job;
  if v_cur is null then raise exception 'job not found'; end if;
  if my_role() in ('admin','sales','exec','finance','hr','stock','lead_tech') then
    null;  -- ออฟฟิศ/หัวหน้าช่าง เปลี่ยนได้ทุกสถานะ (รวมยกเลิก/คืนชีพ)
  elsif my_role() = 'tech' then
    if v_cur in ('done','cancelled') or v_locked then raise exception 'งานถูกปิด/ยกเลิกแล้ว (รีเฟรชหน้าจอ)'; end if;
    if p_status not in ('in_progress','awaiting_approval','reschedule') then
      raise exception 'สถานะนี้ออฟฟิศเป็นคนตั้งเท่านั้น';
    end if;
    if not (v_team = my_team()
            or exists (select 1 from job_visits where job_no = p_job and assigned_team = my_team())) then
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
end $$;
grant execute on function set_job_status(text, text) to authenticated;

-- (5) ใบส่งมอบงาน: คนสร้าง (ช่าง) แก้ได้เฉพาะฉบับร่าง · ใบที่ส่งแล้ว (มีลายเซ็น) แก้ได้เฉพาะออฟฟิศ · ลบถาวร = admin (+เจ้าของลบร่างตัวเอง)
drop policy if exists job_handovers_rw on job_handovers;
drop policy if exists job_handovers_read on job_handovers;
drop policy if exists job_handovers_ins on job_handovers;
drop policy if exists job_handovers_upd on job_handovers;
drop policy if exists job_handovers_del on job_handovers;
create policy job_handovers_read on job_handovers for select to authenticated
  using (created_by = auth.uid() or my_role() in ('admin','exec','sales','finance','lead_tech','hr','stock'));
create policy job_handovers_ins on job_handovers for insert to authenticated
  with check (created_by = auth.uid() or my_role() in ('admin','exec','sales','finance','lead_tech','hr','stock'));
create policy job_handovers_upd on job_handovers for update to authenticated
  using (my_role() in ('admin','exec','sales','finance','lead_tech','hr','stock') or (created_by = auth.uid() and status = 'draft'))
  with check (created_by = auth.uid() or my_role() in ('admin','exec','sales','finance','lead_tech','hr','stock'));
create policy job_handovers_del on job_handovers for delete to authenticated
  using (my_role() = 'admin' or (created_by = auth.uid() and status = 'draft'));
