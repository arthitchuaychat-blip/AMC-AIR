-- 208_review_source_job.sql — โยงรีวิวบนเว็บกลับไปที่ "ใบงาน" ที่ลูกค้าให้คะแนน
--
-- หน้ารีวิวในแอปจะ "ส่งรีวิวจริงขึ้นเว็บ" = insert เข้า web_reviews (mig 134) พร้อม source_job
--   → รู้ว่ารีวิวไหนมาจากงานไหน (กันส่งซ้ำ + ลบออกจากเว็บได้จากหน้าเดียว)
-- รีวิวที่ทีมกราฟิกพิมพ์เองยังใช้ได้ปกติ (source_job = null)
--
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table web_reviews add column if not exists source_job text;
create index if not exists web_reviews_source_job_idx on web_reviews(source_job) where source_job is not null;

-- ✅ ตรวจผล
select 'web_reviews.source_job ready' as status;
