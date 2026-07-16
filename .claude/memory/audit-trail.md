---
name: audit-trail
description: Financial-doc audit log + recoverable hard-deletes; migration 067 must be run manually
metadata: 
  node_type: memory
  type: project
  originSessionId: 85b6d010-27bd-419a-ad75-1ac380626a9a
---

Audit trail for financial documents (added 2026-06-23, v173).

`audit_logs` table (migration **067_audit_log.sql** — additive, must be run manually in Supabase SQL Editor) records who deleted/cancelled/approved which doc, when, why (`reason`), plus a full jsonb `snapshot`.

**Key design — deletes stay HARD deletes, but are recoverable:** every financial delete in [lib/api.js] (`deleteInvoice`/`deleteReceipt`/`deleteQuotation`/`deleteBoq`/`deleteBillingNote`/`deleteJobOrder`/`deleteTransaction`/`deleteCashEntry`) snapshots the full record (+ items/visits) into `audit_logs.snapshot` BEFORE deleting. So a "lost" doc can be reconstructed from its snapshot. `logAudit()` is best-effort (never throws — safe if migration not yet run). Cancels/approves are logged too (no snapshot, reversible).

UI: `ConfirmDialog` gained an optional `prompt` field → resolves the reason string (or `false` on cancel); reason capture wired into delete/cancel on invoices/receipts/quotations/billing notes/BOQ. Viewer = "ประวัติการลบ/ยกเลิก" card in Settings (admin/exec/finance only).

**Why this and not the other "money risks":** verified against real code that the audit's other HIGH claims were already mitigated — cash double-count is prevented by createReceipt auto-marking the invoice paid ([api.js] ~825) + revert on cancel (~898); stored money (invoices/receipts) is already `round2`'d, only the never-stored recomputed quotation/BOQ totals are unrounded. Related: [doc-lifecycle](doc-lifecycle.md), [permissions-system](permissions-system.md).

**Still open (told user, their call):** delete RLS on invoices/receipts is `for all` → sales can delete at DB level, not admin-only. Tightening it means replacing policies (riskier migration) — not done yet.
