-- 186: เช็คเอาท์ OT — พนักงานบันทึกเวลาเลิก+ชั่วโมงเองได้เมื่อ HR อนุมัติแล้ว
-- (flow ใหม่: ขอ = วัน+เวลาเริ่ม → HR อนุมัติ → ทำเสร็จกดเช็คเอาท์ → คิดชั่วโมง)
-- อนุญาต UPDATE เฉพาะแถวของตัวเองที่ status='approved' และหลังแก้ต้องยัง approved
-- (RLS จำกัดแถวได้ ไม่จำกัดคอลัมน์ — UI แก้แค่ time_to/hours; ยอมรับได้สำหรับทีมเล็ก)
drop policy if exists hr_ot_self_checkout on hr_ot;
create policy hr_ot_self_checkout on hr_ot for update to authenticated
  using (user_id = auth.uid() and status = 'approved')
  with check (user_id = auth.uid() and status = 'approved');

select 'hr_ot self-checkout policy ready' as status;
