-- 240: อนุญาตให้สำนักงาน (admin/exec/finance/hr) ลบใบเบิกได้จริง
-- เดิม expense_requests ไม่มี DELETE policy → RLS บล็อกการลบแบบเงียบ ๆ (ไม่ error แต่ไม่ลบ)
-- ทำให้ "ยกเลิก/เปิดรอบเงินเดือนใหม่" ลบใบเบิกเงินเดือนที่ยังไม่จ่ายไม่ออก (ค้างในคิวรอจ่าย)
drop policy if exists er_delete on expense_requests;
create policy er_delete on expense_requests for delete to authenticated
  using (my_role() in ('admin','exec','finance','hr'));
