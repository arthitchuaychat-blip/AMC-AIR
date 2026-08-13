---
name: daily-automation-cron
description: "งาน automation รายวัน (/api/daily-cron): เตือนนัดลูกค้าล่วงหน้า 1 วัน (LINE) + สรุปเช้าทีมออฟฟิศ; ต้องตั้ง CRON_SECRET"
metadata:
  type: project
---

**Automation รายวัน `app/api/daily-cron.js` (v604+, 2026-08-12) — cron Vercel `0 1 * * *` (08:00 ไทย).** เจ้าของเลือกทำข้อ 2+3 ของแผน automation (ข้ามข้อ 1 ขอคะแนนอัตโนมัติ). ไฟล์เดียวทำ 2 งาน แต่ละส่วนห่อ try/catch แยก (ส่วนพังไม่ล้มอีกส่วน):

- **(2) เตือนนัดลูกค้าล่วงหน้า 1 วัน:** ดึง `job_orders`+`job_visits` ที่ `scheduled_at` = พรุ่งนี้ (ช่วงเวลาไทย, status not in cancelled/done) → จับกลุ่มตาม customer_id → หา line_user_id (`line_contact_customers` ก่อน, fallback `line_contacts.customer_id`) → `linePush()` ส่ง LINE + log ลง `line_messages`(sent_by=null="ส่งจากแอป") + patch `line_contacts`. ลูกค้าไม่ผูก LINE = ข้าม (นับ skippedNoLine).
- **(3) สรุปเช้าทีมออฟฟิศ:** นับ นัดวันนี้ (job_orders+job_visits) · แชตค้างตอบ (`line_contacts.unread>0`) · สต๊อกต่ำ (`materials` tracked+min_stock>0 join `material_stock.current_stock` < min_stock) → insert `notifications` (category "job") ให้ role admin/exec/hr + `pushUsers()` web push ฝั่งเซิร์ฟเวอร์ (อ่าน `push_subscriptions`, ใช้ web-push+VAPID — cron ไม่มี JWT จึง push เองไม่ผ่าน /api/push-send).

**กันสแปม/ยิงซ้ำ:** การส่งจริงต้องมี `Authorization: Bearer <CRON_SECRET>` (Vercel แนบให้อัตโนมัติเมื่อตั้ง env `CRON_SECRET`). ไม่มี env = ตอบ 503 (ไม่ส่ง). ทดสอบ preview ไม่ส่งจริง: `GET /api/daily-cron?dry=1` (ไม่ต้องมี secret).

**Env ต้องมี:** SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINE_CHANNEL_ACCESS_TOKEN (มีแล้ว), VAPID_* (มีแล้ว), **CRON_SECRET (ต้องเพิ่มใหม่)**.

Vercel Hobby จำกัด cron ≤2 ตัว/รันวันละครั้ง — ตอนนี้มี hr-cron (`15 2 * * *`) + daily-cron (`0 1 * * *`) = 2 พอดี. ถ้าจะเพิ่ม automation อีก **ต้องรวมเข้า daily-cron ไฟล์เดิม** ไม่สร้าง cron ตัวที่ 3. เพิ่มเติมที่เสนอไว้ยังไม่ทำ: ขอคะแนนอัตโนมัติเมื่อปิดงาน (ข้อ 1), เตือนหนี้ค้าง, ตามใบเสนอ, สต๊อกต่ำ→ร่าง PO, เตือน lead, เตือนบริการรอบถัดไปหาลูกค้า.
