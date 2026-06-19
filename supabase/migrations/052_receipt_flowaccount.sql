-- 052_receipt_flowaccount.sql — remember which receipts were already pushed to FlowAccount (prevent duplicates).
alter table receipts add column if not exists flowaccount_id text;
alter table receipts add column if not exists flowaccount_no text;
alter table receipts add column if not exists flowaccount_at timestamptz;
