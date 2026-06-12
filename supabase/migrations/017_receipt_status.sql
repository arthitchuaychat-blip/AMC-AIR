-- ใบเสร็จมีสถานะ: รอชำระเงิน (pending) / ชำระเงินแล้ว (paid)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
alter table receipts add column if not exists status text not null default 'paid';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'receipts_status_check') then
    alter table receipts add constraint receipts_status_check check (status in ('pending','paid'));
  end if;
end $$;
