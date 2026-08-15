-- 211_secure_config.sql — ที่เก็บความลับฝั่งเซิร์ฟเวอร์ (เช่น Gmail refresh token)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
-- RLS เปิดแต่ "ไม่มี policy" = ไม่มี client role ใดอ่าน/เขียนได้เลย
-- (เฉพาะ service role key ฝั่ง serverless เท่านั้นที่เข้าถึง เพราะ service role ข้าม RLS)

create table if not exists secure_config (
  key        text primary key,
  value      text,
  updated_at timestamptz default now()
);
alter table secure_config enable row level security;

select 'secure_config ready' as status;
