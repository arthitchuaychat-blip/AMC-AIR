---
name: app-performance
description: งานค้าง — ทำแอปโหลดเร็วขึ้น (เจ้าของรู้สึกอืด ก.ค. 2026); แผน + ต้นเหตุที่วินิจฉัยไว้
metadata:
  type: project
---

เจ้าของแจ้ง (2026-07-25) ว่าแอปใช้งานอืด. (ส่วนที่รู้สึกว่า "ทวนความจำนาน" = แชต Claude ยาวเกิน ไม่ใช่แอป — แก้ด้วยเปิดแชตใหม่ต่อ 1 งาน. ความจำมีแค่ ~870 บรรทัด ไม่ใช่คอขวด.)

**นับแถวแล้ว (2026-07-25) ข้อมูลเล็กมาก — ยืนยันว่าความอืดเป็น "โครงสร้าง" ไม่ใช่ "ปริมาณ":**
quotation_items 1705 · boq_items 1675 · materials 1326 · transactions 763 · customers 533 · quotations 360 · boqs 336 · job_orders 278 · invoices 139 · receipts 107. ตารางใหญ่สุด ~1700 แถว Postgres สแกนแป๊บเดียว.

**แผน (ปรับลำดับตามข้อมูลจริง — index เลื่อนออกเพราะข้อมูลยังเล็ก):**
1. **code-split บันเดิล** ⭐ ตัวจริง — `npm run build` เตือน chunk > 500KB, เปิดแอปครั้งแรกโหลด JS ทั้งก้อน → แยกโหลดตามหน้าด้วย `React.lazy` + `Suspense` (แยกหน้าหนัก ๆ เช่นเอกสาร/รายงาน/HR). ได้ผลกับ "เปิดแอปครั้งแรกช้า" มากสุด.
2. **ลดการดึงซ้ำต่อหน้า + แคชตัวคงที่** — แต่ละหน้าดึงหลายตารางเต็มทุกครั้งที่สลับเมนู (เช่น Receipts.jsx `load()` = listReceipts + listInvoices + listQuotations + getCompanies + listDocLinks พร้อมกัน). getCompanies/listMaterialsLite/listTeams โหลดใหม่ทุกหน้าทั้งที่แทบไม่เปลี่ยน → แคชระดับแอป (context/module cache) ไม่ดึงซ้ำ.
3. **index — พักไว้ก่อน** (1700 แถวมี/ไม่มีก็เร็วพอกัน) ค่อยทำตอนตารางโตหลักหมื่น. ตอนนั้นค่อยเพิ่ม issue_date/customer_id/status/quote_no ฯลฯ.
4. อื่น ๆ ถ้ายังไม่พอ: `select` เฉพาะคอลัมน์ที่ใช้ · material_stock view คิดสดจาก transactions ทุกครั้ง → ตารางยอดคงเหลือแบบสะสมเมื่อ transactions โต.

⚠️ วิธีตรวจว่าช้าตรงไหนจริง: ก่อนแก้ ให้ดู Network/Performance tab ในเบราว์เซอร์ (แอปล็อกอิน — เจ้าของเปิดเอง) ว่าเสียเวลาที่ "โหลดบันเดิล" หรือ "รอ query". ดู [[supabase-1000-row-cap]] (_fetchAll เพจทั้งตาราง) + [[stale-cache-deploys]] (bump BUILD ทุกครั้งที่แก้ app/).
