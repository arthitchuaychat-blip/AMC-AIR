-- 153: ปิดช่องโหว่ "พนักงานเลื่อนสิทธิ์ตัวเอง / แก้ฐานเงินเดือนตัวเอง"
--
-- ปัญหาเดิม: policy prof_self (schema.sql) = `for update using (id = auth.uid())` ไม่มี WITH CHECK
-- และ RLS ของ Postgres ล็อกเป็น "รายคอลัมน์" ไม่ได้ → ใครก็ยิง PATCH profiles?id=eq.<ตัวเอง> {"role":"admin"}
-- จาก DevTools ได้ (anon key เป็นสาธารณะ) แล้วได้สิทธิ์ธุรการเต็ม + แก้ base_pay ตัวเองได้
-- ⇒ กติกา "ลบถาวร = ธุรการเท่านั้น" และ RLS ทุกตัวที่เช็ค my_role() พังพร้อมกันหมด
--
-- วิธีแก้: ใช้ trigger คุมรายคอลัมน์ (ทำสิ่งที่ RLS ทำไม่ได้)
--   • role            → เปลี่ยนได้เฉพาะ admin/exec
--   • ข้อมูลค่าจ้าง    → เปลี่ยนได้เฉพาะ admin/exec/hr และ "ห้ามแก้ของตัวเอง" (ยกเว้น admin/exec)
--   • ชื่อ/รูป/ลายเซ็น → ทุกคนแก้ของตัวเองได้ตามเดิม
-- หมายเหตุ: service role (งานเบื้องหลัง/สคริปต์) ข้ามการตรวจนี้ เพราะ auth.uid() เป็น null

create or replace function profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor text := my_role();
  is_self boolean := (auth.uid() = new.id);
begin
  -- เรียกจาก service role / ไม่มี session → ปล่อยผ่าน (สคริปต์ผู้ดูแลระบบ)
  if auth.uid() is null then return new; end if;

  -- 1) ตำแหน่ง (role) — เฉพาะผู้บริหาร/ธุรการ
  if new.role is distinct from old.role and actor not in ('admin', 'exec') then
    raise exception 'ไม่มีสิทธิ์เปลี่ยนตำแหน่ง (role) — ต้องให้ธุรการ/ผู้บริหารเป็นผู้เปลี่ยน';
  end if;

  -- 2) ข้อมูลค่าจ้าง/ข้อมูลอ่อนไหว — เฉพาะ admin/exec/hr และห้ามแก้ของตัวเอง (กัน HR ขึ้นเงินเดือนตัวเอง)
  if (new.base_pay    is distinct from old.base_pay
   or new.ot_rate     is distinct from old.ot_rate
   or new.pay_type    is distinct from old.pay_type
   or new.sso         is distinct from old.sso
   or new.citizen_id  is distinct from old.citizen_id) then
    if actor not in ('admin', 'exec', 'hr') then
      raise exception 'ไม่มีสิทธิ์แก้ข้อมูลค่าจ้าง/เลขบัตรประชาชน';
    end if;
    if is_self and actor not in ('admin', 'exec') then
      raise exception 'แก้ข้อมูลค่าจ้างของตัวเองไม่ได้ — ให้ธุรการ/ผู้บริหารเป็นผู้แก้';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard_trg on profiles;
create trigger profiles_guard_trg before update on profiles
  for each row execute function profiles_guard();

-- ✅ ตรวจผล (ล็อกอินเป็นพนักงานธรรมดาแล้วลองรัน — ต้องขึ้น error ทั้ง 2 บรรทัด)
-- update profiles set role = 'admin' where id = auth.uid();
-- update profiles set base_pay = 999999 where id = auth.uid();
