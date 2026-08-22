---
name: boq-ai-draft
description: ตัวช่วย AI ร่าง BOQ จากแบบ/แปลน (Claude vision) — endpoint boq-ai.js + โมดัลใน BOQ.jsx
metadata:
  type: project
---

ฟีเจอร์ v1 (v651): ให้ AI อ่าน "แบบ/แปลน (มาร์คจุดแอร์)" + สเปค + บรีฟ → ร่างรายการ BOQ จากแคตตาล็อกจริง ให้คนตรวจ/แก้. **การใช้ Claude vision ครั้งแรกในระบบ** (ก่อนหน้าทุก AI call เป็น text-only).

**Endpoint `app/api/boq-ai.js`** (POST, office JWT, `maxDuration 90` ใน vercel.json):
- รับ `{ imageUrls:[], spec, brief }` · โหลดรูป/PDF จาก storage → base64 → content block (`type:image` / `type:document` สำหรับ pdf) สูงสุด 6 ไฟล์/5MB.
- แคตตาล็อก: materials active แยก 3 หมวด ac/service/material — ใช้ **cost (ต้นทุน)** เหมือน BOQ (ไม่ใช่ sale_price) · cache_control ephemeral บน block แคตตาล็อก.
- Claude `claude-sonnet-5` max_tokens 4000 effort medium · system = กติกา + แคตตาล็อก · user = [รูป..., text(spec+brief)].
- ให้ตอบ JSON `{summary, lines:[{section,code,name,unit,qty,unit_cost,note,needsCheck}]}` · **override ชื่อ/หน่วย/ต้นทุนจากรหัสจริง** (กัน AI มั่วราคา) · code ไม่พบ → code="" + ต่อ "⚠️ ตรวจสอบ" ใน description.

**UI `BOQ.jsx`** (ในหน้า editor): กล่องม่วง "🤖 ให้ AI ช่วยร่างจากแบบ" → ปุ่ม → `BoqAiModal`:
- อัปโหลดรูป/PDF (`uploadExpenseFile` รูป · `uploadDocFile(f,"pdf","application/pdf")` PDF) · textarea สเปค + บรีฟ + ปุ่มบรีฟสำเร็จรูป `BRIEF_CHIPS` (ยี่ห้อ/ฉนวน/ขายึด/เดินท่อ ฯลฯ).
- `aiDraftBoq({imageUrls,spec,brief})` (api.js) → แสดงผลให้พรีวิว → "เติมเข้าใบ" → `applyAiLines()` ต่อเข้า `ed.items[section]` (shape `{code,name,unit,qty,unit_cost,description}` เหมือน browserAdd).

BOQ item shape: `items:{ac:[],free:[],charged:[],service:[]}` · line `{code(→item_code),name,unit,qty,unit_cost(=cost),description}` · section = bucket key. saveBoq flatten + RPC replace_boq_items. [[sales-doc-flow]]

Follow-up id: ชุดวัสดุมาตรฐานต่อเครื่อง (ยังไม่มีตาราง kit — AI เดาจากแคตตาล็อก) · รองรับ PDF หลายหน้า · เรียนรู้จาก BOQ เก่า.
