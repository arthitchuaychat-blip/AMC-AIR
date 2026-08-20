---
name: job-survey-continuity
description: ใบงานติดตั้งต่อเนื่องจากงานสำรวจ — ผูก survey_job_no + ดึงบรีฟ/รูปสำรวจมาให้ช่าง
metadata:
  type: project
---

ปัญหาเดิม: ใบงานสำรวจ (job_type=survey, ไม่มี quote_no) กับใบงานติดตั้ง (สร้างจากใบเสนอราคาที่อนุมัติ) เป็นคนละใบ → ช่างติดตั้งไม่เห็นข้อมูลสำรวจ.

แก้ (mig **220**, v634, แบบ B): เพิ่มคอลัมน์ `job_orders.survey_job_no` (FK→job_orders, แบบเดียวกับ rework_of) = ใบติดตั้งชี้กลับใบสำรวจ.
- **⚠️ ห้ามยัด quote_no ลงใบสำรวจ** — Profit.jsx ใช้เงื่อนไข "survey + ไม่มี quote_no" นับเป็นค่าใช้จ่ายการขาย ([[survey-cost]] / [[profit]]). ใบสำรวจต้องไม่มี quote_no เสมอ.
- **JobOrders.jsx prefill (สร้างใบติดตั้งจากใบเสนอ):** auto หา survey job ล่าสุดของลูกค้า+ไซต์เดียวกันที่ยังไม่ผูก → ตั้ง survey_job_no + **ก็อป sales_note/details/completion_note → sales_note และ sales_photos+photos → sales_photos** ของใบติดตั้ง (จุดตั้งต้น ออฟฟิศแก้ต่อได้). copy เพราะจอช่าง MyJobs อ่าน sales_note/sales_photos ของใบตัวเอง (เข้าไม่ถึงใบสำรวจของทีมอื่น).
- **Editor panel** "🔍 ข้อมูลจากการสำรวจหน้างาน" (เฉพาะ job_type≠survey): dropdown เลือก/ยกเลิกผูก (survey jobs ของลูกค้า) + โชว์บรีฟ/รูปสด + ปุ่ม "เปิดใบงานสำรวจ" (setEd(null)+setQ+setOpenTl).
- api saveJobOrder: `survey_job_no: jo.survey_job_no||null` + fallback strip ถ้า pre-220. `_loadJobOrders` select("*") → มากับ list อยู่แล้ว.

Follow-up ถ้าอยากได้: ชิปลิงก์ survey↔install ในสายเอกสาร (แต่ survey ไม่มี quote_no เลยไม่อยู่ใน listDocLinks — ต้องทำ key แยก).
