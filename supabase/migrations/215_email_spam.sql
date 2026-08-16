-- 215_email_spam.sql — ธงบอกว่าอีเมล/เธรดนี้อยู่ในกล่องสแปมของ Gmail
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
alter table email_messages add column if not exists spam boolean default false;
alter table email_threads  add column if not exists spam boolean default false;
select 'email spam flag ready' as status;
