-- 174: ฝ่ายขายรับสินค้าเข้าสต๊อก + บันทึกความเคลื่อนไหวสินค้าได้
--
-- เจ้าของสั่ง (2026-07-24): "ฝ่ายขายเป็นคนสั่งแอร์ เมื่อรับแอร์แล้วให้บันทึกรับได้ด้วย"
--
-- เส้นทางจริงตอนกด "รับสินค้าเข้าสต๊อก" บนใบสั่งซื้อ (PurchaseOrders → หน้า movements):
--   1. update purchase_orders (จองใบ status=received)      → sales ผ่านอยู่แล้ว (mig 151 po_upd)
--   2. insert transactions type='purchase'                  → ❌ sales ไม่มีสิทธิ์ (mig 114)
--   3. อ่าน transactions ผ่าน poReceivedQty (รับไปแล้วกี่ชิ้น)  → ❌ sales อ่านไม่ได้ (mig 126)
--   4. update materials.cost                                → sales ผ่านอยู่แล้ว (mig 151 mat_upd)
--   5. ถ้า PO ผูกใบเสนอ: insert transactions type='withdraw' เข้างาน → ❌ ติดข้อ 2
--
-- ⚠️ ข้อ 3 อันตรายกว่าที่คิด — poReceivedQty คืน {} เมื่ออ่านไม่ได้ = ระบบเข้าใจว่า "ยังไม่เคยรับของใบนี้"
--    หน้ารับของจึงเติมจำนวนเต็มใบให้ใหม่ทุกครั้ง → ทยอยรับ 2 รอบ = ของเข้าสต๊อกซ้ำสองเด้ง
--    และแท็บ "รับคืน"/รายการล่าสุดจะว่างเปล่าตลอด (listOpenJobs/ledger อ่านจาก transactions)
--    ส่วน "ยอดคงเหลือ" ไม่กระทบ — view material_stock เป็น security definer ตั้งแต่ mig 127 แล้ว

-- ---------- (1) เขียนความเคลื่อนไหวได้ (ซื้อเข้า/เบิก/คืน/ตัดเสีย/ปรับยอด) ----------
drop policy if exists txn_insert on transactions;
create policy txn_insert on transactions for insert to authenticated
  with check (
    my_role() in ('admin', 'exec', 'finance', 'stock', 'sales')
    or (my_role() = 'tech' and team = my_team() and type in ('withdraw', 'return'))
    or (my_role() = 'lead_tech' and type in ('withdraw', 'return'))
  );

-- ---------- (2) อ่านความเคลื่อนไหวได้ (ยอดสต๊อก/ประวัติ/ยอดที่รับไปแล้วของใบ PO) ----------
drop policy if exists txn_read on transactions;
create policy txn_read on transactions for select to authenticated
  using (my_role() in ('admin', 'exec', 'finance', 'stock', 'sales', 'lead_tech') or team = my_team());

-- ---------- ไม่แตะ: ลบ/แก้ย้อนหลัง ----------
-- txn_delete (ยกเลิกรับเข้าทั้งชุด) = admin/exec/finance  ← ตรงกับปุ่มในหน้าจอ (canEditPast) และกติกาบ้าน
-- txn_admin_edit (แก้รายการย้อนหลัง)  = admin/exec/finance
-- ฝ่ายขายรับผิดใบไหน ให้ธุรการ/บัญชีกด "ยกเลิกรับเข้าทั้งใบ" ให้ (ใบจะกลับเป็น "รอรับของ" แล้วรับใหม่ได้)

-- ✅ ตรวจผล 1: เงื่อนไขเขียน/อ่าน ต้องมี sales
-- select polname, pg_get_expr(polwithcheck, polrelid) as เงื่อนไขเขียน, pg_get_expr(polqual, polrelid) as เงื่อนไขอ่าน
--   from pg_policy where polrelid = 'transactions'::regclass and polname in ('txn_insert','txn_read');
--
-- ✅ ตรวจผล 2: ลบยังต้องเป็น admin/exec/finance เท่านั้น (ห้ามมี sales)
-- select polname, pg_get_expr(polqual, polrelid) from pg_policy
--   where polrelid = 'transactions'::regclass and polname in ('txn_delete','txn_admin_edit');
