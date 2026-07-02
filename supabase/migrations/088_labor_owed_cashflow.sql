-- 088_labor_owed_cashflow.sql — แสดง "ค่าแรงช่างซัพที่ยืนยันแล้ว แต่ยังไม่ได้ตั้งเบิก/จ่าย"
-- ในกระแสเงินสด ฝั่ง "คาดว่าจะจ่าย" (source_type = labor_owed) · รันครั้งเดียว
-- (พอสร้างใบจ่าย/จ่ายเงินแล้ว remaining ของงานจะเป็น 0 → รายการนี้หายเอง, ไปโผล่เป็น payout แทน)

do $$ declare cn text;
begin
  for cn in select conname from pg_constraint
            where conrelid = 'public.cash_entries'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%source_type%' loop
    execute format('alter table cash_entries drop constraint %I', cn);
  end loop;
  alter table cash_entries add constraint cash_entries_source_type_check
    check (source_type in ('manual','invoice','receipt','payout','po','opening','expense','salary','labor_owed'));
end $$;
