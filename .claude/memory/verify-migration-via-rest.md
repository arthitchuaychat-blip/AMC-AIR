---
name: verify-migration-via-rest
description: วิธีเช็กว่าเจ้าของรัน migration แล้วจริง (ตาราง/คอลัมน์มีไหม) โดยไม่ต้องเข้า dashboard — ใช้ REST + anon key (สาธารณะ) อ่านอย่างเดียว
metadata:
  type: reference
---

**เช็ก schema ผ่าน PostgREST ด้วย anon key (public, อยู่ใน app/src/lib/supabase.js) — ปลอดภัย อ่านอย่างเดียว, RLS ทำให้ได้ 0 แถวแต่ HTTP code บอกได้ว่า "มี/ไม่มี":**
`curl -s -o /dev/null -w "%{http_code}" "$URL/rest/v1/<table>?select=<col>&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"`
- **200** = ตาราง+คอลัมน์มี · **404/PGRST205** = ตารางไม่มี · **400 "column ... does not exist"** = คอลัมน์ไม่มี
- ใช้หลังเจ้าของบอก "รันแล้ว" เพื่อยืนยันครบทุกไฟล์ (เคย: 2026-09-17 ตรวจ 7 จุดครบใน 1 คำสั่ง) · ห้าม echo key ในแชต
- ตรวจ RPC: เรียก `rpc/<fn>` ด้วย POST body `{}` → 404 = ยังไม่มีฟังก์ชัน (จะได้ 401/400 ถ้ามีแต่สิทธิ์/พารามิเตอร์ไม่ตรง)
