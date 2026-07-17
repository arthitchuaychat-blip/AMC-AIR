-- 145_hr_rls_tighten.sql
-- ปิดช่องโหว่: policy เดิม (082) เป็น "for all + user_id = auth.uid()" → พนักงานยิง REST ตรง
-- แก้ใบลาตัวเองเป็นอนุมัติ / แก้เวลาเข้างานย้อนหลัง / แก้คำขอเบิกตัวเองได้ (UI ไม่มีปุ่มแต่ DB เปิด)
-- หลักใหม่: พนักงาน = ยื่นเรื่อง (pending) + เช็คอิน-เอาท์ของ "วันนี้" เท่านั้น · แก้/อนุมัติ/ย้อนหลัง = admin/exec/hr
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- ---------- เวลาเข้างาน ----------
drop policy if exists hr_att_self on hr_attendance;
create policy hr_att_mgr on hr_attendance for all
  using (my_role() in ('admin','exec','hr')) with check (my_role() in ('admin','exec','hr'));
create policy hr_att_self_read on hr_attendance for select
  using (user_id = auth.uid());
-- เพิ่ม/แก้ได้เฉพาะแถวของตัวเอง "วันนี้" (เวลาไทย) — เช็คอินสร้างแถว, เช็คเอาท์อัปเดตแถวเดิม
create policy hr_att_self_ins on hr_attendance for insert
  with check (user_id = auth.uid() and work_date = (now() at time zone 'Asia/Bangkok')::date);
create policy hr_att_self_upd on hr_attendance for update
  using (user_id = auth.uid() and work_date = (now() at time zone 'Asia/Bangkok')::date)
  with check (user_id = auth.uid() and work_date = (now() at time zone 'Asia/Bangkok')::date);

-- ทริกเกอร์กันแก้เวลาแม้ในวันเดียวกัน: เวลาที่บันทึกแล้วห้ามเลื่อน + เวลาใหม่ต้องเป็น "ตอนนี้" (±10 นาที)
-- และห้ามพนักงานตั้งรับรอง OT (ot_ok) เอง
create or replace function hr_att_guard() returns trigger as $$
begin
  if my_role() in ('admin','exec','hr') then return new; end if;
  if tg_op = 'INSERT' then
    new.ot_ok := null;
    if new.check_in_at is not null and abs(extract(epoch from (new.check_in_at - now()))) > 600 then
      raise exception 'เวลาเช็คอินต้องเป็นเวลาปัจจุบัน';
    end if;
    if new.check_out_at is not null and abs(extract(epoch from (new.check_out_at - now()))) > 600 then
      raise exception 'เวลาเช็คเอาท์ต้องเป็นเวลาปัจจุบัน';
    end if;
    return new;
  end if;
  -- UPDATE โดยพนักงานเอง
  new.ot_ok := old.ot_ok;
  if old.check_in_at is not null and new.check_in_at is distinct from old.check_in_at then
    raise exception 'แก้เวลาเช็คอินไม่ได้ — แจ้งฝ่ายบุคคลแก้ให้';
  end if;
  if old.check_out_at is not null and new.check_out_at is distinct from old.check_out_at then
    raise exception 'แก้เวลาเช็คเอาท์ไม่ได้ — แจ้งฝ่ายบุคคลแก้ให้';
  end if;
  if old.check_in_at is null and new.check_in_at is not null and abs(extract(epoch from (new.check_in_at - now()))) > 600 then
    raise exception 'เวลาเช็คอินต้องเป็นเวลาปัจจุบัน';
  end if;
  if old.check_out_at is null and new.check_out_at is not null and abs(extract(epoch from (new.check_out_at - now()))) > 600 then
    raise exception 'เวลาเช็คเอาท์ต้องเป็นเวลาปัจจุบัน';
  end if;
  return new;
end $$ language plpgsql security definer;
drop trigger if exists hr_att_guard_t on hr_attendance;
create trigger hr_att_guard_t before insert or update on hr_attendance
  for each row execute function hr_att_guard();

-- ---------- ใบลา ----------
drop policy if exists hr_leaves_self on hr_leaves;
create policy hr_leaves_mgr on hr_leaves for all
  using (my_role() in ('admin','exec','hr')) with check (my_role() in ('admin','exec','hr'));
create policy hr_leaves_self_read on hr_leaves for select
  using (user_id = auth.uid());
-- ยื่นใบลาได้เฉพาะสถานะรออนุมัติ · แก้/ลบ/เปลี่ยนสถานะ = ฝ่ายบุคคลเท่านั้น
create policy hr_leaves_self_ins on hr_leaves for insert
  with check (user_id = auth.uid() and coalesce(status, 'pending') = 'pending');

-- ---------- เบิกเงินล่วงหน้า ----------
drop policy if exists hr_advances_self on hr_advances;
create policy hr_adv_mgr on hr_advances for all
  using (my_role() in ('admin','exec','finance','hr')) with check (my_role() in ('admin','exec','finance','hr'));
create policy hr_adv_self_read on hr_advances for select
  using (user_id = auth.uid());
create policy hr_adv_self_ins on hr_advances for insert
  with check (user_id = auth.uid() and coalesce(status, 'pending') = 'pending');
-- ยกเลิกคำขอตัวเองได้เฉพาะตอนยังรออนุมัติ (ปุ่ม "ยกเลิก" ในหน้าเข้างาน/ลา)
create policy hr_adv_self_del on hr_advances for delete
  using (user_id = auth.uid() and status = 'pending');
