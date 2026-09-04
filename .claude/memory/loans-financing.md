---
name: loans-financing
description: "เมนูหนี้สิน AMC (สินเชื่อ/เช่าซื้อบริษัท) — โครงสร้าง ตาราง loans, การคำนวณ 2 แบบ, ข้อมูลสัญญาจริง"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1bd3786c-6a0c-4007-9f1b-c797ae55b69a
  modified: 2026-09-04T08:46:13.902Z
---

เมนู **หนี้สิน** (นับ 1 เดือน 9/2569) = หนี้บริษัท: รถเช่าซื้อ 6 คัน + สินเชื่อออฟฟิศ — คนละอันกับ `hr_loans` (เงินยืมพนักงานหักเงินเดือน)

**โครงสร้าง (v772, mig 242):**
- ตาราง `loans` (params สัญญา ไม่เก็บทุกงวด) · RLS my_role() admin/exec/finance/hr แก้ได้
- `lib/loans.js`: `buildSchedule/loanStatus/monthlyOutlook` — 2 วิธี: **flat** (เช่าซื้อดอกคงที่ ดอกเท่ากันทุกงวด) · **reducing** (ลดต้นลดดอก: ดอก=ยอดคงเหลือ×rate÷1200, rate เก็บเป็น %/ปี)
- `components/Loans.jsx` (เมนู `loans` กลุ่ม finance, emoji 🏧) · api: `listFinancings/saveFinancing/deleteFinancing/payFinancingInstallment` (ชื่อ Financing เลี่ยงชนกับ saveLoan/listLoans เดิมของ hr_loans)
- ปุ่ม "จ่ายงวด" → `submitExpense` หมวด "ค่าผ่อนรถ" ผูก asset_tag + เดิน`paid_count`+1 (แบ่งจ่าย/แนบสลิปได้)
- กระแสเงินสด: `syncCashEntriesFromDocs` push source_type `loan` (rolling 12 เดือน, จากงวด paid_count+1) → "คาดการณ์–จ่าย" · เพิ่ม 'loan' ใน CHECK constraint + MANAGED set (guard loanRows!==null)

**เช่าซื้อไทยจริง = reducing** (ไม่ใช่ flat!) — งวด1: ดอก÷เงินต้นตั้งต้น = rate/เดือน. VAT ต่องวดคงที่แยกต่างหาก (`vat_per`). ค่างวดรวม VAT.

**ป้อนครบแล้ว 7 สัญญา** (v774, 4 ก.ย. 2569) — ทุกก้อน seed ผ่าน SQL insert (เจ้าของรันเอง):
- **SUZUKI 4ฒฌ2292** (26-6808869): reducing, opening 313785.05, rate 9.312795%, ค่างวด 6105 (VAT 399.39), 72 งวด, งวด1 2025-09-05, due 5, paid 12
- **NISSAN 4ฒธ4666** (2010244334, กสิกรลีสซิ่ง): reducing, opening 359000, rate 9.297489%, ค่างวด 6981 (VAT 456.70), 72 งวด, งวด1 2025-12-20, due 20, paid 8 (**ค้างงวด 9 ส.ค.69**)
- **TOYOTA 4ฒฆ2679** (A11067481, โตโยต้าลีสซิ่ง): reducing, opening 354498.14, rate 6.343944%, ค่างวด 7394 (VAT 483.72), 60 งวด, งวด1 2025-03-14, due 14, paid 18
- **TOYOTA 4ฒข5167** (A11025593): reducing, opening 336026.17, rate 6.826324%, ค่างวด 6100 (VAT 399.07), 72 งวด, งวด1 2024-11-15, due 15, paid 22
- **TOYOTA 3ฒษ3205** (A10659911): reducing, opening 543319.62, rate 9.942945%, ค่างวด 9634 (VAT 630.26), 84 งวด, งวด1 2022-10-03, due 3, paid 47
- **ไทยเครดิต 4.99M** (TDR): stepped, opening 4990770.57, steps 1-12=15500/13-24=25000/25-35=50000, งวด36 balloon(รอยอด), 36 งวด, งวด1 2026-05-05, due 5, paid 4
- **ไทยเครดิต 984,050** (TDR): stepped, opening 984050, steps 1-12=4500/13-24=9000/25-35=20000, งวด36 balloon(รอยอด), 36 งวด, งวด1 2026-05-05, due 5, paid 4

**กสิกร/SUZUKI/NISSAN**: constant-rate reducing reproduce เป๊ะ (≤0.02–0.1). **โตโยต้าลีสซิ่ง**: แบงก์คิดดอกรายวัน + งวดแรกยาว → fit rate ให้ปิดยอดพอดี เพี้ยน ≤30–1700 บาท (ค่างวด/payoff เป๊ะเสมอ). fit rate = binary search r ให้ balEnd(r)=0.

**PDF สัญญา = สแกนภาพ** (ไม่มี text layer) → extract ด้วย pdf-to-png-converter ใน scratchpad (render.cjs) แล้วอ่านด้วย vision. ตารางภาระหนี้อยู่หน้าแรกๆ ของไฟล์ที่ตั้งชื่อตามทะเบียน (4666.pdf/2679.pdf/5167.pdf ฯลฯ); ไฟล์ "สัญญาเช่าซื้อ..." ตัวเต็มมักโดนตัดขอบอ่านไม่ออก. รวมrow = opening principal.

**ยังรอ:** เติมยอด **บอลลูน งวด 36** ของไทยเครดิต 2 ก้อน เมื่อรู้ยอดปิดจากแบงก์ · แนบไฟล์ PDF สัญญาแต่ละก้อน (เจ้าของอัปโหลดเองผ่านฟอร์ม)

เกี่ยว: [[bank-accounts-recon]] [[accounting-system]]
