---
name: doc-idempotency
description: กันบันทึกเอกสารเงินซ้ำ 2 ชั้น (busy guard ฝั่งจอ + request_id unique ระดับ DB) — ดีไซน์, ไฟล์ที่เกี่ยว, migration รันแล้ว 2026-09-17, วิธีต่อยอดกับตารางอื่น
metadata:
  type: project
---

**กันซ้ำ 2 ชั้น (v842-v844, ขึ้น production + migration รันแล้ว 2026-09-17).** ครอบคลุม ใบแจ้งหนี้ / ใบเสร็จ / ใบเพิ่ม-ลดหนี้ / ใบวางบิล (+ ลูกหนี้: ตัดหนี้สูญ/ทวง)

- **ชั้น 1 — จอ:** `const [busy, setBusy] = useState(null)` (keyed ด้วยเลขใบ หรือ `"save"`) · handler: `if (busy) return;` บรรทัดแรก → `setBusy(key)` ก่อน await เขียน → `finally { setBusy(null) }` · ปุ่ม: `disabled={busy === key}` · **ระวัง scope**: BillingNotes มี `busy` ของ `CreateModal` (คอมโพเนนต์ย่อย) แยกจากของคอมโพเนนต์นอก — อ้างข้าม scope = หน้าพัง (test-undefined-vars จับได้)
- **ชั้น 2 — DB:** `request_id uuid` + partial unique index (`where request_id is not null`) ใน receipts/invoices/adjustment_notes/billing_notes (mig `20260917100000_doc_request_id.sql`). ฝั่งจอสร้าง `request_id: crypto.randomUUID()` **ตอนเปิดฟอร์มสร้าง 1 ครั้ง** (ไม่ใช่ต่อคลิก/ต่อใบ) แล้วส่งมากับ row → `api.js _upsertIdem(table,row,onConflict)`: 23505 บน request_id = คืน `{dup:true}` ให้ผู้เรียก `return` ข้าม side effect (sync กระแสเงินสด/สถานะ/ออดิท ไม่ทำซ้ำ) · คอลัมน์ไม่มี (ยังไม่รัน SQL) = ตัด request_id ทิ้งแล้ว upsert ปกติ · error อื่นโยนต่อ
- **ทำไมต้องเป็น UUID ต่อการเปิดฟอร์ม:** แยก "กดครั้งเดิมซ้ำ/retry หลังเน็ตหลุด" (UUID เดิม → ปฏิเสธ) ออกจาก "จ่ายบางส่วนรอบใหม่/ออกใบใหม่" (เปิดฟอร์มใหม่ = UUID ใหม่ → ผ่าน) — unique บนเลขใบ/ใบแจ้งหนี้อย่างเดียวจะขวางงวดที่ถูกต้อง (ประเด็นที่ GPT ท้วงและถูก)
- **ต่อยอดตารางอื่น (เบิกจ่าย/รับของ/เบิกสต๊อก):** เพิ่มคอลัมน์+index แบบเดียวกัน → ใส่ `request_id` ใน state ตอนเปิดฟอร์ม → เปลี่ยน upsert เป็น `_upsertIdem` → เพิ่มเคสใน `test-doc-idempotency.mjs` (ตรวจครบ 4 ชั้น: ฟอร์ม/api/helper/migration)
- test: `test-money-views.mjs` (ลูกหนี้/เจ้าหนี้) · `test-money-docs.mjs` (guard เอกสาร 4 ชนิด) · `test-doc-idempotency.mjs` (ชั้น DB) · ดู [[build-passes-page-dead]] (npm test รันครบทุก suite แล้ว)

**ต่อยอดแล้ว (v847):** `expense_requests` — `_insertIdem(table,row)` (คู่ของ _upsertIdem สำหรับตาราง insert ใหม่) ใน `submitExpense` + ฟอร์มขอเบิกใหม่ใส่ `request_id` ตอนเปิด (Expenses.jsx setForm) · mig `20260917110000_expense_request_id.sql` · test `test-expense-idempotency.mjs`. ยังไม่ทำ: รับของ PO / เบิกสต๊อก (Movements) — ใช้ pattern เดียวกัน
