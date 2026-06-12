-- ใบแจ้งหนี้ (แบ่งงวด) + ใบเสร็จรับเงิน
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists invoices (
  invoice_no   text primary key,
  quote_no     text references quotations(quote_no) on delete set null,
  boq_no       text,
  customer_id  bigint references customers(id) on delete set null,
  site_id      bigint references customer_sites(id) on delete set null,
  issue_date   date,
  due_date     date,
  installment  int,
  pct          numeric,
  base         numeric, vat_amt numeric, total numeric, wht_amt numeric,
  note         text,
  status       text not null default 'unpaid' check (status in ('unpaid','paid','cancelled')),
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);
create index if not exists idx_invoices_quote on invoices(quote_no);

create table if not exists receipts (
  receipt_no   text primary key,
  invoice_no   text references invoices(invoice_no) on delete set null,
  quote_no     text references quotations(quote_no) on delete set null,
  boq_no       text,
  job_no       text references job_orders(job_no) on delete set null,
  customer_id  bigint references customers(id) on delete set null,
  site_id      bigint references customer_sites(id) on delete set null,
  issue_date   date,
  payment_method text,
  base         numeric, vat_amt numeric, total numeric, wht_amt numeric, net numeric,
  note         text,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);
create index if not exists idx_receipts_invoice on receipts(invoice_no);

alter table invoices enable row level security;
alter table receipts enable row level security;
create policy inv_read on invoices for select to authenticated using (true);
create policy inv_write on invoices for all to authenticated
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
create policy rc_read on receipts for select to authenticated using (true);
create policy rc_write on receipts for all to authenticated
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
