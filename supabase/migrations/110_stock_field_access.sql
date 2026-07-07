-- 110_stock_field_access.sql — ธุรการวัสดุ (stock) ออกหน้างาน/คุมงาน: อัปเดตใบงาน + รอบเข้างาน + ทำใบส่งมอบงานได้
-- (โพสต์ภาพ/คอมเมนต์ลง timeline ใบงาน stock ทำได้อยู่แล้วตาม mig 065)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

drop policy if exists jo_write on job_orders;
create policy jo_write on job_orders for all to authenticated
  using (my_role() in ('admin', 'sales', 'exec', 'finance', 'hr', 'stock'))
  with check (my_role() in ('admin', 'sales', 'exec', 'finance', 'hr', 'stock'));

drop policy if exists jv_write on job_visits;
create policy jv_write on job_visits for all to authenticated
  using (my_role() in ('admin', 'sales', 'exec', 'finance', 'hr', 'stock'))
  with check (my_role() in ('admin', 'sales', 'exec', 'finance', 'hr', 'stock'));

drop policy if exists job_handovers_rw on job_handovers;
create policy job_handovers_rw on job_handovers for all
  using (created_by = auth.uid() or my_role() in ('admin', 'exec', 'sales', 'finance', 'lead_tech', 'hr', 'stock'))
  with check (created_by = auth.uid() or my_role() in ('admin', 'exec', 'sales', 'finance', 'lead_tech', 'hr', 'stock'));

-- ✅ ตรวจผล: ทุกนโยบายต้องมี stock
select c.relname as ตาราง, p.polname as นโยบาย, pg_get_expr(p.polwithcheck, p.polrelid) as เงื่อนไขเขียน
from pg_policy p join pg_class c on c.oid = p.polrelid
where c.relname in ('job_orders', 'job_visits', 'job_handovers') and p.polname in ('jo_write', 'jv_write', 'job_handovers_rw');
