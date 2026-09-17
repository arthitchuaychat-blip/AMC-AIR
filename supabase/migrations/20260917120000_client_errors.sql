-- v847 · เก็บ error จากเครื่องผู้ใช้ (client_errors) — "รู้ปัญหาก่อนพนักงานมาบอก" (แผน stability สัปดาห์แรก)
--
-- ความเป็นส่วนตัว (ตามเจตนาเดิมใน ErrorBoundary ที่ไม่ส่ง stack ออกข้างนอก):
--   · เก็บใน Supabase ของเราเอง ที่เดียวกับที่ข้อมูลลูกค้าอยู่แล้ว — ไม่ส่งบริการภายนอก
--   · แอปตัด message/stack ให้สั้น และไม่เก็บ props/state/ข้อมูลฟอร์ม
--   · insert ได้เฉพาะแถวของตัวเอง (user_id = auth.uid()) · อ่านได้เฉพาะ admin/exec
create table if not exists public.client_errors (
  id              bigserial primary key,
  at              timestamptz not null default now(),
  user_id         uuid,
  build           text,        -- BUILD ที่รันอยู่ (v8xx) — รู้ว่าเวอร์ชันไหนพัง
  url             text,        -- hash/เมนูที่เปิดอยู่ตอนพัง
  kind            text,        -- render | window.error | unhandledrejection
  message         text,
  stack           text,
  component_stack text,
  ua              text         -- เบราว์เซอร์/มือถือ (ตัดสั้น)
);
create index if not exists client_errors_at_idx on public.client_errors(at desc);

alter table public.client_errors enable row level security;
drop policy if exists client_errors_ins on public.client_errors;
create policy client_errors_ins on public.client_errors for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists client_errors_read on public.client_errors;
create policy client_errors_read on public.client_errors for select to authenticated
  using (my_role() in ('admin', 'exec'));

-- ดูล่าสุด: select at, build, kind, url, left(message, 120) from client_errors order by at desc limit 50;
