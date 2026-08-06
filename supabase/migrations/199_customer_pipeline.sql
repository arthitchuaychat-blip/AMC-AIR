-- 199_customer_pipeline.sql — แหล่งที่มาลูกค้า + ท่อขาย (sales pipeline)
--
-- ข้อ 2/3 จากแผนพัฒนา: รู้ว่าลูกค้ามาจากช่องทางไหน (วัด ROI โฆษณา) + ไม่มี lead หลุดจากมือเซลส์
-- ต่อยอดบนตาราง customers เดิม (ไม่สร้างตารางใหม่ → ประวัติงาน/ยอดค้างรับผูกกันเหมือนเดิม)
--
-- source  = ช่องทางที่มา (LINE/Facebook/ป้าย/แนะนำ/โฆษณา/เว็บ/Walk-in/โทร/อื่นๆ)
-- stage   = ขั้นท่อขาย (new ผู้สนใจ · contact กำลังคุย · survey สำรวจ · quote เสนอราคา · won ปิด · lost ไม่ปิด)
-- owner_id = เซลส์ผู้ดูแล lead นี้ · next_followup = นัดติดตามครั้งถัดไป · est_value = มูลค่าคาดว่าจะปิด
--
-- customers write RLS = admin/sales/exec/finance/hr อยู่แล้ว (mig 095) — คอลัมน์ใหม่ใช้สิทธิ์เดิม ไม่ต้องแก้ RLS
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table customers add column if not exists source        text;
alter table customers add column if not exists stage         text;
alter table customers add column if not exists owner_id      uuid references auth.users(id);
alter table customers add column if not exists next_followup date;
alter table customers add column if not exists est_value     numeric;
alter table customers add column if not exists lost_reason   text;

create index if not exists customers_stage_idx    on customers(stage)         where stage is not null;
create index if not exists customers_followup_idx on customers(next_followup) where next_followup is not null;
create index if not exists customers_owner_idx    on customers(owner_id)      where owner_id is not null;

-- ✅ ตรวจผล
select 'customer pipeline ready' as status;
