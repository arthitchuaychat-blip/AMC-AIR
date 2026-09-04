---
name: loans-financing
description: "เมนูหนี้สิน AMC (สินเชื่อ/เช่าซื้อบริษัท) — โครงสร้าง ตาราง loans, การคำนวณ 2 แบบ, ข้อมูลสัญญาจริง"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1bd3786c-6a0c-4007-9f1b-c797ae55b69a
  modified: 2026-09-04T07:29:46.770Z
---

เมนู **หนี้สิน** (นับ 1 เดือน 9/2569) = หนี้บริษัท: รถเช่าซื้อ 6 คัน + สินเชื่อออฟฟิศ — คนละอันกับ `hr_loans` (เงินยืมพนักงานหักเงินเดือน)

**โครงสร้าง (v772, mig 242):**
- ตาราง `loans` (params สัญญา ไม่เก็บทุกงวด) · RLS my_role() admin/exec/finance/hr แก้ได้
- `lib/loans.js`: `buildSchedule/loanStatus/monthlyOutlook` — 2 วิธี: **flat** (เช่าซื้อดอกคงที่ ดอกเท่ากันทุกงวด) · **reducing** (ลดต้นลดดอก: ดอก=ยอดคงเหลือ×rate÷1200, rate เก็บเป็น %/ปี)
- `components/Loans.jsx` (เมนู `loans` กลุ่ม finance, emoji 🏧) · api: `listFinancings/saveFinancing/deleteFinancing/payFinancingInstallment` (ชื่อ Financing เลี่ยงชนกับ saveLoan/listLoans เดิมของ hr_loans)
- ปุ่ม "จ่ายงวด" → `submitExpense` หมวด "ค่าผ่อนรถ" ผูก asset_tag + เดิน`paid_count`+1 (แบ่งจ่าย/แนบสลิปได้)
- กระแสเงินสด: `syncCashEntriesFromDocs` push source_type `loan` (rolling 12 เดือน, จากงวด paid_count+1) → "คาดการณ์–จ่าย" · เพิ่ม 'loan' ใน CHECK constraint + MANAGED set (guard loanRows!==null)

**เช่าซื้อไทยจริง = reducing** (ไม่ใช่ flat!) — งวด1: ดอก÷เงินต้นตั้งต้น = rate/เดือน. VAT ต่องวดคงที่แยกต่างหาก (`vat_per`). ค่างวดรวม VAT.

**สัญญาที่ป้อนแล้ว:** SUZUKI 4ฒฌ2292 (สัญญา 26-6808869 ลว 31/07/2568): reducing, เงินต้นตั้งต้น 313785.05, rate 9.312795%/ปี, ค่างวด 6105 (VAT 399.39), 72 งวด, งวด1=2025-09-05, จ่ายทุกวันที่ 5, paid_count=12 (เริ่มบันทึกงวด13 = 5/9/2569). สูตร reducing reproduce เอกสารแบงก์เป๊ะ (เพี้ยน ≤0.02 บาท).

**ยังรอ:** อีก 5 คัน (NISSAN 4ฒธ4666, TOYOTA 3ฒษ3205/4ฒข5167/4ฒฆ2679, รถหัวหน้าช่าง) + สินเชื่อออฟฟิศ 93/97 — เจ้าของทยอยส่งตารางเช่าซื้อมา แล้ว seed ผ่าน insert (ผมรันเองไม่ได้)

เกี่ยว: [[bank-accounts-recon]] [[accounting-system]]
