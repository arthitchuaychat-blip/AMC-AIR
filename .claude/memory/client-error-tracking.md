---
name: client-error-tracking
description: ระบบเก็บ error จากเครื่องผู้ใช้ลงตาราง client_errors (v847) — เจตนาความเป็นส่วนตัว, จุดติดตั้ง, กติกาตัวรายงาน, วิธีดู
metadata:
  type: project
---

**เก็บ error จากเครื่องผู้ใช้ (v847, 2026-09-17) — "รู้ปัญหาก่อนพนักงานมาบอก".** `app/src/lib/errorReport.js`: `reportClientError(kind, err, {componentStack})` + `installGlobalErrorReporting()` (main.jsx: window `error` + `unhandledrejection`) · ErrorBoundary รายงาน `kind="render"` · `window.__amcBuild = BUILD` (App.jsx) บอกเวอร์ชันที่พัง.
- **เจตนาความเป็นส่วนตัว (ห้ามเปลี่ยน):** ErrorBoundary เดิมตั้งใจ "ไม่ส่ง stack ออกข้างนอก เพราะข้อมูลลูกค้าอาจติดไป" → จึงเก็บใน **Supabase ของเราเอง** เท่านั้น (ตาราง `client_errors`, mig `20260917120000`) ตัด message ≤500 / stack ≤1500 ไม่เก็บ props/state/ฟอร์ม · RLS: insert เฉพาะของตัวเอง, อ่านเฉพาะ admin/exec. **ห้ามต่อ Sentry/บริการภายนอก** โดยไม่ถามเจ้าของ.
- **กติกาตัวรายงาน:** ห้ามโยน error ออก (try/catch ทั้งตัว) · จำกัดอัตรา (ซ้ำใน 60 วิส่งครั้งเดียว, ≤10/นาที) · ข้าม chunk error หลัง deploy (รีโหลดเองอยู่แล้ว) · ไม่มี user = ไม่ส่ง. test: `test-error-report.mjs`.
- **ดู error:** Supabase SQL: `select at, build, kind, url, left(message,120) from client_errors order by at desc limit 50;` — ยังไม่มีหน้าจอในแอป (ทำได้ทีหลังใน Settings/Exec ถ้าเจ้าของขอ).
