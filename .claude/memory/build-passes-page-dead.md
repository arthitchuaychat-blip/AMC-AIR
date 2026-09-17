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

**⚠️ กับดัก chain (พบ 2026-09-17, v842):** `npm test` ต่อ suite ด้วย `&&` → **หยุดที่ suite แรกที่ตก suite หลังจากนั้นไม่เคยรัน** — v841 RSTATUS ตกตัวเดียวทำให้ undefined-vars + อีก ~20 suite ถูกบังมานาน "ผ่าน 55" ที่เห็นคือแค่ suite แรก. ก่อนเชื่อว่าผ่าน ให้รันทีละไฟล์: `for t in test-*.mjs; do node $t >/dev/null 2>&1 && echo "✓ $t" || echo "✗ $t"; done`. พอปลด RSTATUS เจอทันที: 3 undefined-var จริง (Settings แท็บแจ้งเตือน `m`→`c` เปิดแล้วพัง · `markLoanPaid`/`unsettleLoan` อ้าง `status` ไม่มีในขอบเขต → throw หลังเขียน/ลบงวด = balance ไม่ recompute → แก้เป็น `loan?.status`) + 5 suite ตกอยู่ก่อน: payslip-frozen/payroll-recheck (`parseAllowances` ไม่นิยามใน harness), tax-buyvat/item-replace-rls (ข้อความ/ตรรกะ drift), **sales-receive (role กดบันทึกได้แต่ DB อาจปฏิเสธ — ต้องตรวจจริง)**.

**แก้ถาวรแล้ว (v845, 2026-09-17):** `npm test` = `node test-all.mjs` — รัน**ทุก** suite เสมอ พิมพ์ ✓/✗ รายตัว + สรุปท้าย ค่อย exit 1 (chain `&&` เดิมเก็บไว้ที่ `npm run test:chain-legacy`). เพิ่ม suite ใหม่ = เพิ่มใน `SUITES` ของ test-all.mjs (บาง suite ต้องใส่ path argument). **ข้อจำกัดข้อ 7 (แยกโค้ด):** ห้ามย้ายโซน HR/เอกสารออกจาก `api.js` โดยไม่แก้ test ที่ "ตัดโค้ดจาก api.js ด้วยข้อความ" (test-scoped-loads, test-invoice-guard, test-payslip-frozen, test-payroll-recheck, test-job-visits ฯลฯ อ่าน api.js ตรง) — ย้ายแล้วหมุดหาย test พังเป็นแถบ ต้องทำพร้อมกันและมี runtime ทดสอบ ไม่ใช่งานที่ทำ blind ได้

**5 suite ที่เคยตก — แก้ครบ v846 (2026-09-17) ไม่มี business logic เปลี่ยน:** payslip-frozen/payroll-recheck = harness eval `frozenPayslip` โดยไม่ตัด `parseAllowances/allowanceTotal/ALLOWANCE_KINDS` มาด้วย (เติม helpers ใน snippet) · tax-buyvat = test ล้าสมัย (ภาษีซื้อรวมบิลหน้างานแล้วตั้งแต่ v832) อัปเดต assertion ตามความจริงใหม่ คงเจตนา "จอต้องบอกตรงกับที่นับ" · item-replace-rls = **CRLF** บน Windows ทำหมุด `"...\n)"` หาไม่เจอ → normalize `\r\n` ก่อนหา (บทเรียน: test ที่ใช้หมุด `\n` ต้อง normalize เสมอ) · sales-receive = policy ใช้ `my_role()` ที่แม็ป field_sales→sales, assistant→tech (v831) test เทียบชื่อดิบเลยรายงานผิด → อ่านการแม็ปจาก migration จริงก่อนเทียบ. **ตอนนี้ `npm test` ต้อง 36/36 = ใช้เป็นด่านบังคับ (branch protection) ได้จริง**
