-- 207_weborder_lineid.sql — เก็บ LINE ID ที่ลูกค้ากรอกในฟอร์มขอใบเสนอราคาบนเว็บไซต์
--
-- ฟอร์มเว็บ (company-website) เพิ่มช่อง LINE ID → ต้องมีคอลัมน์รองรับ
-- (เว็บมี fallback ตัด line_id ออกถ้าคอลัมน์ยังไม่มี — แต่รันอันนี้เพื่อให้เก็บได้จริง)
--
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table web_orders add column if not exists line_id text;

-- ✅ ตรวจผล
select 'web_order line_id ready' as status;
