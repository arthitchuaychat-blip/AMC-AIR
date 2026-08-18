-- 218_adjustment_notes.sql — ใบลดหนี้ (Credit Note) + ใบเพิ่มหนี้ (Debit Note)
-- ปรับยอดหลังออกใบเสร็จ/ใบแจ้งหนี้แล้ว (ขอบเขตงานเปลี่ยน เพิ่ม/ลดบางอย่าง)
-- ตารางเดียวคุมทั้ง 2 ชนิดด้วยคอลัมน์ kind · อ้างอิงเอกสารต้นทางเสมอ (ตาม ป.รัษฎากร ม.86/9, 86/10)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists adjustment_notes (
  note_no      text primary key,
  kind         text not null check (kind in ('credit','debit')),   -- credit=ใบลดหนี้ · debit=ใบเพิ่มหนี้
  -- เอกสารต้นทางที่ปรับ (อ้างอย่างน้อยหนึ่งใบ) — sales chain เดียวกับใบเสร็จ
  receipt_no   text references receipts(receipt_no)   on delete set null,
  invoice_no   text references invoices(invoice_no)   on delete set null,
  quote_no     text references quotations(quote_no)   on delete set null,
  boq_no       text,
  job_no       text references job_orders(job_no)     on delete set null,
  customer_id  bigint references customers(id)        on delete set null,
  site_id      bigint references customer_sites(id)   on delete set null,
  issue_date   date,
  reason       text,                                  -- เหตุผลการปรับ (แสดงในเอกสาร)
  is_vat       boolean not null default false,        -- สืบทอดจากใบต้นทาง (มี VAT ไหม)
  items        jsonb   not null default '[]'::jsonb,  -- รายการที่ลด/เพิ่ม (ของตัวเอง ไม่ได้ดึงจากใบเสนอ)
  base         numeric not null default 0,            -- ยอดก่อน VAT
  vat_amt      numeric not null default 0,
  total        numeric not null default 0,            -- base + vat
  wht_rate     numeric not null default 3,
  wht_amt      numeric not null default 0,            -- หัก ณ ที่จ่าย
  net          numeric not null default 0,            -- total − wht
  note         text,
  internal_note text,
  terms_payment text, terms_freebies text, terms_warranty text,
  sign_url     text, sign_name text,
  status       text not null default 'issued' check (status in ('issued','cancelled')),
  cancel_reason text, cancelled_at timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);

create index if not exists idx_adjnotes_receipt on adjustment_notes(receipt_no);
create index if not exists idx_adjnotes_invoice on adjustment_notes(invoice_no);
create index if not exists idx_adjnotes_quote   on adjustment_notes(quote_no);
create index if not exists idx_adjnotes_kind    on adjustment_notes(kind);

alter table adjustment_notes enable row level security;

-- อ่าน = ผู้ใช้ที่ล็อกอินทุกคน (เหมือนใบเสร็จ/ใบแจ้งหนี้)
drop policy if exists adjnotes_read on adjustment_notes;
create policy adjnotes_read on adjustment_notes for select using (true);

-- เขียน = ธุรการ/ขาย/ผู้บริหาร/การเงิน (เหมือน rc_write/inv_write)
drop policy if exists adjnotes_write on adjustment_notes;
create policy adjnotes_write on adjustment_notes for all
  using (my_role() in ('admin','sales','field_sales','exec','finance'))
  with check (my_role() in ('admin','sales','field_sales','exec','finance'));

select 'adjustment_notes ready' as status;
