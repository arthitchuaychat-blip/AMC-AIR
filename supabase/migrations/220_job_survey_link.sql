-- 220_job_survey_link.sql — ผูกใบงานติดตั้ง → ใบงานสำรวจต้นทาง (ข้อมูลสำรวจไหลต่อเนื่อง)
-- ใบงานติดตั้งชี้กลับไปใบงานสำรวจที่เกี่ยวข้อง (แบบเดียวกับ rework_of mig 188)
-- ⚠️ ไม่แตะ quote_no ของใบสำรวจ → งานสำรวจยังเป็น "ค่าใช้จ่ายการขาย" ในหน้ากำไรเหมือนเดิม
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
alter table job_orders add column if not exists survey_job_no text references job_orders(job_no) on delete set null;
create index if not exists idx_job_orders_survey on job_orders(survey_job_no);
select 'job survey link ready' as status;
