-- 070_job_templates.sql — แม่แบบใบงาน (เช่น "ล้างแอร์ 24000 BTU", "ติดตั้งแอร์ออฟฟิศ")
-- เก็บประเภทงาน + ชื่องาน + รายละเอียด/รายการที่ต้องทำ ไว้ใช้ซ้ำ ลดการพิมพ์ใหม่
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists job_order_templates (
  id          bigint generated always as identity primary key,
  name        text not null,                         -- ชื่อแม่แบบ (ที่โชว์ในรายการให้เลือก)
  job_type    text not null default 'maintenance',   -- survey | install | repair | maintenance | other
  title       text,                                  -- ชื่องานตั้งต้น
  details     text,                                  -- รายละเอียด/รายการที่ต้องทำ ตั้งต้น
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table job_order_templates enable row level security;

-- อ่านได้ทุกคน (ช่างก็เห็นแม่แบบร่วม)
drop policy if exists jot_read on job_order_templates;
create policy jot_read on job_order_templates for select to authenticated using (true);

-- สร้าง/แก้/ลบ: ฝ่ายออฟฟิศ
drop policy if exists jot_write on job_order_templates;
create policy jot_write on job_order_templates for all to authenticated
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
