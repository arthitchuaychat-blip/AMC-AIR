---
name: kpi-scorecard
description: "สกอร์การ์ดผลงาน (KPI) — วัด KPI จริงต่อคน/ต่อทีมจากข้อมูลในระบบ (mig 198)"
metadata:
  type: project
---

**สกอร์การ์ดผลงาน (v573, 2026-08-06 — needs migration `198_kpi_scorecard.sql`).** ข้อ 1/3 จากแผนพัฒนา (รีวิวทั้งธุรกิจ 6 ส.ค.: หลังบ้านแข็งแรง → ก้าวต่อคือ "วัด+โต"; [[subcontractor-system]] ให้เมนู, [[permissions-system]] ให้ระบบสิทธิ์). เปลี่ยน KPI ในคู่มือ ([[app-performance]]? ไม่ — lib/handbook.js `{m,t,f,src,w}` เป็นเป้าที่เขียนไว้เฉย ๆ) ให้ **วัดจริงอัตโนมัติ**.

- **module ใหม่ `kpi`** ("สกอร์การ์ดผลงาน" 🏆) อยู่ในกลุ่มนำ "ภาพรวม" คู่ dashboard · permissions DEFAULT_PERMS = **V เฉพาะ exec/admin/finance/hr** (role อื่นไม่มีคีย์ = N อัตโนมัติผ่าน levelOf fallback). `KpiScorecard.jsx` อ่านอย่างเดียว.
- **RPC `kpi_scorecard(p_from date, p_to date)`** security definer, gate `my_role() in (admin,exec,hr,finance)` (ไม่ใช่ → คืนว่าง). คืน `{sales:[...], teams:[...]}`:
  - **sales ต่อคน** (ผูกด้วย `created_by`): `quotes`=ใบเสนอที่ออก (status≠cancelled), `won`=status='approved', `close_rate`=won/quotes%, `revenue`=Σ receipts.net (status≠cancelled) — ทั้งคู่กรองด้วย `issue_date between from and to`.
  - **teams ต่อทีม** (ผูกด้วย `assigned_team`): `jobs_done`=job_orders status='done', `claims`=is_claim, `claim_rate`%, `rating_avg`=avg(rating>0) — ช่วงเวลาใช้ `coalesce(issue_date, scheduled_at::date, created_at::date)`.
- api.js `listKpiScorecard(from,to)` (graceful `{sales:[],teams:[]}` ถ้ายังไม่รัน 198). UI: เลือกเดือน (`<input type=month>`) → monthRange → 4 tiles สรุป + 2 ตาราง. RAG ป้ายสี job-badge b-green/amber/red เทียบเป้า (ยอดขาย ≥2.0/1.0 ลบ. · ปิด ≥30/20% · เคลม ≤3/7% invert · คะแนน ≥4.5/4). CSS `.kpi-tiles/.kpi-tile/.kpi-table`.
- **ข้อจำกัด v1 / ต่อยอด:** ยอดขายผูก created_by ของเอกสาร (ไม่ใช่ "เจ้าของลูกค้า") · rating ส่วนใหญ่มาจากรีวิวช่างซัพ (ทีมประจำมักว่าง → จะเต็มขึ้นเมื่อทำข้อ 3 คะแนนความพอใจลูกค้า) · เวลาตอบแชต/lead→เสนอ ยังไม่ได้วัด (รอข้อ 2 lead pipeline). **แผน 3 ข้อ: (1) KPI ✅ · (2) lead source+ท่อขาย · (3) คะแนนความพอใจลูกค้า** — ข้อ 3 จะป้อนคะแนนกลับเข้าสกอร์การ์ดทีม.
