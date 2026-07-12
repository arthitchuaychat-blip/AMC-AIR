-- 138_line_supplier_contacts.sql — แยกแชต LINE ของซัพพลายเออร์ออกจากลูกค้า
-- line_contacts.kind: 'customer' (ค่าเดิม) | 'supplier' → เมนูแชตแยกแท็บ 🏭 ซัพพลายเออร์
-- supplier_id ผูกกับทะเบียนผู้ขาย (เมนูผู้ขาย) เพื่อส่ง PO เข้าแชต/ดูข้อมูลผู้ขาย
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table line_contacts add column if not exists kind text not null default 'customer';
alter table line_contacts add column if not exists supplier_id bigint references suppliers(id) on delete set null;

-- ✅ ตรวจผล: ต้องเห็นคอลัมน์ kind และ supplier_id
select column_name, data_type from information_schema.columns
where table_name = 'line_contacts' and column_name in ('kind','supplier_id');
