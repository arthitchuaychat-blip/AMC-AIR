-- 132_quick_reply_images.sql — แนบรูปในข้อความตอบกลับสำเร็จรูป (แชต LINE OA)
-- กดใช้ข้อความ → รูปที่แนบไว้จะส่งตามไปพร้อมข้อความ
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table quick_replies add column if not exists images jsonb not null default '[]'::jsonb;

-- ✅ ตรวจผล: ต้องเห็นคอลัมน์ images
select column_name, data_type from information_schema.columns
where table_name = 'quick_replies' order by ordinal_position;
