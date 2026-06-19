-- 050_billing_notes.sql — ใบวางบิล: groups a customer's unpaid invoices into one cover document.
-- Receipts are still issued per invoice (this is only a billing cover to send the customer).

create table if not exists billing_notes (
  billing_no  text primary key,
  customer_id bigint references customers(id) on delete set null,
  site_id     bigint references customer_sites(id) on delete set null,
  issue_date  date,
  note        text,
  invoice_nos text[] not null default '{}',
  status      text not null default 'open' check (status in ('open','cancelled')),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id)
);
alter table billing_notes enable row level security;
drop policy if exists bn_read on billing_notes;
create policy bn_read on billing_notes for select to authenticated using (true);
drop policy if exists bn_write on billing_notes;
create policy bn_write on billing_notes for all to authenticated
  using (my_role() in ('admin','exec','finance','sales')) with check (my_role() in ('admin','exec','finance','sales'));
