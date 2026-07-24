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

**หน้าตายเพราะ "หาสินค้าไม่เจอ" (v503, 2026-07-24).** อาการ: หน้าเคลื่อนไหวสินค้าขึ้น ErrorBoundary พร้อม `Cannot read properties of undefined (reading 'color')`. ต้นเหตุ: `MaterialThumb` ใน `app/src/icons.jsx` อ่าน `mat.color` ตรง ๆ แต่ทุกหน้าหาข้อมูลสินค้าจาก `matMap[code]` ที่สร้างจาก `listMaterialsLite()` ซึ่ง **กรอง `.eq("active", true)`** ⇒ สินค้าที่ถูกปิดใช้งานหลังออกใบสั่งซื้อจะหาไม่เจอ → `mat` เป็น undefined → ทั้งหน้าตาย. ทางที่เดินจริง: ใบสั่งซื้อ → "รับสินค้าเข้าสต๊อก" → prefill ตะกร้าจากรายการในใบ → `<MaterialThumb mat={l.m}>` ที่ Movements.jsx ไม่มีตัวกัน. **สัญญาณที่ควรอ่านออกตั้งแต่แรก**: มี 2 จุดในโค้ดเขียน `mat={m || { color: "#888" }}` ไว้ (Movements:515, PurchaseOrders:313) = เคยมีคนโดนแล้วแก้ที่ปลายทาง — เจอ workaround แบบนี้ให้ไปแก้ที่ต้นทางทันที ไม่งั้นจุดที่ 3 จะโดนซ้ำ. แก้: `mat?.color` / `mat?.photoUrl` ที่ตัว MaterialThumb + Movements โชว์รหัสสินค้าแทนชื่อ ติดป้าย "สินค้าถูกปิดใช้งาน" และเตือนตอน prefill. กันถอยหลัง: `app/test-thumb-missing-mat.mjs` (ตรวจว่าไม่เหลือ `mat.<prop>` แบบไม่มี `?.` เลย · mutation 5 แบบ). บทเรียนเดิมยังใช้ได้: `npm test` เขียวไม่ได้แปลว่าหน้าเปิดได้ — ไม่มีเทสต์ไหนเปิดหน้าจริง [[permissions-system]]
