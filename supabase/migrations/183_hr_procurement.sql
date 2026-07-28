-- 183_hr_procurement.sql — ให้ตำแหน่ง "บุคคล" (hr) ทำงานจัดซื้อได้ครบ
--   เดิม hr มี PO + เตรียมวัสดุ + สินค้า อยู่แล้ว (mig 109/151) · เพิ่มอีก 2 ส่วน: ผู้ขาย + รับของเข้าสต๊อก
--   ลบ/แก้ transactions ย้อนหลังคงไว้ที่ admin/exec/finance ตามกติกาบ้าน (เหมือนที่ทำกับฝ่ายขาย mig 174)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- (1) ผู้ขาย + ผู้ติดต่อ + ที่อยู่ผู้ขาย — เพิ่ม hr (เดิม admin/exec/finance/stock)
drop policy if exists sup_write on suppliers;
create policy sup_write on suppliers for all to authenticated
  using (my_role() in ('admin','exec','finance','stock','hr')) with check (my_role() in ('admin','exec','finance','stock','hr'));
drop policy if exists supc_write on supplier_contacts;
create policy supc_write on supplier_contacts for all to authenticated
  using (my_role() in ('admin','exec','finance','stock','hr')) with check (my_role() in ('admin','exec','finance','stock','hr'));
drop policy if exists sups_write on supplier_sites;
create policy sups_write on supplier_sites for all to authenticated
  using (my_role() in ('admin','exec','finance','stock','hr')) with check (my_role() in ('admin','exec','finance','stock','hr'));

-- (2) รับของเข้าสต๊อก: เขียน/อ่าน transactions — เพิ่ม hr (mirror ฝ่ายขาย mig 174)
drop policy if exists txn_insert on transactions;
create policy txn_insert on transactions for insert to authenticated
  with check (
    my_role() in ('admin', 'exec', 'finance', 'stock', 'sales', 'hr')
    or (my_role() = 'tech' and team = my_team() and type in ('withdraw', 'return'))
    or (my_role() = 'lead_tech' and type in ('withdraw', 'return'))
  );
drop policy if exists txn_read on transactions;
create policy txn_read on transactions for select to authenticated
  using (my_role() in ('admin', 'exec', 'finance', 'stock', 'sales', 'lead_tech', 'hr') or team = my_team());

-- ✅ ตรวจผล: เงื่อนไขต้องมี hr (ลบ/แก้ยังเป็น admin/exec/finance เท่านั้น — ไม่แตะ)
select 'hr procurement ready' as status;
