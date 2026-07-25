---
name: app-performance
description: ทำแอปโหลดเร็วขึ้น — code-split + แคชตัวคงที่ทำแล้ว (v506); เหลือ index/แคช doc-list ถ้ายังอืด
metadata: 
  node_type: memory
  type: project
  originSessionId: 9e3e3c98-8673-47b0-99ce-ee3aa866d22b
  modified: 2026-07-25T16:00:30.800Z
---

เจ้าของแจ้ง (2026-07-25) ว่าแอปใช้งานอืด. (ส่วนที่รู้สึกว่า "ทวนความจำนาน" = แชต Claude ยาวเกิน ไม่ใช่แอป — แก้ด้วยเปิดแชตใหม่ต่อ 1 งาน. ความจำมีแค่ ~870 บรรทัด ไม่ใช่คอขวด.)

**นับแถวแล้ว (2026-07-25) ข้อมูลเล็กมาก — ยืนยันว่าความอืดเป็น "โครงสร้าง" ไม่ใช่ "ปริมาณ":**
quotation_items 1705 · boq_items 1675 · materials 1326 · transactions 763 · customers 533 · quotations 360 · boqs 336 · job_orders 278 · invoices 139 · receipts 107. ตารางใหญ่สุด ~1700 แถว Postgres สแกนแป๊บเดียว.

**แผน (ปรับลำดับตามข้อมูลจริง — index เลื่อนออกเพราะข้อมูลยังเล็ก):**
1. ✅ **เสร็จแล้ว (v506, 2026-07-25) — code-split บันเดิล** — App.jsx เปลี่ยน import หน้าเมนูทั้ง ~35 หน้าเป็น `React.lazy(() => import(...))` + ครอบ view-switch ด้วย `<React.Suspense fallback="กำลังโหลด…">`. เปลือกที่ตามทุกเมนู (TaskReminder/ChatDock/NotificationBell/Login/ConfirmDialog/ErrorBoundary) ยัง eager. **ผล: บันเดิลแรก 2,290KB → 647KB (gzip 659→181)** · libs หนัก (jspdf 390KB, html2canvas 201KB, heic2any 1.35MB) แยกก้อนโหลดเฉพาะหน้าที่ใช้.
2. ✅ **เสร็จแล้ว (v506) — แคชตัวคงที่ระดับแอป** — เพิ่ม `_cached(key, loader)` + `bustCache(key)` ใน api.js (TTL 5 นาที, เก็บ promise = dedupe คำขอที่ยิงพร้อมกัน, ล้มไม่แคช). ครอบ `getCompanies`("companies") · `listTeams`("teams") · `listMaterialsLite`("materials-lite" → body ย้ายไป `_loadMaterialsLite`). ล้างแคชทุกจุดเขียน: materials (saveMaterial/setMaterialsPhoto/setMaterialFeatures/updateMaterialCost/deactivateMaterial/setMaterialsWebPublished/bulkUpsertMaterials/deleteAllMaterials) · teams (saveTeam/deleteTeam) · companies (saveCompany). ⚠️ test-thumb-missing-mat.mjs anchor เปลี่ยนเป็น `_loadMaterialsLite` แล้ว. **หมายเหตุ: listMaterials (view material_stock เต็ม) ไม่แคช** — เพราะ stock เปลี่ยนตาม transactions; lite อ่านตาราง materials ตรง ๆ จึงแคชได้.
3. **index — พักไว้ก่อน** (1700 แถวมี/ไม่มีก็เร็วพอกัน) ค่อยทำตอนตารางโตหลักหมื่น. ตอนนั้นค่อยเพิ่ม issue_date/customer_id/status/quote_no ฯลฯ.
4. **ยังไม่ทำ ถ้ายังรู้สึกอืด**: (ก) แต่ละหน้ายังดึงหลายตารางเต็มทุกครั้งสลับเมนู (เช่น Receipts.load = listReceipts+listInvoices+listQuotations+getCompanies+listDocLinks พร้อมกัน) — แคช doc-list ระดับแอปหรือ prefetch ได้อีก · (ข) `select` เฉพาะคอลัมน์ที่ใช้ · (ค) material_stock view คิดสดจาก transactions ทุกครั้ง → ตารางยอดคงเหลือสะสมเมื่อ transactions โต. **ก่อนทำเพิ่ม: ให้เจ้าของวัด Network/Performance จริงว่ายังช้าตรงไหน.**

⚠️ วิธีตรวจว่าช้าตรงไหนจริง: ก่อนแก้ ให้ดู Network/Performance tab ในเบราว์เซอร์ (แอปล็อกอิน — เจ้าของเปิดเอง) ว่าเสียเวลาที่ "โหลดบันเดิล" หรือ "รอ query". ดู [[supabase-1000-row-cap]] (_fetchAll เพจทั้งตาราง) + [[stale-cache-deploys]] (bump BUILD ทุกครั้งที่แก้ app/).
