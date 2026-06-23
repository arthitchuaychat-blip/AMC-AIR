-- 060_signature.sql — per-staff signature image for documents (optional, toggled at print time).
alter table profiles add column if not exists signature_url text;
