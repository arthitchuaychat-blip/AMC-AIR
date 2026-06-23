-- 063_expenses.sql — เบิกจ่าย: wallets (VAT bank / No-VAT bank / petty cash) + ledger + expense requests.

-- 3 money accounts (wallets). Balance = opening_balance + Σ in − Σ out (computed in the app).
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  code text unique,                 -- 'vat' | 'novat' | 'petty'
  name text not null,
  kind text not null default 'bank',
  opening_balance numeric not null default 0,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
insert into accounts (code, name, kind, sort) values
  ('vat',   'บัญชีธนาคาร (VAT)',    'bank', 1),
  ('novat', 'บัญชีธนาคาร (ไม่ VAT)', 'bank', 2),
  ('petty', 'เงินสดย่อย',            'cash', 3)
on conflict (code) do nothing;

-- every money movement on an account (expense payment / transfer / opening / adjust)
create table if not exists account_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  amount numeric not null default 0,
  kind text not null default 'expense',   -- expense | transfer | opening | adjust
  ref_type text, ref_id text,
  note text,
  entry_date date not null default current_date,
  created_by uuid, created_at timestamptz not null default now()
);
create index if not exists account_entries_acc_idx on account_entries(account_id, entry_date);

-- expense / reimbursement requests (staff or job-related), with approval + payment workflow
create table if not exists expense_requests (
  id uuid primary key default gen_random_uuid(),
  requester uuid references auth.users(id),
  job_no text,                       -- if set → cost rolls into that job
  category text,
  title text not null,
  amount numeric not null default 0,
  note text,
  attachments text[] not null default '{}',     -- bill / evidence
  status text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  approver uuid, decided_at timestamptz, decide_note text,
  paid_from uuid references accounts(id), paid_at timestamptz, payment_proof text[] not null default '{}',
  created_by uuid, created_at timestamptz not null default now()
);
create index if not exists expense_requests_status_idx on expense_requests(status);
create index if not exists expense_requests_job_idx on expense_requests(job_no);

alter table accounts          enable row level security;
alter table account_entries   enable row level security;
alter table expense_requests  enable row level security;

-- accounts + ledger: office (admin/exec/finance) only
drop policy if exists acc_rw on accounts;
create policy acc_rw on accounts for all to authenticated
  using (my_role() in ('admin','exec','finance')) with check (my_role() in ('admin','exec','finance'));
drop policy if exists acc_read_all on accounts;
create policy acc_read_all on accounts for select to authenticated using (true); -- names visible for pickers
drop policy if exists ae_rw on account_entries;
create policy ae_rw on account_entries for all to authenticated
  using (my_role() in ('admin','exec','finance')) with check (my_role() in ('admin','exec','finance'));

-- expense requests: requester sees/creates own; office sees/updates all
drop policy if exists er_read on expense_requests;
create policy er_read on expense_requests for select to authenticated
  using (requester = auth.uid() or my_role() in ('admin','exec','finance'));
drop policy if exists er_insert on expense_requests;
create policy er_insert on expense_requests for insert to authenticated with check (requester = auth.uid());
drop policy if exists er_update on expense_requests;
create policy er_update on expense_requests for update to authenticated
  using (my_role() in ('admin','exec','finance')) with check (my_role() in ('admin','exec','finance'));
