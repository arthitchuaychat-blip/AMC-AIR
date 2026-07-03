-- 093_hr_expense_petty.sql — ให้ HR อนุมัติ/จ่ายเบิกจ่าย + คุมเงินสดย่อย (accounts/account_entries)
-- ขยาย policy ของ expense_requests + wallet ให้รวม 'hr' · รันครั้งเดียว
-- (cash_entries ให้ hr แล้วใน 085 · accounts.select เปิด acc_read_all อยู่แล้ว)

drop policy if exists er_read on expense_requests;
create policy er_read on expense_requests for select to authenticated
  using (requester = auth.uid() or my_role() in ('admin','exec','finance','hr'));

drop policy if exists er_update on expense_requests;
create policy er_update on expense_requests for update to authenticated
  using (my_role() in ('admin','exec','finance','hr')) with check (my_role() in ('admin','exec','finance','hr'));

drop policy if exists acc_rw on accounts;
create policy acc_rw on accounts for all to authenticated
  using (my_role() in ('admin','exec','finance','hr')) with check (my_role() in ('admin','exec','finance','hr'));

drop policy if exists ae_rw on account_entries;
create policy ae_rw on account_entries for all to authenticated
  using (my_role() in ('admin','exec','finance','hr')) with check (my_role() in ('admin','exec','finance','hr'));
