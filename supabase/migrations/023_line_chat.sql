-- กระดานแชต LINE OA ในแอป
-- เก็บผู้ติดต่อ LINE (1 คน = 1 line_user_id) + ข้อความเข้า/ออก · เชื่อมกับลูกค้าใน CRM ได้
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists line_contacts (
  line_user_id    text primary key,
  display_name    text,
  picture_url     text,
  customer_id     bigint references customers(id) on delete set null,
  last_message    text,
  last_message_at timestamptz,
  unread          int not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists line_messages (
  id              bigint generated always as identity primary key,
  line_user_id    text not null references line_contacts(line_user_id) on delete cascade,
  direction       text not null check (direction in ('in','out')),
  type            text not null default 'text',     -- text | image | sticker | other
  text            text,
  image_url       text,
  line_message_id text,
  sent_by         uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index if not exists idx_line_msg_user on line_messages(line_user_id, created_at);

-- เพิ่ม unread + อัปเดตข้อความล่าสุด (เรียกจาก webhook ด้วย service role)
create or replace function line_bump_unread(p_uid text, p_msg text)
returns void language sql security definer set search_path = public as $$
  update line_contacts set unread = unread + 1, last_message = p_msg, last_message_at = now()
  where line_user_id = p_uid;
$$;

-- ---------- RLS: เฉพาะฝ่ายออฟฟิศเห็น/ตอบแชต ----------
alter table line_contacts enable row level security;
alter table line_messages enable row level security;

create policy lc_read on line_contacts for select to authenticated
  using (my_role() in ('admin','sales','exec','finance','lead_tech'));
create policy lc_update on line_contacts for update to authenticated
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
create policy lm_read on line_messages for select to authenticated
  using (my_role() in ('admin','sales','exec','finance','lead_tech'));
-- หมายเหตุ: การเขียนข้อความเข้า/ออกทำผ่าน Edge/Serverless function (service role) จึงไม่ต้องมี policy insert ฝั่ง client

-- ---------- เปิด Realtime ให้กระดานแชตเด้งสด ----------
alter publication supabase_realtime add table line_messages;
alter publication supabase_realtime add table line_contacts;
