-- 101_web_article_body.sql — เนื้อหาเต็มของบทความ → แสดงเป็นหน้าเว็บแยก amcair.net/a/<เลข>
-- (RLS เดิมของ web_articles ครอบคลุมอยู่แล้ว — anon อ่านได้เฉพาะ active)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table web_articles add column if not exists body text;

comment on column web_articles.body is 'เนื้อหาบทความเต็ม (ข้อความล้วน เว้นบรรทัดว่าง = ย่อหน้าใหม่) — แสดงที่ amcair.net/a/<id>';
