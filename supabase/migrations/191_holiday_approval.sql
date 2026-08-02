-- 191_holiday_approval.sql — งานวันหยุด "ต้องรับรองก่อนถึงจ่าย" (เจ้าของเคาะ 2026-08-02)
-- เดิม: มาทำงานวันหยุด → ค่าวันหยุดคิดเข้าเงินเดือนอัตโนมัติ (ไม่มีใครกลั่นกรอง)
-- ใหม่: HR/หัวหน้าต้องกด "รับรองวันหยุด" ในหน้า HR วันนี้ก่อน ค่าวันหยุดถึงคิดเข้าเงินเดือน
-- (OT วันทำงานปกติใช้ hr_ot อยู่แล้ว — HR กด "อนุมัติเป็น OT" จากเวลาจริง = สร้างใบ hr_ot อนุมัติ)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table hr_attendance add column if not exists hol_ok boolean not null default false;

-- ✅ ตรวจผล
select 'hr_attendance.hol_ok ready' as status;
