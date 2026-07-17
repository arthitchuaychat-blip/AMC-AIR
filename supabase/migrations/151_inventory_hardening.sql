-- 151_inventory_hardening.sql — เก็บแข็งคลังสินค้า + จัดซื้อ (จากรีวิว 2026-07-17)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- (1) ตาราง transactions ไม่เคยมีนโยบาย DELETE เลย → ทุกการลบ (ยกเลิกรับเข้า/ลบรายการ) ได้ 0 แถวแบบเงียบ
--     ผลร้ายสุด: ยกเลิกรับเข้า PO — แถวซื้อยังอยู่แต่ใบเด้งกลับ "รอรับของ" กดรับใหม่ = สต๊อกเบิ้ลสองเท่า
drop policy if exists txn_delete on transactions;
create policy txn_delete on transactions for delete to authenticated
  using (my_role() in ('admin','exec','finance'));
-- แก้ไขย้อนหลังให้ตรงชุดเดียวกับ UI (เดิมรวม stock — แก้ตัวเลขผ่าน API ได้โดยไม่มี audit)
drop policy if exists txn_admin_edit on transactions;
create policy txn_admin_edit on transactions for update to authenticated
  using (my_role() in ('admin','exec','finance')) with check (my_role() in ('admin','exec','finance'));

-- (2) ผูกชุด "ซื้อเข้า" กับ "เบิกเข้างานอัตโนมัติ" ของการรับของ PO ไว้ด้วยกัน — ยกเลิกรับเข้าจะได้ลบครบทั้งคู่
--     (เดิมลบเฉพาะฝั่งซื้อ → สต๊อกติดลบ + งานมีต้นทุนผี)
alter table transactions add column if not exists po_no text;

-- (3) PO + รายการ: ลบถาวร = admin/exec เท่านั้น (เดิม 6 role ลบได้ผ่าน API ทั้งที่ UI ให้เฉพาะ admin)
drop policy if exists po_write on purchase_orders;
drop policy if exists po_sel on purchase_orders; drop policy if exists po_ins on purchase_orders;
drop policy if exists po_upd on purchase_orders; drop policy if exists po_del on purchase_orders;
create policy po_sel on purchase_orders for select to authenticated using (my_role() in ('admin','exec','finance','stock','sales','hr'));
create policy po_ins on purchase_orders for insert to authenticated with check (my_role() in ('admin','exec','finance','stock','sales','hr'));
create policy po_upd on purchase_orders for update to authenticated using (my_role() in ('admin','exec','finance','stock','sales','hr')) with check (my_role() in ('admin','exec','finance','stock','sales','hr'));
create policy po_del on purchase_orders for delete to authenticated using (my_role() in ('admin','exec'));
drop policy if exists poi_write on po_items;
drop policy if exists poi_sel on po_items; drop policy if exists poi_ins on po_items;
drop policy if exists poi_upd on po_items; drop policy if exists poi_del on po_items;
create policy poi_sel on po_items for select to authenticated using (my_role() in ('admin','exec','finance','stock','sales','hr'));
create policy poi_ins on po_items for insert to authenticated with check (my_role() in ('admin','exec','finance','stock','sales','hr'));
create policy poi_upd on po_items for update to authenticated using (my_role() in ('admin','exec','finance','stock','sales','hr')) with check (my_role() in ('admin','exec','finance','stock','sales','hr'));
create policy poi_del on po_items for delete to authenticated using (my_role() in ('admin','exec','finance','stock','sales','hr')); -- แก้ใบ = ลบ+ใส่รายการใหม่ ต้องเปิดให้คนแก้ใบ

-- (4) สินค้า: แก้ได้ตาม role เดิม แต่ "ลบถาวร" เหลือ admin/exec (เดิม sales/hr ลบสินค้าได้ผ่าน API)
drop policy if exists mat_write on materials;
drop policy if exists mat_sel on materials; drop policy if exists mat_ins on materials;
drop policy if exists mat_upd on materials; drop policy if exists mat_del on materials;
create policy mat_ins on materials for insert to authenticated with check (my_role() in ('admin','exec','finance','stock','sales','hr'));
create policy mat_upd on materials for update to authenticated using (my_role() in ('admin','exec','finance','stock','sales','hr')) with check (my_role() in ('admin','exec','finance','stock','sales','hr'));
create policy mat_del on materials for delete to authenticated using (my_role() in ('admin','exec'));
-- (นโยบาย select ของ materials มีของเดิมอยู่แล้ว — ไม่แตะ)

-- (5) รอบนับสต๊อกที่ "อัพเดทแล้ว" = หลักฐานตรวจย้อนหลัง — ห้ามลบ/แก้ (เดิมลบได้ทั้งที่ปรับสต๊อกไปแล้ว)
drop policy if exists sc_write on stock_counts;
drop policy if exists sc_ins on stock_counts; drop policy if exists sc_upd on stock_counts; drop policy if exists sc_del on stock_counts;
create policy sc_ins on stock_counts for insert to authenticated with check (my_role() in ('admin','exec','stock'));
create policy sc_upd on stock_counts for update to authenticated using (my_role() in ('admin','exec','stock') and status <> 'applied') with check (my_role() in ('admin','exec','stock'));
create policy sc_del on stock_counts for delete to authenticated using (my_role() in ('admin','exec','stock') and status <> 'applied');
