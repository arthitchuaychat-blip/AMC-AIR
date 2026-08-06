-- 203_job_rating.sql — คะแนนความพอใจผูกกับ "ใบงาน" (แทนที่จะผูกใบส่งมอบ)
--
-- เจ้าของ: บางงานลูกค้าไม่ได้ขอใบส่งมอบ → ต้องขอคะแนนโดยอ้างเลขใบงาน (JOB-)
-- เก็บคะแนนบน job_orders → เชื่อม assigned_team เข้าสกอร์การ์ดทีมได้ตรง ๆ (mig 204)
--
-- เขียนผ่าน /api/rate (token HMAC "job:<job_no>") ลูกค้าไม่ต้องล็อกอิน
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table job_orders add column if not exists cust_rating   int check (cust_rating between 1 and 5);
alter table job_orders add column if not exists cust_comment  text;
alter table job_orders add column if not exists cust_rated_at timestamptz;

-- ✅ ตรวจผล
select 'job rating ready' as status;
