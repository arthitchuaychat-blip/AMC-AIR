-- v848 · กัน "ชุดหลายแถว" ซ้ำระดับ DB — เบิก/คืน/ชำรุด/รับของ ใน transactions (recordTransactions)
--
-- เอกสารใช้ unique บน request_id ต่อแถวได้ (1 ใบ = 1 แถว) แต่การเคลื่อนไหวสต๊อก 1 การกด = หลายแถวที่แชร์ id เดียว
-- → ใช้ตารางจอง: แอปสร้าง request_id ต่อ "ความพยายามส่ง" (useRef ล้างเมื่อสำเร็จเท่านั้น) แล้ว insert ลงนี่ก่อน
--   · จองได้ → insert ชุดต่อ · insert ชุดล้ม → ลบการจอง ให้กดใหม่ได้
--   · จองซ้ำ (23505) → ชุดนี้บันทึกไปแล้วจากรอบก่อน (กดซ้ำ/retry หลังเน็ตหลุด) → แอปบอกผู้ใช้ ไม่บันทึกซ้ำ ไม่คิดต้นทุนซ้ำ
-- ยังไม่รัน SQL นี้ แอปก็ทำงานเหมือนเดิม (ตารางไม่มี = ข้ามการจอง)
create table if not exists public.write_requests (
  request_id text primary key,               -- UUID หรือ "UUID:job" (ชุดคู่แฝดเบิกเข้างานอัตโนมัติหลังรับของ)
  kind       text,                            -- withdraw | return | purchase | damage
  ref_no     text,                            -- เลขชุด WD/RT/PC/DG-… ของรอบที่บันทึกจริง
  user_id    uuid default auth.uid(),
  at         timestamptz not null default now()
);
create index if not exists write_requests_at_idx on public.write_requests(at desc);

alter table public.write_requests enable row level security;
drop policy if exists write_requests_ins on public.write_requests;
create policy write_requests_ins on public.write_requests for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists write_requests_sel on public.write_requests;
create policy write_requests_sel on public.write_requests for select to authenticated
  using (user_id = auth.uid() or my_role() in ('admin', 'exec'));
drop policy if exists write_requests_del on public.write_requests;
create policy write_requests_del on public.write_requests for delete to authenticated
  using (user_id = auth.uid());

-- เก็บกวาดได้ (ไม่บังคับ): delete from write_requests where at < now() - interval '30 days';
