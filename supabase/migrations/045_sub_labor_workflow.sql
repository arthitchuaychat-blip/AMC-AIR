-- 045_sub_labor_workflow.sql — subcontractor labor: confirm step + partial (split) payouts + payout slip.

-- labor confirmation step (accounting/sales lock the labor once the job is done)
alter table job_orders add column if not exists labor_confirmed    boolean default false;
alter table job_orders add column if not exists labor_confirmed_at  timestamptz;
alter table job_orders add column if not exists labor_confirmed_by  uuid;

-- cumulative amount already allocated to payouts (supports paying a job's labor in installments)
alter table job_orders add column if not exists labor_paid_amt      numeric default 0;

-- payout batch keeps the per-job allocation so partial payments + the slip can be reconstructed
alter table sub_payouts add column if not exists lines jsonb;       -- [{job_no, amount, vat, total, customerName}]

-- backfill: jobs already marked paid by the old all-or-nothing flow → treat their full labor as allocated + confirmed
update job_orders set labor_paid_amt = coalesce(labor_total, 0)
  where labor_paid = true and coalesce(labor_paid_amt, 0) = 0;
update job_orders set labor_confirmed = true
  where coalesce(labor_total, 0) > 0 and labor_paid = true and labor_confirmed is not true;
