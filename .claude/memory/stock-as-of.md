---
name: stock-as-of
description: รายงานสต๊อกคงเหลือย้อนหลัง ณ วันที่ (v513) — สูตร init_stock + เคลื่อนไหวถึงวันนั้น
metadata: 
  node_type: memory
  type: project
  originSessionId: 9e3e3c98-8673-47b0-99ce-ee3aa866d22b
  modified: 2026-07-26T03:04:14.410Z
---

เจ้าของขอ (2026-07-26) ดูสต๊อกคงเหลือ (แอร์/วัสดุ/อะไหล่/อื่นๆ) ย้อนหลัง ณ วันที่เลือกได้. ทำเสร็จ v513.

**สูตร**: คงเหลือ ณ วันที่ D = `init_stock + Σ(เคลื่อนไหวที่ txn_date <= D)` เครื่องหมายตรงกับ view `material_stock` (schema.sql:289 / ล่าสุด mig 086):
`+ purchase/return/adjust_in · − withdraw/adjust_out · − damage เฉพาะ job_no ว่าง` (damage ในงานไม่ลด เพราะเบิกไปแล้ว)

**โค้ด**:
- `api.js stockAsOf(asOf)` — โหลด listMaterialsLite (ใช้ raw `init_stock`) + transactions ≤ asOf, คืน [{code,th,kind,cat,catName,unit,cost,tracked,onHand,value}] (กรอง kind≠service) · value = onHand×cost ปัจจุบัน (ประมาณ — ไม่เก็บต้นทุนย้อนหลังต่อวัน)
- `StockAsOf.jsx` — date picker (default วันนี้) + ชิปกรองหมวด แอร์/วัสดุ/อะไหล่(mat_group=part)/อื่นๆ + toggle ซ่อนเหลือ 0 + ตาราง + Export CSV · เรนเดอร์บนสุดของแท็บ "คลังวัสดุ" (Dashboard tab inv)
- ไม่ต้องรัน migration (ใช้ข้อมูลเดิม)

⚠️ lite item `.stock` = init_stock (ไม่ใช่คงเหลือจริง — ดู [[app-performance]]/test-stock-source) จึงคำนวณ onHand เองจาก init_stock + delta อย่าใช้ .stock · หมวดอะไหล่ใช้ mat_group=part ร่วมกับ [[income-cost-categories]]
