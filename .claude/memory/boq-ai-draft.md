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

## กติกาคิดราคาจริงของ AMC (ฝังใน prompt แล้ว v653-655+)
- **อ่านแบบ:** ยึด "SCHEMATIC DIAGRAM – AIR COND." เป็นตาราง AC ที่แม่นสุด (FCU-x + BTU/h + ห้อง + ชั้น) · floor plan ("ผังระบบปรับอากาศชั้น x") ใช้ดูแนวท่อ FCU→CDU + ระยะ (grid dimension เมตร)
- **3 สัญลักษณ์เครื่อง (เจ้าของสอนเอง):** ติดผนัง = รูปเครื่องบางครีบเป่าเฉียง · คาสเซ็ท 4 ทิศ = สี่เหลี่ยมจัตุรัสมีตะแกรงกากบาท · **Single Flow 1 ทิศ = กล่องสี่เหลี่ยมผืนผ้า + ใบพัด 3 อันเรียงด้านล่าง** (อย่าสับสนกับติดผนัง!)
- **ยี่ห้อ (บรีฟบ้านนี้):** ติดผนัง+คาสเซ็ท4ทิศ = Daikin · Single Flow = Carrier (Inverter ถูกสุด)
- **ค่าติดตั้ง:** คาสเซ็ท 4 ทิศ + Single Flow ใช้ค่าบริการ "Cassette 4 way" ตัวเดียวกัน (ค่าแรงเหมือนกัน) · ตัวเครื่องแยกจริง
- **BTU ไม่ตรงรุ่น → ปัดขึ้น** (สูงกว่าใกล้สุด ห้ามปัดลง)
- **ท่อน้ำยา:** 1 ชุด = 2 ขนาด (liquid+suction) · ตารางมาตรฐาน ≤12k 1/4+3/8 · 18k 1/4+1/2 · 24k 3/8+5/8 · 40-48k 3/8+3/4 · **หักท่อแถม 4 ม./ชุด** จากความยาวในแบบ (≤0 ไม่ใส่)
- **ความยาวท่อ:** อ่านตัวเลข "X m" ที่มาร์คในแบบตรง ๆ ก่อน (วิศวกรรวมระยะดิ่งแล้ว) · ถ้าไม่มีค่อยประเมิน + บวกดิ่ง 3ม./ชั้น (บ้านนี้ย้าย CDU ชั้น2-3 ลงชั้น1 เดินท่อลงชาฟท์ · คอยล์ร้อนแขวนซ้อน 2-3 ชั้น)
- **ห้ามใส่ section "free"** (วัสดุแถม = ประมาณการ) — ตัดทิ้งฝั่งเซิร์ฟเวอร์ด้วย
- ทุกบรรทัด ac ใส่ note = FCU + ห้อง (แยกบรรทัดต่อตำแหน่ง)

## บทเรียนเทคนิค (แก้จริง)
- PDF สแกน/export เป็นรูป → pdftotext/pdftoppm ในเครื่องอ่านไม่ออก (bad flate stream) — ใช้ Claude vision เท่านั้น · **แนะเจ้าของอัปโหลด "รูป" (schematic + floor plan) แทน PDF 20 หน้า** เร็ว/โฟกัสกว่า
- **504 timeout:** effort medium + max_tokens สูง → ช้าเกิน 90s + reasoning กินโควตาจน JSON โดนตัด → ใช้ **effort:"low"** + max_tokens 12000 + maxDuration 300 · โหลด catalog ครั้งเดียว reuse
- parseLooseJson/salvageJson: กู้ JSON ที่ AI เขียนเกิน/ถูกตัดกลาง (สแกน { } สมดุลทีละ object)
- โหลดไฟล์: PDF ≤24MB รูป ≤5MB รวม base64 ≤28MB · diag คืนต่อไฟล์ให้รู้ว่าเข้า AI จริงไหม
- questions บังคับมีเสมอเมื่อร่างไม่ออก (prompt + fallback 3 ข้อ)

ตัวอย่างจริง "พัฒนาการ 74/Laanlom" (บ้าน 3 ชั้น 12 FCU): ติดผนัง3(FCU-1,4,5) คาสเซ็ท4ทิศ3(FCU-2,3,7) SingleFlow6(FCU-6,8,9,10,11,12) · BTU 9k×1/18k×4/24k×5/46k×2 · ใบเสนออ้างอิง ฿418,843 25 รายการ

Follow-up id: เก็บขนาดท่อจริงในข้อมูลรุ่นแอร์ (ตอนนี้ใช้ตารางมาตรฐาน) · ชุดวัสดุมาตรฐานต่อเครื่อง (kit) · เรียนรู้จาก BOQ เก่า.
