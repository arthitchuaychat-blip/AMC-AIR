-- 149_payslip_self_read.sql — พนักงานอ่าน "สลิปเงินเดือนของตัวเอง" ได้ (เฉพาะอ่าน — เขียนยังเป็นของ HR/บัญชี)
-- ใช้กับการ์ด "เงินเดือนของฉัน (ละเอียด)" ในหน้า เข้างาน/ลา: โชว์โบนัส/หักอื่น/สถานะจ่ายจริงตามสลิปที่ HR บันทึก
-- (ยังไม่รันก็ใช้ได้ — ระบบคำนวณสดจากข้อมูลเข้างาน/ลา/เบิกของตัวเอง แค่ไม่เห็นโบนัส/สถานะจ่าย)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

do $$ begin
  create policy payslips_self_read on payslips for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;
