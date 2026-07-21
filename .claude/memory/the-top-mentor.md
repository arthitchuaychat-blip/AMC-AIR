---
name: the-top-mentor
description: "แอปติดตาม Mentoring 8 สัปดาห์ + Happiness Survey ของ Chapter The Top (BNI-style) — single-file, the-top-mentor/index.html"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4a9c11e5-0286-4087-9881-1aa5b5b8a037
  modified: 2026-07-21T01:52:50.329Z
---

The Top Mentor — แอปใหม่ (เริ่ม 5 ก.ค. 2026, ขึ้นคลาวด์วันเดียวกัน) **ลิงก์จริง: https://amc-air.vercel.app/mentor/** deploy ผ่าน `app/public/mentor/index.html` (สำเนาของ `the-top-mentor/index.html` — แก้ต้องคัดลอกให้ตรงกันทั้ง 2 ไฟล์แล้ว push) single-file vanilla JS, seed 75 คนจากไฟล์ Desktop "The Top Mentor  - Report.csv"

- **ข้อมูลบน Supabase โปรเจกต์เดียวกับ วัสดุOS**: ตาราง `tm_members` (id + data jsonb) และ `tm_config` (key='main') — mig 108 รันแล้ว, RLS เปิด anon อ่าน/เขียนเต็ม (สมาชิก chapter ไม่มี login), sync แบบ dirty-outbox + localStorage cache (key `topmentor_v1`, `tm_dirty`), ดึงซ้ำตอน focus/ทุก 90 วิ
- app/vercel.json: SPA rewrite ยกเว้น `/mentor` + no-cache header `/mentor/(.*)` + cron `/api/mentor-cron` 02:00 UTC (09:00 ไทย)
- **LINE OA (Chapter — แยกจาก OA บริษัท)**: `api/mentor-line.js` webhook ผูกบัญชี (สมาชิกพิมพ์ชื่อเล่น/ชื่อเต็ม → เซ็ต data.lineUserId), `api/mentor-cron.js` ส่ง survey อัตโนมัติเมื่อถึงกำหนด (+mark sent, `?dry=1` ทดสอบ) — ใช้ env `MENTOR_LINE_ACCESS_TOKEN` + `MENTOR_LINE_CHANNEL_SECRET` (คนละชุดกับ LINE_CHANNEL_* ของแชทบริษัท) **สถานะ: โค้ด deploy แล้ว รอ user ใส่ env จาก LINE Developers + ตั้ง webhook URL https://amc-air.vercel.app/api/mentor-line**
- Vercel อัพเป็น Pro แล้ว (5 ก.ค. 2026) — เลิกติด deploy rate limit; user เคยโดน limit ตอนแผนฟรี
- **LINE เชื่อมครบแล้ว (6 ก.ค. 2026)**: OA "The Top Mentoring" (@898pzmzb, provider "mike" ใน LINE Developers, แผนฟรี) — env MENTOR_LINE_* ใส่ใน Vercel แล้ว (token/secret = true), webhook ตั้งแล้ว (ไมค์/Arthit เชื่อมทดสอบสำเร็จ), ลิงก์แบบสอบถาม 3 ชุดอยู่ใน tm_config แล้ว
- **หน้าเมนูสมาชิก LIFF**: `me.html` (mentor/me.html) — สมาชิกดู/อัพสไลด์/แก้ข้อมูลตัวเอง, ระบุตัวตนด้วย liff.getProfile() userId → match data.lineUserId (userId ใช้ร่วมทั้ง provider "mike" จึงตรงกับ webhook). **LIFF ID = `2010620970-MWe2PeNX`** อยู่ในช่อง LIFF Login channel แยก (Messaging API เพิ่ม LIFF ไม่ได้แล้ว), เก็บ liffId ใน tm_config
- **Rich Menu**: `api/mentor-richmenu.js` สร้างเมนูอัตโนมัติผ่าน LINE API (?go=1 สร้าง, ?clear=1 ลบ, ไม่มี query=ดูสถานะ) ปุ่ม "📋 ข้อมูลของฉัน" เปิด LIFF, รูปพื้นหลัง `mentor/richmenu.png` (2500x843 gen จาก .NET System.Drawing) — ตั้งเป็น default แล้ว. **หมายเหตุ: LINE เก็บรูปตอนสร้าง ถ้าเปลี่ยน richmenu.png ต้อง deploy แล้วยิง ?go=1 ใหม่**
- **Member Traffic Light (8 ก.ค. 2026)**: รายงาน BNI รายเดือน (ไฟล์ Desktop "Member Traffic Light-BNI The Top-<Month>-<YY>.xlsx", sheet เดียว, หัวคอลัมน์แถว 2: No/Chapter/Name/P/A/L/M/S/RGI/RGO/RRI/RRO/V/121/bizGiven(col14)/...Total Score(col31)/Traffic Light G-Y-R(col32)/bizReceived(col33)). เก็บใน `m.traffic={month,color,score,attend{P,A,L,M,S},refGiven,refReceived,visitors,oneToOne,bizGiven,bizReceived,updatedAt}`. **อัปเดตเองทุกเดือน**: หน้าสมาชิก(แอดมิน) ปุ่ม "🚦 อัปโหลด Traffic Light" → importTrafficXlsx() ใช้ SheetJS (CDN cdnjs xlsx 0.18.5) parse+จับคู่ชื่อ fuzzy → saveAll. แสดง: การ์ด "ผลงานของฉัน" ใน me.html + section ในโมดัลแอดมิน + จุดสีในตาราง + ตัวกรอง mfil.traffic. สคริปต์นำเข้าครั้งแรก scratchpad/import-traffic.mjs (มิ.ย. 2026 จับคู่ครบ 74 คน: เขียว 43/เหลือง 30/แดง 5)
- **ธีมดีไซน์ me.html + rich menu = "ออโรร่า" (Aurora)** (user เลือกจาก 3 แบบ ผ่าน artifact 6 ก.ค. 2026): กระจกฝ้า glassmorphism พื้นกรมท่า #0b1030 + glow ม่วง #8b5cf6/ฟ้า #22d3ee/ชมพู #ec4899, accent gradient ม่วง→ฟ้า. (แอปแอดมิน index.html ยังเป็นธีมกรมท่า-ทองเดิม ไม่ได้เปลี่ยน)
- **แบบสอบถามในแอป + นำเข้าผล (6 ก.ค. 2026)**: (1) นำเข้าผล 3 CSV จาก Desktop "Happiness Survey - The Top - ตอบ3/6/12เดือน.csv" ด้วย scratchpad/import-surveys.mjs (จับคู่ชื่อ fuzzy → เซ็ต hs[round].done + happiness(1-10) + renew + answers{feel,improve,happy}; ไม่เจอ=done:false) จับคู่ m3=29/m6=13/m12=40. (2) รายงานประธานมีการ์ด "🚩 สมาชิกน่ากังวล" (memberRisk: happiness≤5 หรือ renew='ไม่ต่อ'=เร่งด่วน / ≤6 หรือ 'ยังไม่แน่ใจ'=เฝ้าระวัง). (3) แบบสอบถามตอบในแอป: SURVEYS m3/m6/m12 ใน me.html (scale+radio+text) → hs[round]{done,happiness,renew,answers,source:'line-form'}; เปิดจาก `liff.line.me/<id>?survey=mX` (config link3/6/12 ชี้มาที่นี่แล้ว แทน Google Form)
- **ระบบล็อกอิน + สิทธิ์ (6 ก.ค. 2026, mig 110)**: ตาราง `tm_users` (username pk, data jsonb {role,name,mentorName,hash}) RLS ปิด anon เข้าถึงผ่าน `api/mentor-auth.js` (service role) เท่านั้น — actions: status/bootstrapAdmin/login/listUsers/saveUser/deleteUser. รหัสผ่าน hash = sha256('tmv1:'+pass), token = base64(user|role)+'.'+hmac(payload, SERVICE_ROLE_KEY). **admin** เห็น/แก้ทุกอย่าง+แท็บ "ผู้ใช้/Mentor" เพิ่ม/ลบบัญชี. **mentor** login แล้ว `scopedMembers()` กรองเฉพาะ members.mentor === AUTH.mentorName, เห็น 3 แท็บ (dash/mentee/survey), ซ่อนปุ่มเพิ่ม-ลบ-ต่ออายุ-settings. AUTH เก็บใน localStorage `tm_auth`. ครั้งแรก (ไม่มี admin) แอปโชว์หน้า bootstrap สร้างแอดมิน. **สถานะ: user ยังไม่ได้สร้างบัญชีแอดมินจริง (ล้าง test แล้ว hasAdmin=false)**
- **ไฟล์สไลด์** (mig 109): Storage bucket `tm_slides` (public, anon เขียน/ลบได้) path `<member_id>/<slide>_<ts>.<ext>`; member.slideFiles={onepage/s121/s5min:{url,name,path}}; สถานะ "มีแล้ว" = hasSlide() (มีไฟล์ หรือ slides[k]===true จากแอดมินกด)
- รัน SQL migration เองได้ผ่าน Chrome → Supabase SQL editor (monaco.editor.getModels()[0].setValue แล้วคลิก Run — มี dialog ยืนยันถ้ามี drop/destructive)

- โครงข้อมูล: member = {id, name, nick, prof, status(ปีแรก/เกิน 1 ปี), start(ISO), mentor, weeks[9] tri-state (Week 0–8), slides{onepage,s121,s5min}, hs{m3,m6,m12:{sent,done,note}}, note}
- กำหนด survey: 3 เดือน = start+90 วัน, 6 เดือน = +180 วัน, 12 เดือน = วันครบรอบปีถัดไป โดยเริ่มส่งได้ 6 เดือนก่อนต่ออายุ (ตรงกับสูตรในชีตเดิม, ปี ค.ศ.)
- LINE: ตอนนี้เป็นปุ่มคัดลอกข้อความ (template + ลิงก์ฟอร์มตั้งได้ในหน้าตั้งค่า) — **เฟส 2 ค้างอยู่**: ส่งอัตโนมัติผ่าน LINE OA Messaging API + Vercel cron + Supabase และ user จะอัพโหลดแบบสอบถาม 3 ชุดมาให้ทีหลัง
- นำเข้า CSV โครงเดิมซ้ำได้ในหน้าตั้งค่า (แทนที่ทั้งหมด), สำรอง/กู้คืน JSON ได้
- พรีวิวผ่าน launch config "static" (_design/serve.ps1 เสิร์ฟทั้ง repo ที่ :8123) → /the-top-mentor/

**เกร็ด:** สคริปต์ .ps1 ที่มีตัวอักษรไทยต้องบันทึกเป็น UTF-8 **มี BOM** ไม่งั้น PowerShell 5.1 อ่านเป็น ANSI แล้วไทยเพี้ยน (เจอตอนแปลง CSV→JSON)
