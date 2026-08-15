-- 212_email_inbox.sql — กล่องอีเมลในแอป (mirror Gmail ของ info@amcair.net)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- เธรดอีเมล (1 บทสนทนา = 1 แถว, key = Gmail thread id)
create table if not exists email_threads (
  thread_id       text primary key,
  subject         text,
  from_email      text,          -- คู่สนทนาภายนอก (ลูกค้า)
  from_name       text,
  snippet         text,          -- ตัวอย่างข้อความล่าสุด
  last_message_at timestamptz,
  last_inbound_at timestamptz,   -- เมลเข้าล่าสุด (ใช้คำนวณ unread)
  last_read_at    timestamptz,   -- เปิดอ่านล่าสุด
  unread          boolean default true,
  assigned_to     uuid references profiles(id) on delete set null,
  customer_id     text,          -- ผูกลูกค้า (เหมือนแชต LINE)
  updated_at      timestamptz default now()
);
create index if not exists email_threads_last on email_threads (last_message_at desc nulls last);

-- ข้อความรายฉบับ (key = Gmail message id)
create table if not exists email_messages (
  id                text primary key,
  thread_id         text references email_threads(thread_id) on delete cascade,
  direction         text,        -- 'in' | 'out'
  from_email        text,
  from_name         text,
  to_email          text,
  subject           text,
  snippet           text,
  body_text         text,
  message_id_header text,        -- RFC Message-ID (ใช้ตอบให้ต่อเธรด)
  sent_by           uuid references profiles(id) on delete set null,
  created_at        timestamptz
);
create index if not exists email_messages_thread on email_messages (thread_id, created_at);

-- RLS: ทีมหลังบ้านที่เข้าถึงแชตได้ = อ่าน/อัปเดตได้ · insert/ลบ = service role เท่านั้น (ฝั่ง serverless)
alter table email_threads enable row level security;
alter table email_messages enable row level security;

do $$ begin
  -- office = role ที่มีสิทธิ์ดูแชตลูกค้า
  create policy email_threads_read on email_threads for select to authenticated
    using (my_role() in ('admin','exec','finance','hr','sales','field_sales','graphic'));
  create policy email_threads_upd on email_threads for update to authenticated
    using (my_role() in ('admin','exec','finance','hr','sales','field_sales','graphic'));
  create policy email_messages_read on email_messages for select to authenticated
    using (my_role() in ('admin','exec','finance','hr','sales','field_sales','graphic'));
exception when duplicate_object then null; end $$;

select 'email inbox ready' as status;
