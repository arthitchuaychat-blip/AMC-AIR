---
name: email-inbox
description: "กล่องอีเมลในแอป (info@amcair.net ผ่าน Gmail API OAuth) — Email.jsx, api/email-*, mig 211/212; ต้องมี GMAIL_* env"
metadata:
  type: project
---

**กล่องอีเมลในแอป = mirror Gmail ของ info@amcair.net (v608–v609, 2026-08-12).** เจ้าของทำ Google Workspace อีเมลบริษัท `info@amcair.net` (1 license, DNS/MX ที่ Vercel) แล้วต่อเข้าแอปให้ทีมหลังบ้านอ่าน/ตอบ/มอบหมายเหมือนแชต LINE. เฟส 2 = ต่อ Gmail API.

**Auth = OAuth refresh token (ไม่ใช่ service account).** Google บล็อกโหลด service-account key ด้วย org policy `iam.managed.disableServiceAccountKeyCreation` (Secure by Default) → เลี่ยงไปใช้ OAuth. ตั้งใน Google Cloud (โปรเจกต์ "My First Project" splendid-world-505612-f7, ล็อกอิน info@): เปิด Gmail API + OAuth consent = **Internal** + OAuth Client (Web app) redirect `https://app.amcair.net/api/gmail-callback`. refresh token เก็บใน **secure_config** (mig 211, RLS เปิด/ไม่มี policy = เฉพาะ service role).

**Env (Vercel):** `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_ADDRESS=info@amcair.net`. เชื่อมบัญชีครั้งเดียว: เปิด `/api/gmail-connect` (ล็อกอิน info@) → gmail-callback แลก code→refresh token ตรวจ email=GMAIL_ADDRESS แล้วเก็บ.

**ไฟล์:**
- `app/api/_gmail.js` — gmailAccessToken (refresh→access), gmail() fetch, parseMessage (แกะ from/to/subject/body_text จาก payload, direction=out ถ้า from=self). raw fetch ล้วน ไม่มี lib.
- `app/api/email-sync.js` — POST (ตรวจ JWT office) ดึงเมล 30 วัน (`newer_than:30d -in:spam -in:trash`) เฉพาะ id ที่ยังไม่มี → upsert email_messages + สรุป email_threads (คง assigned_to/customer_id/last_read_at, unread = last_inbound_at > last_read_at).
- `app/api/email-send.js` — POST ส่งตอบในนาม `AMC AIR <info@>` ต่อเธรด (In-Reply-To จาก message_id_header เมลเข้าล่าสุด) + log DB ทันที.
- `app/src/lib/api.js` — listEmailThreads/listEmailMessages/syncEmails/sendEmail/markEmailRead/setEmailOwner/linkEmailCustomer.
- `app/src/components/Email.jsx` — หน้ากล่องเมล (module 'email', group crm ข้างแชต): รายการเธรด + กรองผู้รับผิดชอบ/ยังไม่อ่าน/ค้นหา + อ่าน (mark read) + ตอบ (Ctrl+Enter) + มอบหมาย. sync ตอนเปิดหน้า + ปุ่มรีเฟรช (ไม่มี realtime/cron — pull-on-open).
- **mig 212:** email_threads + email_messages, RLS office roles (admin/exec/finance/hr/sales/field_sales/graphic) อ่าน/อัปเดต.
- **permissions:** module `email` (E = admin/exec/finance/hr/sales/field_sales, ตามชุด chat:E).

**ยังไม่ทำ/ต่อยอด:** แนบไฟล์ในเมล · ผูกลูกค้า (linkEmailCustomer มีแล้วแต่ยังไม่มี UI picker) · เตือนเมลใหม่ (ตอนนี้ต้องเปิดหน้า/รีเฟรช) · DKIM กันตกขยะ (ตั้งใน Admin ทีหลัง). Vercel Hobby cron เต็ม 2 ตัวแล้ว — ถ้าจะ auto-sync ต้องรวม daily-cron หรือใช้ pull-on-open ต่อไป.
