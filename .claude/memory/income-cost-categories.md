---
name: income-cost-categories
description: "โปรเจกต์ 3 เฟส — ประเภทงานชุดใหม่ + แยกหมวดรายได้/ต้นทุนบนแดชบอร์ด (เฟส1 เสร็จ v509, เหลือ 2-3)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9e3e3c98-8673-47b0-99ce-ee3aa866d22b
  modified: 2026-07-25T17:33:18.820Z
---

เจ้าของสั่ง (2026-07-26) ปรับ 3 อย่าง ทำเป็น**เฟส**: (1) ประเภทงาน → (2) หมวดรายได้บนแดชบอร์ด → (3) หมวดต้นทุน/ค่าใช้จ่าย.

**การตัดสินใจที่ยืนยันแล้ว:**
- ประเภทงาน = ข้อ owner + เพิ่ม "สำรวจงาน" และ "แก้ไขงาน"
- แยก "วัสดุ" ออกจาก "อุปกรณ์เสริมและอะไหล่" (ติดป้ายหมวดสินค้าครั้งเดียว — ไม่รวมหมวด)
- โครงหมวดจัดแบบ P&L 2 ชั้น: รายได้ − COGS(เครื่อง/วัสดุ/อะไหล่/ค่าแรง) = กำไรขั้นต้น · − OPEX(เงินเดือน/อาหาร/น้ำไฟเน็ต/น้ำมัน/รถ/ประกัน/เครื่องมือ...) = กำไรสุทธิ

## ✅ เฟส 1 เสร็จ (v509, 2026-07-26) — ประเภทงาน
`JOB_TYPES` ที่ [lib/schedule.js] = single source. **ใช้รหัสเดิม 5 ซ้ำ (แค่เปลี่ยนป้าย) + เพิ่มใหม่ 4 → งานเก่าไม่ต้อง migrate**:
survey=สำรวจงาน · ac_sale(ใหม่)=เครื่องปรับอากาศ(ขายอย่างเดียว) · install=เครื่องปรับอากาศพร้อมติดตั้ง · maintenance=ล้าง · move(ใหม่)=ย้าย · repair=ซ่อม · fix(ใหม่)=แก้ไขงาน · remove(ใหม่)=รื้อถอน · other=อื่นๆ
- แก้ตาม: `handover.js` JOBTYPE_TO_WORK (ac_sale/remove→other, move→move, fix→repair) · `DocPeek.jsx` + `ExecReports.jsx` เลิก hardcode map เปลี่ยนไปดึง `jobTypeDef()` · `JobOrders.jsx` ป้าย "🛒 ยังไม่สั่งของ" ครอบ install+ac_sale · jobTypeDef fallback ค่าไม่รู้จัก→"อื่นๆ" (เดิม→install)
- dropdown BOQ/JobOrders + filter + ปฏิทิน = .map(JOB_TYPES) auto ได้ตัวเลือกใหม่เอง

## ⬜ เฟส 2 — หมวดรายได้บนแดชบอร์ด (8 หมวด)
เครื่องปรับอากาศ · วัสดุ · อุปกรณ์เสริม/อะไหล่ · ค่าบริการติดตั้ง/ล้าง/ย้าย/ซ่อม/อื่นๆ
- รายได้ปัจจุบันแยกแค่ VAT/ไม่VAT (`Dashboard.jsx` ovStat/rcStat) — ยังไม่เคยแยกตามหมวด
- **map ได้ 6/8 จาก** `quotation_items.kind` (ac/service/material — copy จาก materials ตอนเพิ่มรายการ) + join `item_code→materials.category`:
  - AC = kind='ac' · บริการ = kind='service' + category `sv-install/sv-clean/sv-move/sv-repair/sv-remove/sv-other` (มีอยู่แล้ว! นิยาม SERVICE_CATS ที่ ItemPicker.jsx:17)
- **ติด: วัสดุ vs อะไหล่** ทั้งคู่ kind='material' ไม่มีฟิลด์แยก → ต้องเพิ่ม "กลุ่ม" ให้ตาราง `categories` (material category ไหน=วัสดุ/ไหน=อะไหล่) ติดป้ายครั้งเดียว (migration + UI ใน Settings/Catalog)
- ⚠️ ยอดต่อบรรทัด = qty×price_show − discount(รายบรรทัด) · **ส่วนลดรวมท้ายบิล+ค่าธรรมเนียมบัตรคิดระดับใบ** ต้องเฉลี่ยลงหมวดตามสัดส่วน (ลอก pattern WHT `afterDisc*(svcSum/subtotal)` ที่ api.js) ให้ผลรวม 8 หมวด = ยอดการ์ดเดิม
- ⚠️ รายการพิมพ์เอง (item_code=null) มีแค่ kind — service ad-hoc ตกเป็น "อื่นๆ", material ad-hoc แยกวัสดุ/อะไหล่ไม่ได้
- ทางเลือกทน: snapshot category ลง quotation_items (migration + แก้ saveQuotation api.js:1874)

## ⬜ เฟส 3 — หมวดต้นทุน/ค่าใช้จ่าย (P&L รวมบริษัท)
ต้องรวมจาก **4 แหล่ง** เป็นมิติ "หมวด" เดียว:
- COGS เครื่อง/วัสดุ/อะไหล่ ← `transactions.value` (ต้นทุนเฉลี่ย moving avg) group by materials.category-group · `jobMaterialCost()` api.js:3003
- ค่าแรงช่างซัพ ← `sub_payouts` / `job_orders.labor_total`
- เงินเดือน ← `payslips` (lib/payroll.js รอบตัด 25)
- OPEX (อาหาร/น้ำไฟเน็ต/น้ำมัน/รถ/ประกัน/เครื่องมือ) ← `expense_requests.category`
- ⚠️ `expense_categories` เป็น free-text ผูกชื่อ · **มีแค่ policy insert (เพิ่มได้) ไม่มี update/delete** (mig 094) → หมวดใหม่ (บำรุงรถ/ประกันรถ/เครื่องมือช่าง) เพิ่มได้แต่แก้/ลบไม่ได้ ถ้าอยากจัดการเต็มต้อง migration เพิ่ม policy
- ⚠️ `cash_entries` แยกได้แค่ `source_type` (invoice/receipt/po/salary/expense/labor_owed…) **ไม่มี category** — จะรายงาน 11 หมวดต้อง join `cash_entries.source_ref→expense_requests.category` หรือเพิ่มคอลัมน์ category
- `Profit.jsx` แยกต้นทุน 5 กลุ่มระดับ**งาน**แล้ว (วัสดุ/ค่าแรงซัพ/เบิกจ่าย/PO/ค่าธรรมเนียมบัตร) แต่ไม่รวมค่าใช้จ่ายส่วนกลาง (เงินเดือน/น้ำไฟ/รถ) = กำไรขั้นต้นระดับงาน ไม่ใช่ P&L บริษัท
- ข้อจำกัด: ค่าแรง/เงินเดือน **แยกลงรายบริการ (ล้าง/ซ่อม/ย้าย) ไม่ได้** เพราะไม่ได้ลงเวลาช่างต่อบิล

ดู [[app-performance]] (แคชลิสต์เอกสาร) · หมวดสินค้า categories เป็น DB-driven (ตาราง categories, ไม่มีคอลัมน์ kind แยกวัสดุ/บริการ — ใช้ prefix `sv-`)
