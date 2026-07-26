---
name: income-cost-categories
description: "โปรเจกต์ 3 เฟส เสร็จครบ v511 — ประเภทงาน + รายได้แยกหมวด + P&L ต้นทุน/ค่าใช้จ่ายบนแดชบอร์ด (ต้องรัน SQL 176+177)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9e3e3c98-8673-47b0-99ce-ee3aa866d22b
  modified: 2026-07-26T03:22:25.692Z
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

## ✅ เฟส 2 เสร็จ (v510, 2026-07-26) — หมวดรายได้บนแดชบอร์ด (8 หมวด)
- **migration 176** (`176_category_mat_group.sql`): `categories.mat_group text check(null|material|part)` — null/material=วัสดุ, part=อะไหล่ · **เจ้าของต้องรัน SQL เอง**
- api.js: `saveCategory` เขียน mat_group (มี fallback ถ้ายังไม่รัน 176) + `setCategoryMatGroup(id,group)` ใหม่ · `updateCategory` ไม่แตะ mat_group (ปลอดภัย)
- ติดป้าย UI: `Settings.jsx` Fold "📦 จัดกลุ่มหมวดวัสดุ" (MatGroupCard) — list หมวดที่ไม่ใช่ sv-* + Combo วัสดุ/อะไหล่ บันทึกทันที (ต้องรัน 176 ก่อนถึงกดได้)
- แดชบอร์ด: `Dashboard.jsx` การ์ด "รายได้แยกหมวด" (หลัง kpi-grid หลัก) — REV_CATS 8 หมวด + `revBucketOf(item, matBy, catGroup)` + `revByCat` useMemo. **ฐาน = fq (ยอดขายอนุมัติในช่วง) · ผลรวม = ovStat.sale** (กระจายส่วนลดท้ายบิลลงหมวดตามสัดส่วน afterDisc/subtotal). ใช้ `mats` (listMaterials เต็ม ที่โหลดอยู่แล้ว) สร้าง code→{kind,category} — **ห้ามใช้ listMaterialsLite ใน Dashboard** (test-stock-source เตือน + double-fetch) · โหลด listCategories เพิ่มใน ov
- bucket: kind=ac→ac · kind=service+category sv-install/clean/move/repair→svc_* · sv-remove/other/พิมพ์เอง→svc_other · material→catGroup[cat]==='part'?อะไหล่:วัสดุ
- ⚠️ ก่อนติดป้าย: material ทุกหมวด = "วัสดุ", อะไหล่=0 (graceful) · รายการพิมพ์เอง item_code=null แยกวัสดุ/อะไหล่ไม่ได้ (→วัสดุ)

## ✅ ต่อยอด (v514) — กดหมวดรายได้ดูรายการสินค้า/บริการรายตัว
การ์ด "รายได้แยกหมวด" (Dashboard overview) แต่ละแถวกดได้ → เปิด `RevItemsDrawer.jsx` แสดงรายการที่ขายในหมวดนั้น (รวมต่อสินค้า: จำนวน+จำนวนครั้ง+ยอด เรียงมาก→น้อย + Export)
- `Dashboard.jsx`: state revDrill · memo `revItemsByCat` (key=item_code หรือ ~ชื่อ ถ้าพิมพ์เอง) · ใช้ ratio/bucket เดียวกับ revByCat → **ผลรวมรายการ = ยอดหมวด** เป๊ะ
- drawer ใช้ class มาตรฐาน drawer-overlay/drawer/ddoc-row (เหมือน DashDocDrawer)

## (เดิม) เฟส 2 บันทึกวิเคราะห์ — หมวดรายได้บนแดชบอร์ด (8 หมวด)
เครื่องปรับอากาศ · วัสดุ · อุปกรณ์เสริม/อะไหล่ · ค่าบริการติดตั้ง/ล้าง/ย้าย/ซ่อม/อื่นๆ
- รายได้ปัจจุบันแยกแค่ VAT/ไม่VAT (`Dashboard.jsx` ovStat/rcStat) — ยังไม่เคยแยกตามหมวด
- **map ได้ 6/8 จาก** `quotation_items.kind` (ac/service/material — copy จาก materials ตอนเพิ่มรายการ) + join `item_code→materials.category`:
  - AC = kind='ac' · บริการ = kind='service' + category `sv-install/sv-clean/sv-move/sv-repair/sv-remove/sv-other` (มีอยู่แล้ว! นิยาม SERVICE_CATS ที่ ItemPicker.jsx:17)
- **ติด: วัสดุ vs อะไหล่** ทั้งคู่ kind='material' ไม่มีฟิลด์แยก → ต้องเพิ่ม "กลุ่ม" ให้ตาราง `categories` (material category ไหน=วัสดุ/ไหน=อะไหล่) ติดป้ายครั้งเดียว (migration + UI ใน Settings/Catalog)
- ⚠️ ยอดต่อบรรทัด = qty×price_show − discount(รายบรรทัด) · **ส่วนลดรวมท้ายบิล+ค่าธรรมเนียมบัตรคิดระดับใบ** ต้องเฉลี่ยลงหมวดตามสัดส่วน (ลอก pattern WHT `afterDisc*(svcSum/subtotal)` ที่ api.js) ให้ผลรวม 8 หมวด = ยอดการ์ดเดิม
- ⚠️ รายการพิมพ์เอง (item_code=null) มีแค่ kind — service ad-hoc ตกเป็น "อื่นๆ", material ad-hoc แยกวัสดุ/อะไหล่ไม่ได้
- ทางเลือกทน: snapshot category ลง quotation_items (migration + แก้ saveQuotation api.js:1874)

## ✅ เฟส 3 เสร็จ (v511, 2026-07-26) — P&L ต้นทุน/ค่าใช้จ่าย
- **แท็บใหม่ "📉 กำไร-ขาดทุน"** บนแดชบอร์ด (gate ด้วย can(role,"profit")) → `PnLReport.jsx` (โหลดข้อมูลเอง ตาม from/to)
- โครง 2 ชั้น: รายได้(ยอดขายอนุมัติ ก่อน VAT) − ต้นทุนขาย(เครื่อง/วัสดุ/อะไหล่/ค่าแรงช่างซับ) = กำไรขั้นต้น(%) − ค่าใช้จ่าย(เงินเดือน + หมวดเบิกจ่าย) = กำไรสุทธิ(%)
- **เกณฑ์ = "เกิดจริงในช่วง"** (ไม่ใช่จับคู่รายบิล): COGS ของ = ต้นทุนที่เบิกเข้างานในช่วง · ค่าแรงซับ = payout จ่ายแล้วในช่วง (gross) · เงินเดือน = สลิปงวดในช่วง (net) · OPEX = ใบเบิก approved/paid created_at ในช่วง group by category
- **api ใหม่**: `costOfGoodsByGroup(from,to)` → {ac,material,part} (transactions withdraw+damage−return, join materials→kind/mat_group, service=null ข้าม) · `listPayslipsRange(fromYM,toYM)` (period 'YYYY-MM' string compare)
- **กันนับซ้ำ**: EXCLUDE_OPEX = {"ซื้อสินค้า (PO)"} (ต้นทุนของนับทาง transactions แล้ว) · ค่าแรงซับใช้ sub_payouts.gross ไม่ใช่ job_orders.labor_total (กัน double กับ Profit.jsx)
- **migration 177** (`177_expense_categories_seed.sql`): seed หมวดเบิกจ่ายใหม่ (ค่าอาหาร/ค่าบำรุงรักษารถ/ค่าประกันรถ/ภาษี-พรบ.รถ/เครื่องมือช่าง) on conflict do nothing — **เจ้าของต้องรัน**
- ⚠️ ข้อจำกัดที่บอกเจ้าของแล้ว: รายได้(accrual จากใบเสนอ) vs ต้นทุน(เบิก/จ่ายจริง) คนละ event = ภาพรวม ไม่ใช่บัญชีแม่นบิลต่อบิล · ค่าแรง/เงินเดือนแยกรายบริการ(ล้าง/ซ่อม/ย้าย)ไม่ได้ · ถ้าลงเงินเดือน/ค่าแรงเป็นใบเบิกด้วยจะเห็นซ้ำ

## ✅ ต่อยอด (v512, 2026-07-26) — "อุปกรณ์เสริม/อะไหล่" เป็นแท็บหลักในคลังสินค้า
เจ้าของขอเลื่อนหมวดย่อย "#L อุปกรณ์เสริม และ อะไหล่" (ใต้วัสดุ) ขึ้นเป็นแท็บหลัก. ทำผ่าน **pseudo-kind "part"** (ไม่แตะ kind ใน DB):
- `Catalog.jsx` KINDS เพิ่ม `{v:"part", l:"อุปกรณ์เสริม/อะไหล่"}` · `isPart(m)=m.kind==='material' && catGroup[m.cat]==='part'` (catGroup จาก cats.mat_group)
- filter: part→isPart · material→material ที่ไม่ใช่ part · ชิปหมวดย่อยแยกตาม mat_group · defaultKind ฟอร์ม: part→material
- **migration 178**: `update categories set mat_group='part' where name_th like '%อะไหล่%' or '%อุปกรณ์เสริม%'` (auto-tag #L, ต้องรัน 176 ก่อน) — เจ้าของต้องรัน
- ผูกป้ายเดียวกับเฟส 2/3: อะไหล่ในคลัง = อะไหล่ในรายได้ = อะไหล่ใน P&L (mat_group='part' ที่เดียวคุมหมด)

## (เดิม) เฟส 3 บันทึกวิเคราะห์ — หมวดต้นทุน/ค่าใช้จ่าย (P&L รวมบริษัท)
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
