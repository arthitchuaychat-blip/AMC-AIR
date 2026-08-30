---
name: job-handbook
description: "คู่มือตำแหน่งงาน (Handbook.jsx) — SOP/KPI ต่อ role ใน lib/handbook.js + ประกาศแก้ในแอป + อ่านแล้ว (mig 236)"
metadata:
  node_type: memory
  type: project
---

เมนู **คู่มือตำแหน่งงาน** (`Handbook.jsx`, module `handbook`, nav ในกลุ่ม ทีม&บุคคล). โครงคู่มือหลัก (วัตถุประสงค์/หน้าที่/SOP/กิจวัตร/กฎ/KPI/เมนูที่ใช้) **hardcode ใน `lib/handbook.js`** — `ROLE_GUIDE[role]` + `ROLE_GUIDE_MY` (พม่า) + `GUIDE_ORDER` + `DEPT_COLOR`/`DEPT_LABEL` + `COMPANY_TARGETS`. พนักงานเห็นเฉพาะ role ตัวเอง · admin/exec/hr (canBrowseAll) เลือกดูทุก role + พิมพ์ PDF (printHandbook → openPrintWindow).

**v717 fix (ความปลอดภัย):** role ที่ไม่มี `ROLE_GUIDE` เดิม fallback ไปคู่มือ `exec` (ข้อมูลตำแหน่งอื่นรั่ว) → แก้เป็น `g = ROLE_GUIDE[sel] || null` + โชว์ empty state "ยังไม่มีคู่มือ" (canBrowseAll ที่ไม่มี guide เริ่มที่ exec ได้; พนักงานทั่วไปคง role ตัวเอง).

**v723 (mig `236_handbook_notes_ack.sql`): ประกาศแก้ในแอป + อ่านแล้ว.**
- `handbook_notes` (id, role, title, body, sort, updated_at, updated_by): ประกาศ/อัปเดตต่อ role ที่ **admin/exec เพิ่ม/แก้/ลบในแอปได้** (ไม่ต้อง deploy) — แสดงเป็นการ์ด "📢 ประกาศ/อัปเดตล่าสุด" ใต้คู่มือ. RLS read using(true), write admin/exec.
- `handbook_ack` (user_id, role, acked_at, PK user_id+role): พนักงานกด "✓ อ่านแล้ว" ตำแหน่งตัวเอง (sel===myRole) · canBrowseAll เห็น "อ่านแล้ว X/Y คน" + ชิปรายคน (✓/○) เทียบ acks กับ listProfiles ที่ role===sel & active · admin/exec รีเซ็ต (resetHandbookAcks) ให้อ่านใหม่. RLS: self all + mgr delete.
- api: listHandbookNotes/saveHandbookNote/deleteHandbookNote/ackHandbook/listHandbookAcks/resetHandbookAcks (ทุกตัวมี fallback ถ้ายังไม่รัน 236).
- **ยังไม่ทำ (L):** ย้ายโครง SOP/KPI หลักเข้า DB + editor เต็ม (ตอนนี้เนื้อหลักยังต้องแก้ใน code + deploy) · แนบรูป/วิดีโอต่อ SOP step · quiz onboarding · full-text search.

เกี่ยวข้อง: [[hr-system]] · [[permissions-system]] (role = ตำแหน่ง).
