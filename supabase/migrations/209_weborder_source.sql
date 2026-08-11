-- 209_weborder_source.sql — เก็บ "ที่มา" ของคำสั่งซื้อจากเว็บ (วัด ROI โฆษณา)
--
-- ฟอร์มเว็บส่ง source (ช่องทางอ่านง่าย เช่น "Facebook (แอด)") + utm (รายละเอียด utm/referrer/gclid/fbclid)
-- ตอนสร้างลูกค้าจากคำสั่งซื้อ → โยน source เข้า customers.source (mig 199) → เข้ารายงาน ROI ในเมนูท่อขาย
--
-- (เว็บมี fallback ตัด source/utm ออกถ้าคอลัมน์ยังไม่มี — รันอันนี้เพื่อเก็บได้จริง)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table web_orders add column if not exists source text;
alter table web_orders add column if not exists utm    jsonb;

create index if not exists web_orders_source_idx on web_orders(source) where source is not null;

-- ✅ ตรวจผล
select 'web_order source/utm ready' as status;
