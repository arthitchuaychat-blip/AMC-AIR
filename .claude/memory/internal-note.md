---
name: internal-note
description: back-office-only internal_note on 7 docs; never printed for customers
metadata: 
  node_type: memory
  type: project
  originSessionId: 85b6d010-27bd-419a-ad75-1ac380626a9a
---

Back-office-only "หมายเหตุภายใน" on documents (v132, 2026-06-21 — needs migration `055_internal_note.sql`). Separate from the existing `note` (which DOES print on customer slips). `internal_note` is NEVER passed to DocSlip / any print block — shown only inside the app.

- Shared component **app/src/components/InternalNote.jsx**: `InternalNoteField` (editor textarea) + `InternalNoteTag` (🔒 ภายใน card tag, hidden when empty). CSS `.int-note-tag` / `.int-note-fld`.
- Added on 7 tables/editors: boqs, quotations, invoices, receipts, billing_notes, job_orders, purchase_orders. All list functions already `select("*")` + spread the row, so read path is automatic; each save upsert now sends `internal_note`.
- invoice/receipt/billing-note are created-once (no edit UI) → internal_note is set at creation only.
- SAFETY INVARIANT: if you ever add internal_note to a DocSlip/print, that leaks it to customers — don't. Relates to [[doc-lifecycle]].
