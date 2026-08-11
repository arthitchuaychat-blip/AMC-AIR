---
name: sales-pipeline
description: "ท่อขาย + แหล่งที่มาลูกค้า — customers.stage/source/owner_id, บอร์ด Pipeline.jsx, วัด ROI ช่องทาง (mig 199)"
metadata:
  type: project
---

**ท่อขาย + แหล่งที่มาลูกค้า (v574, 2026-08-06 — needs migration `199_customer_pipeline.sql`).** ข้อ 2/3 แผนพัฒนา (ดู [[kpi-scorecard]] ข้อ 1). ต่อยอดบน **customers เดิม** (ไม่สร้างตารางใหม่ → ประวัติงาน/ยอดค้างรับผูกกันเหมือนเดิม) สำหรับตำแหน่งฝ่ายขายภาคสนาม + วัด ROI โฆษณา.

- **mig 199 เพิ่มคอลัมน์ customers:** `source`(ช่องทาง) · `stage` · `owner_id`(uuid เซลส์ผู้ดูแล) · `next_followup`(date) · `est_value`(numeric) · `lost_reason`. customers write RLS = admin/sales/exec/finance/hr เดิม (mig 095) — ไม่ต้องแก้ RLS.
- **lib/pipeline.js:** `PIPE_STAGES` (new ผู้สนใจ→contact→survey→quote→won→lost; แต่ละอันมี emoji/badge class/`done` flag) · `OPEN_STAGES` (ยังไม่จบ) · `PIPE_SOURCES` (LINE/FB/ป้าย/แนะนำ/โฆษณา/เว็บ/Walk-in/โทร/ลูกค้าเก่า/อื่นๆ).
- **api.js:** `saveCustomer` เพิ่ม 6 ฟิลด์แบบ spread-if-defined (undefined = ไม่แตะ ของเดิมไม่ถูกล้าง) + `stripMig()` ตัดคอลัมน์ mig159/199 ออกใน fallback ถ้ายังไม่รัน migration · `setCustomerPipeline(id, patch)` อัปเดตเร็วจากบอร์ด + bustCache. (⚠️ cache helper ชื่อ `bustCache` ไม่ใช่ `_bust`.)
- **Customers.jsx:** กล่อง "🎯 ท่อขาย & แหล่งที่มา" ในฟอร์ม (source/stage/owner/next_followup/est_value + lost_reason โผล่เมื่อ stage=lost) · โหลด `listStaff()` เป็น dropdown ผู้ดูแล · blankCust ดีฟอลต์ stage='new'.
- **Pipeline.jsx (module ใหม่ `pipeline` 🎯, กลุ่ม crm):** บอร์ดคอลัมน์ตาม stage (เฉพาะลูกค้าที่ **มี stage** — ลูกค้าเก่า stage=null ไม่รก) + การ์ด (ชื่อคลิกเปิดลูกค้า/owner/est_value/source/next_followup แดงถ้าเลยกำหนด) + mini-select ย้ายขั้น · ตัวกรอง owner(เซลส์เริ่มที่ "ของฉัน")/source/ค้นชื่อ · **สรุป ROI ต่อช่องทาง** (total/won/conversion%) · tiles มูลค่าในท่อ. props `me={profile?.id}` `onOpenCustomer→custFocus+go(customers)`.
- **permissions:** module `pipeline` (editable) — **E: admin/exec/sales · V: hr/finance** · อื่น N. App NAV meta/emoji/render + BUILD v574.
- **ต่อยอด:** ยังไม่ auto-เลื่อนขั้นจาก quote (approved→won) — manual · est_value กรอกมือ · ข้อ 3 = คะแนนความพอใจลูกค้า (ป้อนเข้าสกอร์การ์ดทีม).

**วัดที่มา lead จากเว็บ → เชื่อมท่อขาย (v593, 2026-08-06 — mig 209).** สะพานที่ 2 ของรีวิว 6 ส.ค. (ปิดวงจร ROI โฆษณา). **company-website:** เก็บ `attribution` (UTM/gclid/fbclid/referrer) แบบ first-touch ใน localStorage `amc_attr` → ส่ง `source`(friendly เช่น "Facebook (แอด)")+`utm`(raw) ไปกับ web_orders ทั้ง 2 ฟอร์ม (+ fallback ตัด line_id/source/utm ถ้าคอลัมน์ยังไม่มี). **mig 209:** web_orders + `source text` + `utm jsonb`. **WebOrders.jsx:** โชว์ชิป "📣 ที่มา" + ตอน "สร้างลูกค้าจากใบนี้" (onCustSaved) เรียก `setCustomerPipeline(cid,{source: webPipeSource(o), stage:'contact'})` → ลูกค้าเข้าท่อขายอัตโนมัติพร้อม source → เข้ารายงาน ROI ต่อช่องทาง (Pipeline.jsx). map: มี "แอด"/gclid/fbclid/medium paid → "โฆษณา (ยิงแอด)" · else Facebook/LINE/เว็บไซต์.
