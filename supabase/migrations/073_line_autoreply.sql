-- 073_line_autoreply.sql — ตอบแชต LINE อัตโนมัติ (ทักทายคนใหม่ + นอกเวลาทำการ)
-- เก็บเวลาที่ส่งตอบอัตโนมัติล่าสุดต่อผู้ติดต่อ เพื่อกันการตอบถี่เกินไป (cooldown)
-- ตัวข้อความ/เวลาทำการ เก็บใน app_config (key='autoreply') ตั้งผ่านหน้า ตั้งค่า
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table line_contacts add column if not exists last_autoreply_at timestamptz;
