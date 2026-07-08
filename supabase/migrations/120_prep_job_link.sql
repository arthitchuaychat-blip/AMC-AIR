-- 120_prep_job_link.sql — ผูกใบเตรียมวัสดุกับใบงานตรง ๆ (material_preps.job_no)
-- เดิมลิงก์ผ่านใบเสนอราคาเท่านั้น → ใบงานที่ไม่มี/คนละใบเสนอ ลิงก์ไม่ติด
-- รันใน Supabase → SQL Editor (ครั้งเดียว · รันซ้ำได้)

alter table material_preps add column if not exists job_no text;

-- เติมย้อนหลัง: ชื่อใบเตรียมที่สร้างจากใบงานขึ้นต้นว่า "งาน JOB-xxxxxx-xxxx" — ดึงเลขงานจากชื่อ
update material_preps
set job_no = substring(title from 'JOB-[0-9]+-[0-9]+')
where job_no is null and title like '%JOB-%';

-- ✅ ตรวจผล
select prep_no, job_no, title from material_preps order by created_at desc limit 20;
