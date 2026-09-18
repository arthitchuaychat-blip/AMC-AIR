---
name: error-sweep-2026-09
description: วิธี "ไล่หาข้อผิดพลาดจากข้อมูลจริง" ที่ใช้ 18 ก.ย. 2026 (client_errors + ชุด SQL ตรวจความสอดคล้องแบบอ่านอย่างเดียว) + สิ่งที่เจอ/แก้ใน v856 + รายการ invariant ที่ควรเช็กซ้ำเป็นระยะ
metadata:
  type: project
---

**วิธีทำ (ทำซ้ำได้ทุกเดือน):** อ่าน `client_errors` (group by kind+message, ดู stack → ชื่อ chunk บอกไฟล์ต้นทาง · `url` คือหน้าที่ผู้ใช้ "ไปต่อ" ไม่ใช่หน้าที่พังเสมอ) + รัน SQL invariant ผ่าน `supabase.exe db query --linked` (read-only). `db advisors` ของ CLI ค้าง (รอรหัส DB) — อย่าใช้.

**Invariant ที่เช็ก (ควรได้ 0 ทุกข้อ):** PO.expense_id ชี้ใบเบิก rejected/merged/หาย · PO.paid_at ไม่ตรงสถานะใบเบิก · ใบเบิก overpaid / `status=paid` แต่ paid_amount < ยอดสุทธิ / approved แต่จ่ายครบ · ใบลูก merged ที่ใบแม่หาย/ถูกไม่อนุมัติ · ใบเสร็จ paid ที่ใบแจ้งหนี้ยัง unpaid / ใบแจ้งหนี้ paid ไม่มีใบเสร็จ · cash_entries เส้นจากเอกสารซ้ำ / เส้น receipt ที่ใบเสร็จไม่ paid แล้ว · `material_stock.current_stock < 0`

**เจอ + แก้ใน v856:**
- `ReportChart.jsx` (อยู่ใน chunk Dashboard): ResizeObserver callback อ่าน `host.current.clientWidth` หลัง unmount → TypeError 11 ครั้ง/4 คน → จับ `el` ตอน mount + `el.isConnected` (DocPreview ทำแบบเดียวกัน) · บทเรียน: callback ของ observer/timer ห้ามอ่าน `ref.current` ตรง ๆ
- ใบเสร็จ paid แต่ใบแจ้งหนี้ unpaid 1 ใบ: `saveReceipt/setReceiptStatus/deleteReceipt` update `invoices.status` **ไม่เช็ก error** + `saveReceipt` ตอน `dup` (idempotency r3) return ก่อนทำ side effect ทั้งที่รอบแรกอาจตายกลางทาง → `_syncInvoicePaid(invoice_no, receiptStatus, soft)` ลองซ้ำ 1 ครั้งแล้วโยน error · เรียก **ก่อน** `if (dup) return` (soft เมื่อ dup) · **บทเรียน idempotency: side effect ที่ทำซ้ำได้ ต้องทำแม้เป็น dup**
- ใบเบิกรุ่นเก่า (ก่อน mig 111) `status=paid, paid_amount=0` 4 ใบ (~66.5k) ไม่เข้า `expense_paid` ใน cash sync → sync ถือว่าจ่ายเต็มยอดเมื่อ paid แต่ paid_amount ≤ 0.01
- ให้เจ้าของรัน SQL ซ่อมข้อมูล 2 ชุด (ใบแจ้งหนี้ 1 ใบ → paid · ใบเบิก 4 ใบ → paid_amount = amount − wht) · สต๊อกติดลบ 5 รายการ (ฉนวน K-flex/M-flex, ข้องอรางครอบท่อ, ท่อทองแดง) = เรื่องปฏิบัติการ (เบิกก่อนรับเข้า) แจ้งเจ้าของแล้ว ไม่ได้แก้ในโค้ด
- suite `test-integrity-r15.mjs` (7 ข้อ)
