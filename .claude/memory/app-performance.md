---
name: app-performance
description: งานค้าง — ทำแอปโหลดเร็วขึ้น (เจ้าของรู้สึกอืด ก.ค. 2026); แผน + ต้นเหตุที่วินิจฉัยไว้
metadata:
  type: project
---

เจ้าของแจ้ง (2026-07-25) ว่าแอปใช้งานอืด. วินิจฉัยไว้: ERP เพิ่งใช้ ~1 เดือน ข้อมูลอาจยังไม่เยอะ → น่าจะเป็น "โครงสร้าง" มากกว่า "ปริมาณ". (ส่วนที่เจ้าของรู้สึกว่า "ทวนความจำนาน" = แชต Claude ยาวเกิน ไม่ใช่แอป — แก้ด้วยเปิดแชตใหม่ต่อ 1 งาน. ความจำมีแค่ ~870 บรรทัด ไม่ใช่คอขวด.)

**แผนที่ตกลง — เริ่มจากคุ้มสุด/เสี่ยงต่ำก่อน:**
1. **code-split บันเดิล** — `npm run build` เตือน chunk > 500KB, เปิดแอปครั้งแรกโหลดทั้งก้อน → แยกโหลดตามหน้าด้วย `React.lazy` + `Suspense` (แยกหน้าหนัก ๆ เช่นเอกสาร/รายงาน). ได้ผลกับ "เปิดแอปครั้งแรกช้า".
2. **เพิ่ม index** บนคอลัมน์ที่กรอง/เรียงบ่อย: receipts/invoices/quotations (issue_date, customer_id, status, quote_no) · transactions (material_code, txn_date, po_no) · boq_items/quotation_items (parent key). = migration ใหม่.
3. ถ้าตารางไหนโตจริง (ดูผลนับแถว) → แก้หน้านั้นให้ดึงเฉพาะช่วงวันที่/สถานะที่ดู แทน `_fetchAll` ทั้งตาราง. **จุดที่หนักสุด:** หน้าเอกสารดึงหลายตารางเต็ม ๆ พร้อมกันทุกครั้งที่เปิด (เช่น Receipts.jsx `load()` = listReceipts + listInvoices + listQuotations + getCompanies + listDocLinks). ดันตัวกรองไป query แทนกรองใน JS.
4. อื่น ๆ ถ้ายังไม่พอ: `select` เฉพาะคอลัมน์ที่ใช้ (เลิก `select("*")` ตารางกว้าง) · material_stock view คิดสดจากทั้ง transactions ทุกครั้ง → ทำตารางยอดคงเหลือแบบเก็บสะสมเมื่อ transactions โตหลักหมื่น.

ก่อนเริ่ม: ให้เจ้าของรัน SQL นับแถวทุกตารางหลัก (transactions, quotation_items, boq_items, receipts, invoices, quotations, boqs, materials, customers, job_orders) → จะได้รู้ว่าเป็นปัญหา "ปริมาณ" หรือ "โครงสร้าง". ดู [[supabase-1000-row-cap]] (_fetchAll ที่เพจทั้งตาราง) + [[stale-cache-deploys]] (bump BUILD ทุกครั้งที่แก้ app/).
