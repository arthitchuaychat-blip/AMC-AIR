-- 192_service_reminders.sql — นัดบริการรอบถัดไป (ล้าง/PM) จากใบส่งมอบงาน
-- ช่างกรอก "นัดล้างครั้งถัดไป"/"นัด PM รอบถัดไป" ในใบส่งมอบ → เก็บเป็นนัด ให้ (1) แจ้งเตือนออฟฟิศ
-- (2) โผล่ในปฏิทิน ICS (Google เตือนวันนั้น) (3) รายการให้ออฟฟิศตามงาน = รายได้ต่อเนื่อง
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists service_reminders (
  id           bigint generated always as identity primary key,
  due_date     date not null,                 -- วันนัดบริการรอบถัดไป
  kind         text,                           -- 'wash' | 'pmc' | อื่น ๆ
  customer_name text,
  contact_phone text,
  job_no       text,                           -- ใบงานเดิมที่ทำให้เกิดนัด
  handover_id  uuid references job_handovers(id) on delete set null,   -- job_handovers.id เป็น uuid
  note         text,
  status       text not null default 'open' check (status in ('open','done','dismissed')),
  created_by   uuid, created_at timestamptz not null default now()
);
create index if not exists service_reminders_due_idx on service_reminders(due_date);
create index if not exists service_reminders_status_idx on service_reminders(status);

alter table service_reminders enable row level security;
-- อ่านได้ทุกคนที่ล็อกอิน (ไม่ใช่ข้อมูลอ่อนไหว) · เพิ่มได้ทุกคน (ช่างส่งใบแล้วสร้างนัดอัตโนมัติ)
-- แก้/ปิดได้เฉพาะผู้จัดการ หรือผู้สร้าง · ลบเฉพาะผู้จัดการ
drop policy if exists sr_read on service_reminders;
create policy sr_read on service_reminders for select to authenticated using (true);
drop policy if exists sr_ins on service_reminders;
create policy sr_ins on service_reminders for insert to authenticated with check (true);
drop policy if exists sr_upd on service_reminders;
create policy sr_upd on service_reminders for update to authenticated
  using (my_role() in ('admin','exec','sales','finance','hr','lead_tech') or created_by = auth.uid())
  with check (true);
drop policy if exists sr_del on service_reminders;
create policy sr_del on service_reminders for delete to authenticated
  using (my_role() in ('admin','exec','sales','finance','hr','lead_tech'));

-- ✅ ตรวจผล
select 'service_reminders ready' as status;
