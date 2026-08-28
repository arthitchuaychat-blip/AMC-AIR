-- ═══════════════════════════════════════════════════════════════════════════
-- 227 · แก้ "ปิดงานไม่ได้" — ยืนยัน RLS + policy เขียนของตาราง jobs (job costing)
-- อาการ: กดปิดงาน (ล็อกต้นทุน) ขึ้น "new row violates row-level security policy for table jobs"
-- เหตุ: DDL ของ jobs ไม่อยู่ใน migrations (จัดการมือ) → policy เขียนน่าจะ drift/หายใน production
-- แก้: re-assert ให้ตรงตามเจตนา (admin/exec/finance/stock + หัวหน้าช่างปิดงานทีมตัวเองได้)
-- รันใน Supabase → SQL Editor ครั้งเดียว · ปลอดภัย (drop+create policy เดิม)
-- ═══════════════════════════════════════════════════════════════════════════

alter table jobs enable row level security;

-- อ่านได้ทุกคนที่ล็อกอิน (คงเดิม)
drop policy if exists jobs_read on jobs;
create policy jobs_read on jobs for select to authenticated using (true);

-- เขียน/ปิดงาน: ธุรการ · ผู้บริหาร · บัญชี · ธุรการวัสดุ · หัวหน้าช่าง
drop policy if exists jobs_write on jobs;
create policy jobs_write on jobs for all to authenticated
  using (my_role() in ('admin','exec','finance','stock','lead_tech'))
  with check (my_role() in ('admin','exec','finance','stock','lead_tech'));
