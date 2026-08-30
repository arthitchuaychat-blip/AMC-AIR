-- 236: คู่มือตำแหน่งงาน — ประกาศ/อัปเดตแก้ในแอปได้ (ต่อตำแหน่ง) + ปุ่ม "อ่านแล้ว" ติดตามคนอ่าน
-- โครงคู่มือหลัก (วัตถุประสงค์/หน้าที่/SOP/KPI) ยังอยู่ใน lib/handbook.js — ตารางนี้เสริมส่วนที่เปลี่ยนบ่อย

create table if not exists handbook_notes (
  id bigserial primary key,
  role text not null,                 -- ตำแหน่งที่ประกาศนี้แสดง
  title text,
  body text not null,
  sort int not null default 0,
  updated_at timestamptz default now(),
  updated_by uuid
);
create index if not exists handbook_notes_role on handbook_notes(role);
alter table handbook_notes enable row level security;
drop policy if exists handbook_notes_read on handbook_notes;
create policy handbook_notes_read on handbook_notes for select using (true);
drop policy if exists handbook_notes_write on handbook_notes;
create policy handbook_notes_write on handbook_notes for all
  using (my_role() in ('admin','exec')) with check (my_role() in ('admin','exec'));

create table if not exists handbook_ack (
  user_id uuid not null,
  role text not null,                 -- ตำแหน่งที่กดรับทราบ (ปกติ = ตำแหน่งตัวเอง)
  acked_at timestamptz default now(),
  primary key (user_id, role)
);
alter table handbook_ack enable row level security;
drop policy if exists handbook_ack_read on handbook_ack;
create policy handbook_ack_read on handbook_ack for select
  using (user_id = auth.uid() or my_role() in ('admin','exec','hr'));
drop policy if exists handbook_ack_self on handbook_ack;
create policy handbook_ack_self on handbook_ack for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- ผู้จัดการรีเซ็ตการรับทราบได้ (เมื่อมีอัปเดตสำคัญ ให้ทุกคนกดอ่านใหม่)
drop policy if exists handbook_ack_mgr on handbook_ack;
create policy handbook_ack_mgr on handbook_ack for delete
  using (my_role() in ('admin','exec'));
