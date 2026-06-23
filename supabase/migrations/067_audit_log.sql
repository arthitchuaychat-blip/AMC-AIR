-- 067_audit_log.sql — central audit trail for destructive/financial actions.
-- Additive only: creates one new table, alters nothing existing (safe to run anytime).
-- Before a financial document is deleted, the app snapshots the full record here,
-- so "who deleted/cancelled what, when, why" is recoverable even after a hard delete.

create table if not exists audit_logs (
  id          bigserial primary key,
  ts          timestamptz not null default now(),
  actor       uuid references auth.users(id) on delete set null,  -- who did it
  actor_name  text,                                               -- name snapshot (survives user deletion)
  action      text not null,        -- 'delete' | 'cancel' | 'approve' | 'status' | 'update'
  target_type text not null,        -- 'invoice' | 'receipt' | 'quotation' | 'boq' | 'billing_note' | 'job_order' | 'transaction' | 'cash_entry'
  target_no   text,                 -- the document number / id affected
  reason      text,                 -- optional reason entered by the user
  snapshot    jsonb                 -- full record (+ items) captured before a destructive action
);

create index if not exists audit_logs_target_idx on audit_logs (target_type, target_no);
create index if not exists audit_logs_ts_idx on audit_logs (ts desc);

alter table audit_logs enable row level security;

-- any signed-in staff member may WRITE a log line (so every action gets recorded)
drop policy if exists audit_insert on audit_logs;
create policy audit_insert on audit_logs for insert to authenticated with check (true);

-- only back-office (ธุรการ/ผู้บริหาร/บัญชี) may READ the history
drop policy if exists audit_read on audit_logs;
create policy audit_read on audit_logs for select to authenticated
  using (my_role() in ('admin','exec','finance'));

-- logs are immutable: no update/delete policies → nobody can alter or erase the trail
