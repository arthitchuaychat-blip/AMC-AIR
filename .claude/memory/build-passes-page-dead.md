---
name: build-passes-page-dead
description: npm run build ผ่านไม่ได้แปลว่าหน้าเปิดได้ — ตัวแปรที่ไม่มีในขอบเขตระเบิดตอนรันไทม์เท่านั้น ตรวจด้วย npm test (test-undefined-vars.mjs)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b8d73488-693d-46d1-b5f3-7849cf1f6166
  modified: 2026-07-20T04:45:12.513Z
---

`npm run build` ของ Vite **ไม่ตรวจตัวแปรอิสระ** — เรียกใช้ตัวที่ไม่มีใครประกาศ (prop ที่ลืมส่ง, ฟังก์ชันที่ลืม import, ชื่อฟังก์ชันที่พิมพ์ผิด) build ผ่านสบาย แล้วไป `ReferenceError` ตอนเจ้าของกดเข้าเมนู พังทั้งหน้า

เกิดมาแล้ว 3 จุด: `confirmDialog` ไม่ได้ import ใน App.jsx · `role` ใน MineTab ทำหน้าเบิกจ่ายตายทั้งหน้า (ผมแก้ call site แต่ลืม signature กับ prop) · `onOpenQuote` ที่ CustomerFollowup ไม่ได้รับทั้งที่ App ส่งมาให้ · `onChanged={load}` ใน ReportTab ที่ loader ชื่อ `run`

**Why:** งานนี้ไม่มี browser preview (แอปล็อกอินอยู่) เทสต์ทุกตัวก็ไม่ได้เปิดหน้าจริง เพราะงั้นด่านสุดท้ายก่อนถึงมือเจ้าของคือ static check เท่านั้น — ถ้าไม่มี ก็เท่ากับให้เจ้าของเป็นคนเจอบั๊กแทน

**How to apply:** รัน `npm test` ใน `app/` ทุกครั้งก่อน commit ไม่ใช่แค่ `npm run build` — `test-undefined-vars.mjs` แจงทุกไฟล์ด้วย @babel/parser แล้วรายงานตัวแปรที่ไม่มีในขอบเขต · เวลาแก้ call site ที่เพิ่มตัวแปรเข้าไป (เช่นเติม `role ===` ในฟังก์ชันที่เดิมไม่ใช้ role) ต้องไล่ดูด้วยว่าฟังก์ชันนั้น**รับตัวแปรนั้นจริงไหม** ไม่ใช่แค่ไฟล์นั้นมีตัวแปรชื่อนี้อยู่ที่ไหนสักแห่ง ดู [[git-boq-case]] สำหรับกับดักแนวเดียวกัน
