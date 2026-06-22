-- 059_customer_email.sql — email address on the customer record.
alter table customers add column if not exists email text;
