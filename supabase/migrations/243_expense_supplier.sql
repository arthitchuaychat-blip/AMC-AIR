-- 243: ผู้ขายบนใบเบิกจ่าย + แก้ไขคำขอที่ยังไม่อนุมัติ
-- (แอปทำงานได้โดยไม่ต้องรันทันที — submitExpense/updateExpenseRequest มี fallback ตัดคอลัมน์ที่ยังไม่มี)
alter table expense_requests add column if not exists supplier text;   -- ชื่อผู้ขาย/ร้านค้า (อ้างอิงจากรายชื่อผู้ขาย)

-- อนุญาตให้ผู้ขอเบิก แก้ไข "คำขอของตัวเองที่ยังไม่อนุมัติ" ได้ (ออฟฟิศแก้ได้อยู่แล้วผ่าน er_update)
drop policy if exists er_update_own_pending on expense_requests;
create policy er_update_own_pending on expense_requests for update to authenticated
  using (requester = auth.uid() and status = 'pending')
  with check (requester = auth.uid() and status = 'pending');
