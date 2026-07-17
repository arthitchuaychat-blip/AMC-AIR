-- 148_payslip_holiday.sql — ค่าทำงานวันหยุด (เจ้าของเคาะ 2026-07-17: จ่ายตามกฎหมายเต็ม)
-- คิดอัตโนมัติในหน้าเงินเดือน: 8 ชม.แรก รายเดือน +1 เท่า / รายวัน 2 เท่า · ส่วนเกิน 8 ชม. = OT วันหยุด 3 เท่า
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table payslips add column if not exists hol_pay numeric default 0;
