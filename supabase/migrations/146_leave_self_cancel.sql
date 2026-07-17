-- 146_leave_self_cancel.sql
-- พนักงานยกเลิก (ลบ) ใบลาของตัวเองได้เฉพาะตอนยังรออนุมัติ — คู่กับปุ่ม "ยกเลิก" ในหน้าเข้างาน/ลา
-- (เหมือนที่คำขอเบิกล่วงหน้าทำได้อยู่แล้ว · อนุมัติแล้ว/ไม่อนุมัติ ต้องให้ฝ่ายบุคคลจัดการ)
-- รันใน Supabase → SQL Editor (ครั้งเดียว) — ต้องรัน 145 ก่อน

drop policy if exists hr_leaves_self_del on hr_leaves;
create policy hr_leaves_self_del on hr_leaves for delete
  using (user_id = auth.uid() and status = 'pending');
