-- 054_txn_ref.sql — reference number per movement batch (one per "record" action).
-- Groups the ledger by the actual recording round (not by job), and gives every movement a
-- trackable เลขที่อ้างอิง.

alter table transactions add column if not exists ref_no text;

-- backfill existing rows: same type recorded in the same second = one batch
update transactions set ref_no =
  case type when 'withdraw' then 'WD' when 'return' then 'RT' when 'purchase' then 'PC' when 'damage' then 'DG' else 'MV' end
  || '-' || to_char(coalesce(created_at, now()), 'YYMMDD-HH24MISS')
  where ref_no is null;

create index if not exists idx_txn_ref on transactions(ref_no);
