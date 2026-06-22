-- 055_internal_note.sql — back-office-only note on documents.
-- Separate from the existing `note` (which prints on customer slips). internal_note is NEVER
-- passed to DocSlip / customer-facing output — it shows only inside the app to staff.

alter table boqs            add column if not exists internal_note text;
alter table quotations      add column if not exists internal_note text;
alter table invoices        add column if not exists internal_note text;
alter table receipts        add column if not exists internal_note text;
alter table billing_notes   add column if not exists internal_note text;
alter table job_orders      add column if not exists internal_note text;
alter table purchase_orders add column if not exists internal_note text;
