---
name: doc-window-loading
description: แบบแผน "โหลดเอกสารเฉพาะช่วงวันที่จากเซิร์ฟเวอร์" (opts.since) ที่หน้าใบแจ้งหนี้ใช้ตั้งแต่ v850 — ใช้ listXTotals แบบบางสำหรับตัวเลขที่ต้องนับจากทุกใบ, กติกาโหลดใหม่เมื่อช่วงเก่ากว่าที่โหลด, ตัวกันผลรอบเก่าทับ; หน้าอื่น (ใบเสร็จ/ใบวางบิล/ใบเสนอ) ยังโหลดเต็ม ถ้าจะทำต่อให้ลอกแบบนี้
metadata:
  type: project
---

**หน้าใบแจ้งหนี้ (Invoices.jsx, v850) โหลดเฉพาะช่วงวันที่ที่เลือกจากเซิร์ฟเวอร์** — เดิมทุกหน้าเอกสารดึง "ทุกใบทั้งบริษัท" แล้วซ่อนด้วย dateR (ค่าเริ่มต้น 6 เดือน) ในเบราว์เซอร์

**แบบแผน (ลอกไปใช้กับหน้าอื่นได้):**
- api.js: `_loadX(opts)` รองรับ `since` ผ่าน `_sinceOf` + `_orSince(q, ["issue_date","created_at"], since)` (มีอยู่แล้วใน _loadQuotations/_loadReceipts สำหรับแดชบอร์ด) · เมื่อ scoped ต้อง "รอหัวใบก่อน" แล้วกรองตารางลูกด้วย `_capNos(ids ที่ได้จริง)` (เกิน 200 → null = โหลดเต็ม ถูกเสมอแค่ไม่ประหยัด)
- **ตัวเลขที่ต้องนับจากทุกใบ ห้ามนับจาก list ที่โหลดมาแค่ช่วง** — ใบแจ้งหนี้คือ ยอดวางบิลสะสมต่อใบเสนอ (`billedByQuote`), งวดที่เท่าไร, งานฟรีออกใบแล้วหรือยัง, "ซ่อนอยู่ N ใบ", จำนวนใบบนหัวหน้า → เพิ่ม `listInvoiceTotals()` = ทุกใบแบบบาง 5 คอลัมน์ (invoice_no,quote_no,total,status,issue_date) ผ่าน `_cached(..., _SHORT_TTL)` + `_fetchAll` · ต้องวางไว้ **หลัง** `billedByQuote` เพราะ test-scoped-loads ตัดโค้ด `_loadInvoices` ถึง marker นั้น (มี `export function` คั่นจะทำให้ `new Function` พัง)
- Component: state `totals`, `loadedSince` (undefined=ยังไม่โหลด · ""=ทุกใบ · วันที่), `loadSeq` ref กันผลรอบเก่าทับ · `load(sinceArg)` รับ string เท่านั้น (ปุ่มลองใหม่ส่ง event → ใช้ `dateR.from`) · effect `[needFrom]`: โหลดใหม่เมื่อ `loadedSince===undefined` หรือ `needFrom` ว่าง/เก่ากว่า `loadedSince` — ขยับช่วงให้แคบลงไม่โหลด (ข้อมูลครอบอยู่แล้ว) · เอา `useEffect(() => { load(); }, [])` เดิมออก ไม่งั้นโหลด 2 รอบ · prop `focus` ยังล้าง dateR → โหลดทุกใบ ใบเก่าไม่ขึ้น "ไม่พบ"
- ผู้เรียก listInvoices() แบบไม่มี since (ใบเสร็จ/ลูกหนี้/ใบวางบิล/รายงาน) ไม่กระทบ — test (1) ใน test-scoped-loads ยืนยันว่าไม่มีตัวกรอง

**ยังไม่ได้ทำ (ตั้งใจ):** ใบเสนอราคา/ใบเสร็จ/ใบวางบิล ยังโหลดเต็ม · HR (ใบลา/OT/เบิก) โหลดทุกปี — ไม่ scope เพราะเงินเดือน/โควตาลาใช้ทั้งปี+ปีก่อน 8 จุดเรียก เสี่ยงเกินคุ้ม (18 ก.ย. 2026) · ลงเวลา (attendance) bounded ด้วยช่วงวันอยู่แล้ว
- suites: test-invoice-window.mjs (14) + ส่วน "ใบแจ้งหนี้ { since }" ใน test-scoped-loads.mjs · ดู [[release-gate]]
