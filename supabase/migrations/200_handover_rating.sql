-- 200_handover_rating.sql — คะแนนความพอใจลูกค้าหลังจบงาน (ข้อ 3/3 แผนพัฒนา)
--
-- ลูกค้าเปิดลิงก์ใบส่งมอบงาน (?ho=&t=) ที่ส่งทาง LINE อยู่แล้ว → ให้ดาว 1-5 + ความเห็น
-- คะแนนเก็บบน job_handovers → เชื่อมกลับ job_no → assigned_team → เข้าสกอร์การ์ดทีม (mig 201)
--
-- เขียนผ่าน endpoint /api/handover-rate (service role + token HMAC) ลูกค้าไม่ต้องล็อกอิน
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table job_handovers add column if not exists cust_rating   int check (cust_rating between 1 and 5);
alter table job_handovers add column if not exists cust_comment  text;
alter table job_handovers add column if not exists cust_rated_at timestamptz;

-- ✅ ตรวจผล
select 'handover rating ready' as status;
