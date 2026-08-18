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

**สิทธิ์:** module `adjnote` = สำเนาสิทธิ์ `receipt` ทุก role (admin/exec/finance/sales/field_sales/hr = edit). ลบถาวร = admin เท่านั้น (ยกเลิกได้ทุกคนที่ edit).

**api.js:** `listAdjustmentNotes`, `saveAdjustmentNote`, `setAdjustmentNoteStatus` (cancel), `setAdjustmentNoteWht`, `deleteAdjustmentNote`. `_DOC_NO_COL.adjustment_notes="note_no"`. เลข `CN-`/`DN-YYMMDD-HHMMSS`.

**เชื่อมโยง:** `_loadDocLinks` เก็บ `creditNos`/`debitNos` ต่อ quote + `DocChips` มี label `creditnote`/`debitnote` แล้ว — แต่ **ยังไม่ wire เข้า DocChips ในหน้าใบเสร็จ/ใบแจ้งหนี้** (งาน follow-up ถ้าอยากเห็นชิปใบลด/เพิ่มหนี้จากใบเสร็จ ต้องส่ง prop creditNos/debitNos + ให้ openDoc/DocPeek รองรับ type ใหม่). [[sales-doc-flow]]
