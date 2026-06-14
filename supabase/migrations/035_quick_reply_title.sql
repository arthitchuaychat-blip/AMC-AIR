-- เพิ่ม "ชื่อหัวข้อ" ให้ข้อความตอบกลับสำเร็จรูป — เพื่อให้ค้นหา/หาเจอง่ายขึ้น
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table quick_replies add column if not exists title text;
