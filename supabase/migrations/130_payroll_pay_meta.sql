-- 130_payroll_pay_meta.sql — จ่ายเงินเดือนครบวงจร + ข้อมูลยื่นราชการ
-- (1) จ่ายทั้งรอบ: เลือกบัญชี + แนบสลิปโอน (เก็บบนสลิปทุกใบของรอบ)
-- (2) เลขบัตรประชาชนพนักงาน — ใช้ออกไฟล์ประกันสังคม (สปส.1-10) และสรุปยื่น ภงด.1
-- รันใน Supabase → SQL Editor (ครั้งเดียว · รันซ้ำได้)

alter table payslips add column if not exists paid_from uuid;
alter table payslips add column if not exists pay_slip_url text;
alter table profiles add column if not exists citizen_id text;

-- ✅ ตรวจผล
select table_name, column_name from information_schema.columns
where (table_name = 'payslips' and column_name in ('paid_from','pay_slip_url'))
   or (table_name = 'profiles' and column_name = 'citizen_id');
