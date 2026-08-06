---
name: customer-rating
description: "คะแนนความพอใจลูกค้าหลังจบงาน — ลูกค้าให้ดาวจากลิงก์ใบส่งมอบงาน → เข้าสกอร์การ์ดทีม (mig 200/201)"
metadata:
  type: project
---

**คะแนนความพอใจลูกค้า (v575, 2026-08-06 — needs migrations `200_handover_rating.sql` + `201_kpi_scorecard_cust_rating.sql`).** ข้อ 3/3 แผนพัฒนา (ปิด loop: คะแนนไหลกลับเข้า [[kpi-scorecard]] ข้อ 1; ต่อยอด [[handover-system]]).

- **mig 200:** job_handovers เพิ่ม `cust_rating`(int 1-5 check) · `cust_comment` · `cust_rated_at`.
- **จุดให้คะแนน = ลิงก์ใบส่งมอบงานสาธารณะที่ส่งทาง LINE อยู่แล้ว** (`?ho=<id>&t=<token>` → PublicHandover.jsx → handover-view.js token HMAC). `PublicHandover` เพิ่ม `<RatingCard>` ใต้ชีต **เฉพาะ status='submitted'** — ดาว 1-5 + ความเห็น → POST `/api/handover-rate`. ถ้าให้แล้ว (cust_rating มาจาก handover-view select=*) โชว์ "ขอบคุณ" + ดาว.
- **app/api/handover-rate.js (ใหม่):** POST {id,t,rating,comment} · verify token ด้วย `shareToken` ที่ require มาจาก `./handover-view` (ตัวเดียวกัน) · PATCH job_handovers ด้วย service role (ลูกค้าไม่ต้องล็อกอิน). ต้อง env SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ HANDOVER_SHARE_SECRET ถ้าตั้งแยก) — มีอยู่แล้วจาก handover-view/send.
- **mig 201:** อัปเกรด `kpi_scorecard` RPC (mig 198) — teams เพิ่ม `cust_rating_avg`+`cust_rating_n` (avg cust_rating ผ่าน handover→job→assigned_team, ช่วงเวลา = วันของงาน). KpiScorecard.jsx คอลัมน์ "คะแนนลูกค้า" = cust_rating_avg (มี n รีวิว) fallback ไป rating_avg (รีวิวช่างซัพเดิม) ถ้ายังไม่มีคะแนนลูกค้า.
- **⚠️ กับดัก HANDOVER_COLS:** listHandovers/getHandover ใช้คอลัมน์ตายตัว (ไม่ใช่ select *) — ถ้าใส่ cust_rating ตรง ๆ ก่อนรัน mig 200 = หน้าใบส่งมอบพังทั้งหน้า. แก้โดยแยก `HANDOVER_COLS_BASE` (เดิม) + `HANDOVER_COLS` (+rating) แล้ว try/catch fallback ด้วย `_preRate(e)`. saveHandover returning select ใช้ BASE (rating ไม่จำเป็นตอนบันทึก). Handover.jsx list โชว์ badge ★ + ความเห็นเมื่อ cust_rating>0.
- **ลำดับ deploy:** push โค้ดก่อน (fallback กันพัง) → รัน mig 200 แล้ว 201.
