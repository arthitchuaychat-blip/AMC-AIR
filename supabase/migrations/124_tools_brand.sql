-- 124_tools_brand.sql — เพิ่มช่อง "ยี่ห้อ" ให้เครื่องมือช่าง
-- รันใน Supabase → SQL Editor (ครั้งเดียว · รันซ้ำได้)

alter table tools add column if not exists brand text;

-- ✅ ตรวจผล
select column_name from information_schema.columns where table_name = 'tools' and column_name = 'brand';
