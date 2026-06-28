-- 081_line_multi_customer.sql — link MORE THAN ONE customer to a single LINE chat.
-- A person may be both a personal customer and tied to a company customer. line_contacts.customer_id
-- stays as the "active" customer (drives the info panel); this join table holds every linked customer.
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists line_contact_customers (
  line_user_id text   not null,
  customer_id  bigint not null references customers(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (line_user_id, customer_id)
);
create index if not exists lcc_uid_idx on line_contact_customers(line_user_id);

-- backfill: existing single links become the first entry
insert into line_contact_customers (line_user_id, customer_id)
  select line_user_id, customer_id from line_contacts where customer_id is not null
  on conflict do nothing;

alter table line_contact_customers enable row level security;
-- same access as line_contacts: office reads, office (no lead_tech) writes
drop policy if exists lcc_read on line_contact_customers;
create policy lcc_read on line_contact_customers for select to authenticated
  using (my_role() in ('admin','sales','exec','finance','lead_tech'));
drop policy if exists lcc_write on line_contact_customers;
create policy lcc_write on line_contact_customers for all to authenticated
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
