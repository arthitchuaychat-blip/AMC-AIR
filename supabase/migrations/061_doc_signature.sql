-- 061_doc_signature.sql — per-document signature snapshot, chosen at creation time.
-- When the issuer turns the signature ON for a doc, the signature image URL + name are saved here
-- so the printed document matches what was chosen (independent of the global toggle later).

alter table boqs          add column if not exists sign_url text;
alter table boqs          add column if not exists sign_name text;
alter table quotations    add column if not exists sign_url text;
alter table quotations    add column if not exists sign_name text;
alter table invoices      add column if not exists sign_url text;
alter table invoices      add column if not exists sign_name text;
alter table billing_notes add column if not exists sign_url text;
alter table billing_notes add column if not exists sign_name text;
alter table receipts      add column if not exists sign_url text;
alter table receipts      add column if not exists sign_name text;
