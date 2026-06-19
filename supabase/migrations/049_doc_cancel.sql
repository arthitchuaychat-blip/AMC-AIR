-- 049_doc_cancel.sql — allow soft-cancel ("ยกเลิก") on quotations + receipts (others already have it).
-- boqs.status has no check constraint, so 'cancelled' is already allowed there.

alter table quotations drop constraint if exists quotations_status_check;
alter table quotations add constraint quotations_status_check
  check (status in ('draft','sent','approved','rejected','expired','cancelled'));

alter table receipts drop constraint if exists receipts_status_check;
alter table receipts add constraint receipts_status_check
  check (status in ('pending','paid','cancelled'));
