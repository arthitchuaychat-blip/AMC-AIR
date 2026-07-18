-- 154: ย้ายข้อมูลค่าจ้าง/เลขบัตรประชาชนออกจาก profiles → ตาราง hr_pay (ปิดช่องอ่านเงินเดือนคนอื่น)
--
-- ปัญหาเดิม: policy prof_read เปิด `using (true)` มาตั้งแต่ mig 011 (ตอนนั้นตารางมีแค่ชื่อ/ตำแหน่ง)
-- ต่อมา mig 051 เพิ่ม base_pay/ot_rate/sso และ mig 130 เพิ่ม citizen_id ลงตารางเดิม โดยไม่ได้แก้ policy
-- ⇒ พนักงานคนไหนก็ได้ยิง REST ด้วย anon key (เป็นสาธารณะ) อ่านเงินเดือน+เลขบัตรของทุกคนได้
-- RLS ของ Postgres ล็อกเป็นรายคอลัมน์ไม่ได้ และ GRANT รายคอลัมน์ก็แยกตาม role ของแอปไม่ได้
-- (ทุกคนคือ authenticated เหมือนกัน) ⇒ ทางเดียวที่ปิดได้จริงคือ "แยกตาราง"
--
-- กติกาใหม่: เจ้าตัวอ่านของตัวเองได้ (หน้า "เงินเดือนของฉัน" ยังทำงาน) · ผู้จัดการอ่านได้ทุกคน
--            แก้ไขได้เฉพาะ admin/exec/hr และห้ามแก้ของตัวเอง (ยกเว้น admin/exec)

create table if not exists hr_pay (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  pay_type   text default 'monthly',
  base_pay   numeric default 0,
  ot_rate    numeric default 0,
  sso        boolean default false,
  citizen_id text,
  updated_at timestamptz not null default now()
);

-- ย้ายข้อมูลเดิม (รันซ้ำได้ — ไม่ทับของที่แก้ใหม่แล้ว)
insert into hr_pay (user_id, pay_type, base_pay, ot_rate, sso, citizen_id)
select id, pay_type, base_pay, ot_rate, sso, citizen_id from profiles
on conflict (user_id) do nothing;

alter table hr_pay enable row level security;
drop policy if exists hr_pay_read on hr_pay;
create policy hr_pay_read on hr_pay for select to authenticated
  using (user_id = auth.uid() or my_role() in ('admin', 'exec', 'hr', 'finance'));
drop policy if exists hr_pay_write on hr_pay;
create policy hr_pay_write on hr_pay for all to authenticated
  using (my_role() in ('admin', 'exec', 'hr'))
  with check (my_role() in ('admin', 'exec', 'hr'));

-- กัน HR ขึ้นเงินเดือนตัวเอง (แบบเดียวกับ trigger ใน mig 153)
create or replace function hr_pay_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.user_id = auth.uid() and my_role() not in ('admin', 'exec') then
    raise exception 'แก้ข้อมูลค่าจ้างของตัวเองไม่ได้ — ให้ธุรการ/ผู้บริหารเป็นผู้แก้';
  end if;
  return new;
end $$;
drop trigger if exists hr_pay_guard_trg on hr_pay;
create trigger hr_pay_guard_trg before insert or update on hr_pay
  for each row execute function hr_pay_guard();

-- ⚠️ รันบรรทัดล่างนี้ "หลังจาก" ยืนยันว่าแอปเวอร์ชันใหม่ (v456+) ใช้งานได้ปกติแล้ว 1-2 วัน
-- (ก่อนหน้านั้นแอปยังอ่าน profiles เป็น fallback ได้ ถ้าลบเร็วเกินเครื่องที่ยังเปิดบันเดิลเก่าค้างจะพัง)
-- alter table profiles drop column base_pay, drop column ot_rate, drop column sso, drop column pay_type, drop column citizen_id;

-- ✅ ตรวจผล: ล็อกอินเป็นพนักงานธรรมดา แล้วยิง select ตารางนี้ ต้องเห็นแถวเดียว (ของตัวเอง)
-- select user_id, base_pay from hr_pay;
