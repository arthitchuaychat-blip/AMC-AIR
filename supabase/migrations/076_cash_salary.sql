-- 076_cash_salary.sql — add 'salary' (and missing 'expense') to cash_entries source_type
-- so that monthly salary projections can be seeded automatically.

do $$ begin
  begin alter table cash_entries drop constraint cash_entries_source_type_check; exception when others then null; end;
  alter table cash_entries add constraint cash_entries_source_type_check
    check (source_type in ('manual','invoice','receipt','payout','po','opening','expense','salary'));
end $$;
