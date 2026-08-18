---
name: adjustment-notes
description: ใบลดหนี้ (Credit Note) + ใบเพิ่มหนี้ (Debit Note) — ปรับยอดหลังออกใบเสร็จแล้ว
metadata:
  type: project
---

เอกสารใหม่ (mig 218, v628, ส.ค. 2026) สำหรับกรณีลูกค้าจ่ายงวดแรก+ออกใบเสร็จแล้ว แต่ขอบเขตงานเปลี่ยน (แก้ใบเสนอราคาไม่ได้เพราะ locked).

**โมเดล:** ตารางเดียว `adjustment_notes` คุม 2 ชนิดด้วยคอลัมน์ `kind` (`credit`=ลดหนี้ · `debit`=เพิ่มหนี้). ต่างจากใบเสร็จ/ใบแจ้งหนี้ตรงที่ **มีรายการของตัวเอง** (jsonb `items` = ของที่ลด/เพิ่ม) ไม่ได้ดึงจากใบเสนอ. อ้างอิงใบเสร็จต้นทาง (`receipt_no`) + สืบ quote_no/invoice_no/boq_no/job_no มาให้.

**UI:** 1 เมนู "ใบเพิ่ม/ลดหนี้" (id `adjnote`) ในกลุ่มเอกสารขาย ต่อจากใบเสร็จ · มี 2 แท็บในตัว (ลดหนี้/เพิ่มหนี้). ไฟล์ `components/AdjustmentNotes.jsx`. พิมพ์ผ่าน `DocSlip.jsx` เดิม (หัวเอกสาร "ใบลดหนี้"/"ใบเพิ่มหนี้").

**VAT/WHT:** สืบสถานะ VAT จากใบเสร็จต้นทาง (`is_vat` = receipt.vat_amt>0). หัก ณ ที่จ่ายรายบรรทัด เฉพาะบรรทัดค่าบริการที่ติ๊ก (ดีฟอลต์ติ๊กให้เมื่อลูกค้านิติบุคคล) — ใช้สูตรเดียวกับใบเสร็จ (`lineWhtAmt`). รองรับทั้ง VAT/ไม่ VAT.

**⚠️ ไม่แตะกระแสเงินสดอัตโนมัติ (เจ้าของเคาะ)** — เงินจริงเข้า/ออกผ่านใบเสร็จงวดถัดไป (เพิ่มหนี้) หรือการคืนเงิน (ลดหนี้) กันนับซ้ำ. `saveAdjustmentNote` จึงไม่เรียก `syncCashEntriesFromDocs`. ถ้าต้องคืนเงินจริง finance เพิ่มรายการเงินสดแมนนวลเอง. [[cash-flow]]

**เชื่อมเข้ารายงาน (v632) — credit ลบ · debit บวก · เฉพาะ issued · ผูกวันที่ออกเอกสาร:** helper `lib/adjustments.js sumAdj()`.
- Dashboard "รับเงินแล้ว/รายได้ที่รับ" (`rcStat`) + WHT + VAT split — net note base/net/wht (กรองคน/ทีมผ่าน quote attribution เหมือนใบเสร็จ)
- `vatSummary` (api.js) ภาษีขายเดือนนี้ — net note vat_amt (is_vat)
- TaxReport (ภ.พ.30) — net base/vat/wht/net รายเดือน (push note เป็นแถวยอดติดเครื่องหมาย)
- Profit — รายได้งาน (`sale = afterDisc + noteAdjByQuote[quote]` ก่อน VAT)
- KPI scorecard — mig **219** เพิ่ม CTE `adj` net(net) ต่อ created_by
- **ไม่แตะ:** AR/เงินค้างรับ (โน้ตอ้างใบเสร็จ = ใบที่จ่ายแล้ว ไม่อยู่ใน AR → กันนับซ้ำ) · "ยอดขายอนุมัติ"/PnL/SalesReport/Trend/Exec (quotation-based = มูลค่าดีลตอนปิด ไม่ retro-adjust) — ถ้าเจ้าของอยากให้ปรับด้วยค่อยทำเพิ่ม.

**สิทธิ์:** module `adjnote` = สำเนาสิทธิ์ `receipt` ทุก role (admin/exec/finance/sales/field_sales/hr = edit). ลบถาวร = admin เท่านั้น (ยกเลิกได้ทุกคนที่ edit).

**api.js:** `listAdjustmentNotes`, `saveAdjustmentNote`, `setAdjustmentNoteStatus` (cancel), `setAdjustmentNoteWht`, `deleteAdjustmentNote`. `_DOC_NO_COL.adjustment_notes="note_no"`. เลข `CN-`/`DN-YYMMDD-HHMMSS`.

**เชื่อมโยง (wired ครบแล้ว v631):** `_loadDocLinks` เก็บ `creditNos`/`debitNos` ต่อ quote · DocChips ส่ง prop ครบทั้ง Receipts/Invoices/Quotation/BillingNotes + หน้าใบลด/เพิ่มหนี้เอง · `DocPeek` META + loader (type `creditnote`/`debitnote`) พรีวิวแผงขวา · `openDoc` map → view `adjnote`.

**ส่งให้ลูกค้าทางแชต (v631):** `listCustomerDocs` เพิ่ม entry note (type creditnote/debitnote) · `docmeta.js` TYPE_LABEL/DOC_STATUS/DOC_FILTERS · Chat.jsx `sendable` รวม 2 type · `DocCapture.noteSlip` เรนเดอร์ A4 เพื่อแคปส่ง · หน้าใบลด/เพิ่มหนี้มีปุ่ม ChatCustomerLink (role sales/admin/exec) + onGoChat. [[sales-doc-flow]] [[email-inbox]]
