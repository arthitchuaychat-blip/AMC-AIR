-- 217_customer_branch.sql — สาขาของลูกค้านิติบุคคล (สำนักงานใหญ่ / สาขาที่ …) สำหรับเอกสารภาษี
-- รันใน Supabase → SQL Editor (ครั้งเดียว) · ค่าว่าง (null) = ถือเป็น "สำนักงานใหญ่" ตอนพิมพ์
alter table customers add column if not exists branch text;
select 'customer branch ready' as status;
