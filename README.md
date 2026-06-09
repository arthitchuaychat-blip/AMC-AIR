# วัสดุOS · ระบบจัดการสต๊อกวัสดุ (Materials Stock & Issue/Return)

ต้นแบบเว็บแอปจัดการสต๊อกวัสดุ เบิก–คืน และจัดซื้อ สร้างจากดีไซน์ Claude Design
A clickable prototype for materials stock, withdraw/return, and procurement — built from the Claude Design handoff.

## วิธีเปิดใช้งาน · How to run

**ดับเบิลคลิกไฟล์ `index.html`** เปิดในเบราว์เซอร์ (Chrome/Edge/Firefox) ได้เลย — ไม่ต้องติดตั้งอะไร
Just **double-click `index.html`** to open it in any browser. No build step, no install.

> ต้องต่ออินเทอร์เน็ตครั้งแรก เพราะโหลด React และฟอนต์ภาษาไทยจาก CDN
> Needs internet on first load (React + Thai fonts come from a CDN).

ถ้าอยากเปิดผ่านเซิร์ฟเวอร์ในเครื่อง (เช่นเวลาทดสอบบนมือถือในวง LAN เดียวกัน):
To serve over a local HTTP server instead (e.g. to test on a phone on the same network):

```powershell
powershell -ExecutionPolicy Bypass -File _design\serve.ps1
# แล้วเปิด http://localhost:8123/
```

## สิ่งที่มีในต้นแบบ · What's inside

มี 3 บทบาท สลับได้จากแถบซ้าย · Three roles, switch from the left sidebar:

- **ผู้บริหาร (Executive)** — แดชบอร์ดสรุป: ยอดเบิก · วัสดุที่ใช้จริง (เบิก−คืน) · ยอดซื้อ · ของเสีย
  เลือกช่วงเวลา วัน/เดือน/ปี/ตลอดอายุ · คลิกการ์ด KPI เพื่อเจาะลึกรายทีม/รายวัสดุ/รายธุรกรรม
  มูลค่าวัสดุคงเหลือ + รายการคงเหลือ + การ์ด "ต้องสั่งซื้อเพิ่ม" ที่กดไปหน้าจัดซื้อได้ทันที
- **ธุรการจัดซื้อ (Procurement)** — สั่งซื้ออัตโนมัติจากของที่ต่ำกว่าขั้นต่ำ · อนุมัติ/จ่ายเบิก · รับคืน ·
  ตัดของเสีย (ระบุทีม·เลขงาน·สาเหตุ·แนบรูป) · คลังวัสดุ (ค้นหา · เพิ่มวัสดุ · คลิกดูประวัติการเคลื่อนไหว)
- **ช่าง (Field Team)** — มุมมองมือถือ เบิก/ส่งคืนวัสดุตามเลขที่งาน เน้นไอคอน+รูปให้ใช้ง่ายทุกภาษา

> ข้อมูลเป็นข้อมูลตัวอย่างที่สร้างจำลอง (seeded) ~18 เดือน เพื่อให้เห็นภาพทั้งระบบ
> Data is seeded mock data (~18 months) so the whole system is visible. Nothing is persisted.

## โครงสร้างไฟล์ · Files

- `index.html` — แอปทั้งหมดในไฟล์เดียว (precompiled React, ไม่ต้องมี build tool)
- `_design/` — ชุดส่งมอบต้นฉบับจาก Claude Design ใช้อ้างอิง (README, แชต, ซอร์สโค้ด `.jsx` แยกโมดูล)
- `_design/serve.ps1` — เซิร์ฟเวอร์ static เล็ก ๆ สำหรับเปิดผ่าน http (ออปชัน)

### หมายเหตุทางเทคนิค · Build note
`index.html` ประกอบจากซอร์สใน `_design/inventory-management/project/` โดยคอมไพล์ JSX เป็น JS ธรรมดาไว้ล่วงหน้า
(ตัดเฉพาะแผง "Tweaks" ของเครื่องมือดีไซน์ออก เพราะใช้ได้แต่ในตัวเครื่องมือ) ถ้าจะพัฒนาต่อ แก้ที่ซอร์ส `.jsx`
แล้วประกอบใหม่ หรือย้ายเข้าโปรเจกต์ React/Vite จริงได้
