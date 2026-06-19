-- 046_cash_flow.sql — cash-flow ledger: one row per money line (in/out), projected vs actual.
-- Auto-seeded from invoices (projected in) / receipts (actual in) / sub_payouts + POs (out),
-- but every line is editable (date/amount/note) and manual lines can be added freely.

create table if not exists cash_entries (
  id uuid primary key default gen_random_uuid(),
  direction   text not null check (direction in ('in','out')),
  status      text not null default 'projected' check (status in ('projected','actual')),
  entry_date  date not null,
  amount      numeric not null default 0,
  note        text,
  source_type text not null default 'manual' check (source_type in ('manual','invoice','receipt','payout','po','opening')),
  source_ref  text,                          -- invoice_no / receipt_no / payout id / po_no / 'opening'
  edited      boolean not null default false, -- user touched a seeded row → sync won't overwrite it
  created_by  uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists cash_entries_date on cash_entries(entry_date);
-- one ledger row per source document (keeps the doc sync idempotent)
create unique index if not exists cash_entries_src on cash_entries(source_type, source_ref) where source_type <> 'manual';

alter table cash_entries enable row level security;
drop policy if exists cash_entries_rw on cash_entries;
create policy cash_entries_rw on cash_entries for all
  using (my_role() in ('admin','exec','finance')) with check (my_role() in ('admin','exec','finance'));
