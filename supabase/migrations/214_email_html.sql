-- 214_email_html.sql — เก็บเนื้อหา HTML ของอีเมล (แสดงแบบสวยเหมือน Gmail)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
alter table email_messages add column if not exists body_html text;
select 'email html ready' as status;
