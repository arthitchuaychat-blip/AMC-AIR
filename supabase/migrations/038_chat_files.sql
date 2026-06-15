-- แนบไฟล์ในแชตทีม (เอกสาร/ไฟล์ทั่วไป นอกจากรูปภาพ)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
alter table chat_messages add column if not exists file_url text;
alter table chat_messages add column if not exists file_name text;
