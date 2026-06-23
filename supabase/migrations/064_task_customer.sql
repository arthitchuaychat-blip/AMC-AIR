-- 064_task_customer.sql — link a task to a customer (for following up chat customers).
alter table tasks add column if not exists customer_id bigint references customers(id) on delete set null;
create index if not exists tasks_customer_idx on tasks(customer_id);
