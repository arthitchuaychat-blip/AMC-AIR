---
name: doc-lifecycle
description: "Document cancel-in-order + admin-only delete, billing notes, and date filters across doc pages"
metadata: 
  node_type: memory
  type: project
  originSessionId: 85b6d010-27bd-419a-ad75-1ac380626a9a
---

Document lifecycle features (v88–v90, 2026-06-19). Chain: **BOQ → ใบเสนอราคา → ใบแจ้งหนี้ → (ใบวางบิล) → ใบเสร็จ**, ใบงาน under quote. See [[cash-flow]] / [[permissions-system]].

**Cancel-in-order + delete (v88, migration `049_doc_cancel.sql` adds 'cancelled' to quotations + receipts status checks; boqs.status has no check so it's already allowed).** Every doc has a soft **"ยกเลิก"** (status=cancelled, keeps history) + the existing downstream lock (must cancel/delete the downstream doc first; cancelled downstream no longer blocks). Hard **"ลบ"** is gated to `role === "admin"` (ธุรการ) on all docs via `const canDelete = role === "admin"`. Cancel helpers: setBoqStatus/setQuotationStatus/setInvoiceStatus/setReceiptStatus/setJobStatus. Downstream flags (hasQuote/hasJob/hasInvoice/hasReceipt) and listDocLinks were updated to ignore cancelled rows, and Profit skips cancelled quotations (cash-flow seeding already skips cancelled invoices/receipts).

**Billing notes — ใบวางบิล (v89, migration `050_billing_notes.sql`).** `billing_notes` table (billing_no, customer_id, site_id, issue_date, note, invoice_nos text[], status open/cancelled). Module `billing` (admin/exec/finance/sales). `BillingNotes.jsx` (nav `billing`, between receipt & profit): create = pick customer → tick their UNPAID invoices → save; prints via DocSlip letterhead; each invoice row has "ออกใบเสร็จ" → routes to the existing per-invoice receipt flow (App onCreateReceipt → setReceiptFromInvoice). Receipts stay per-invoice (billing note is just a cover). Cancel soft + admin delete. api: listBillingNotes/saveBillingNote/setBillingNoteStatus/deleteBillingNote.

**Owner's lifecycle rules (v390, 2026-07-13) — MUST preserve in future doc work:**
1. ยกเลิก/ลบ ต้องไล่จากเอกสารล่าสุดย้อนไปเก่าสุดเสมอ — enforced: quote blocked by live POs (cancelLockMsg + docLinks.poNos), invoice blocked by live billing note (listInvoices returns `billingNo`), billing note blocked by member invoices with live receipts, BOQ blocked by live quote.
2. ยกเลิก/ลบ ต้องระบุเหตุผลเสมอ — `confirmDialog prompt.required:true` (ConfirmDialog.jsx disables ยืนยัน until reason typed); all doc cancel/delete call sites use it; setBoqStatus/setJobStatus/deletePurchaseOrder/cancelPurchaseOrder now logAudit with reason.
3. เอกสารที่ยกเลิกแล้ว ล็อกทุกปุ่มสร้าง/ทำงานต่อ (สร้างซ้ำ/แก้ไข/สร้างเอกสารลูก) — เหลือ ดู/พิมพ์/แชต/ลบ. **ข้อยกเว้น: BOQ ยกเลิกแล้วแก้ไขได้ — บันทึกสำเร็จ = revive (`_wasCancelled` → setBoqStatus(no, null))**.
4. เอกสารขายทุกใบต้องเริ่มจาก BOQ — new quotations require boq_no at save (legacy edits exempt); duplicate keeps source boq_no; BOQ picker excludes cancelled BOQs.
PO now has ยกเลิก button (open + unpaid only) via `cancelPurchaseOrder`.

**Doc-card + naming overhaul (v392–v393, 2026-07-15):**
- **Invoice renamed everywhere to "ใบส่งของ/ใบแจ้งหนี้"** (menu, page title, print DocSlip titleTh="ใบส่งของ / ใบแจ้งหนี้", DocPeek label, permissions label). Data model unchanged (still `invoices`/invoice_no). Unpaid invoice cards have a direct **"รับเงิน / ออกใบเสร็จ"** button (onCreateReceipt) so no billing note is needed for the common case.
- **Shared `components/DocCard.jsx` (`DocCardHead`)** = standard doc-card header (no+badges | title | creator/date/amount + full-width party strip). Props: no, badges, title, sub, by, date, amountLabel/amount OR amountNode, customer{name,code,contactName,phone,addr,siteAddress,mapUrl}, onClick, **partyIcon** (🏢 customer default · 🏭 supplier), **titleFallback**. Used by BOQ/Quotation/Invoices/Receipts/BillingNotes/PurchaseOrders/MaterialPrep. Card wrapper needs class `doc2`. CSS `.dch*`/`.dch-cust` in styles.css.
- **Right-side self-preview on every doc card**: clicking a card header calls `openPeek(selfType, selfNo)` (useDocPeek/DocPeek). DocPeek now also supports type `"billing"`. Invoice/receipt WHT line-item modal moved to a "รายการ / หัก ณ ที่จ่าย" button.
- Billing-note picker excludes invoices that already have a receipt: `isBillable = unpaid && !hasReceipt && !alreadyBilled`. listInvoices returns `billingNo` (blocks cancel while in a live billing note).
- Every cancel/delete calls `syncCashEntriesFromDocs()` (added to quote/job/billing setters+deletes; invoice/receipt/PO already had it).
- **Per-line discount (mig 142, v408)**: `quotation_items.discount` (baht/line) — flows quote→invoice→receipt automatically (those docs print the QUOTE's items, no item tables of their own). Line amount/subtotal/service-WHT base are NET of line discounts; bill-level discount (discount_type/value on the header) unchanged, applied after. DocSlip gets `discountCol` prop → 7-column layout (COL_W_DISC, still 186mm) with "ส่วนลด" column shown ONLY when some line has discount; row renderers in Quotation/Invoices/Receipts add the conditional `<td>`. job quoteGrand (listJobOrders subByQuote) subtracts line discounts. Save has pre-142 fallback (strip discount and retry).
- **Doc types (mig 139, v394)**: `boqs.job_type` + `quotations.job_type` (values = JOB_TYPES in lib/schedule.js: survey/install/repair/maintenance/other) — REQUIRED on BOQ save, carried BOQ→quote→job-order prefill (CRM); `purchase_orders.po_type` ('ac'|'material') REQUIRED on PO save, legacy rows inferred from item kinds (`poTypeOf`). Filter chips on every doc menu show match counts `(n)`; quote's PO button = "สั่งซื้อแอร์" pulling only kind==="ac" lines (App onCreatePo poType:"ac"); quote filter "ยังไม่สั่งซื้อแอร์"; invoice filter "ยังไม่ออกใบเสร็จ".

**Date filters (v90).** Shared `DateRangeBar` (from/to + "วันนี้" + "ล้าง") + `inDateRange(dateStr, range)` in `components/DateRangeBar.jsx`. Wired into BOQ (created_at), quotation/invoice/receipt/billing note (issue_date), purchase orders (created_at). JobOrders' own date filter got a วันนี้ button; Dashboard got a วันนี้ preset. Quotation + receipt lists also gained a "ยกเลิก" status chip.
