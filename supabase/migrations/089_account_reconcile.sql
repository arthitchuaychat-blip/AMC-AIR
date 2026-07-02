-- 089_account_reconcile.sql — กระทบแบงค์: ทำเครื่องหมายรายการเดินบัญชีที่ตรงกับ statement ธนาคารแล้ว
-- ใช้กับหน้า เบิกจ่าย → "เดินบัญชี & กระทบแบงค์" · รันครั้งเดียว
-- (สิทธิ์อ่าน/เขียนใช้ policy ae_rw เดิม — office: admin/exec/finance)

alter table account_entries add column if not exists reconciled boolean not null default false;
alter table account_entries add column if not exists reconciled_at timestamptz;
create index if not exists account_entries_recon_idx on account_entries(account_id, reconciled);
