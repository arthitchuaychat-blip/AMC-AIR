-- 216_calendar_events.sql — นัดหมายอิสระในปฏิทิน (ไม่ต้องผูกใบงาน)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
create table if not exists calendar_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  start_at    timestamptz not null,
  end_at      timestamptz,
  slot        text,               -- morning/afternoon/full/custom (ไม่บังคับ)
  team        text,               -- teams.id (ไม่บังคับ)
  note        text,
  customer_id text,
  created_by  uuid,
  created_at  timestamptz default now()
);
create index if not exists calendar_events_start on calendar_events (start_at);

alter table calendar_events enable row level security;
do $$ begin
  -- อ่าน: ทุกคนที่ล็อกอิน (ปฏิทินเปิดให้ช่างดูด้วย) · เขียน/ลบ: ทีมออฟฟิศ + หัวหน้าช่าง
  create policy cal_ev_read on calendar_events for select to authenticated using (true);
  create policy cal_ev_write on calendar_events for all to authenticated
    using (my_role() in ('admin','exec','finance','hr','sales','field_sales','lead_tech'))
    with check (my_role() in ('admin','exec','finance','hr','sales','field_sales','lead_tech'));
exception when duplicate_object then null; end $$;

select 'calendar_events ready' as status;
