-- 213_email_attachments.sql — ไฟล์แนบในอีเมล
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
alter table email_messages add column if not exists attachments jsonb default '[]'::jsonb;
select 'email attachments ready' as status;
