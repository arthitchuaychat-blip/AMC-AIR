# คู่มือสำรองและกู้คืนข้อมูล AMC AIR (Backup & Restore Runbook)

> เป้าหมาย (แผน stability สัปดาห์แรก ข้อ 4): **รู้ว่าข้อมูลอยู่ที่ไหน · สำรองนอกเครื่องสม่ำเสมอ · เคยซ้อมกู้แล้วจริง**
> "มี backup" ไม่พอ — ต้องเคย **กู้กลับมาใช้งานได้** อย่างน้อยไตรมาสละครั้ง

## 1. ข้อมูลของเราอยู่ที่ไหนบ้าง (ต้องสำรองครบ 4 ส่วน)

| ส่วน | อยู่ที่ | มีอะไร | ถ้าหาย |
|---|---|---|---|
| **ฐานข้อมูล (Postgres)** | Supabase project `tpyrlxhoyghawqvsphfj` | ลูกค้า เอกสารทุกใบ สต๊อก เงินเดือน กระแสเงินสด — **ทุกอย่าง** | ธุรกิจหยุด |
| **ไฟล์แนบ (Storage)** | Supabase Storage buckets | รูปหน้างาน ใบเสร็จแนบ ลายเซ็น สลิป | หลักฐานหาย |
| **โค้ด** | GitHub `arthitchuaychat-blip/AMC-AIR` | แอปทั้งหมด + migrations | สร้างใหม่ได้จาก GitHub |
| **ค่าตั้งค่าลับ** | Vercel → Project → Settings → Environment Variables | key ของ LINE/AI/บริการต่าง ๆ | ต้องขอใหม่จากผู้ให้บริการ |

⚠️ **ห้ามเก็บสำรองไว้บนไดรฟ์ C: ของคอมทำงาน** (เต็มบ่อย + ถ้าเครื่องพังหายพร้อมกัน) → ใช้ **D:\backups** + **คลาวด์ (Google Drive/OneDrive)** อีก 1 ที่เสมอ

## 2. ตั้งสำรองอัตโนมัติ (ทำครั้งเดียว)

1. เปิด Supabase Dashboard → project → **Settings → Billing** ดูว่าแผนอะไร
   - **Pro ขึ้นไป:** มี **Daily backups** ให้อัตโนมัติ (เก็บ 7 วัน) → ไปที่ **Database → Backups** ตรวจว่ามีรายการทุกวัน · ถ้ามีงบ เปิด **Point-in-Time Recovery (PITR)** = ย้อนเวลาได้ถึงระดับนาที (คุ้มมากสำหรับข้อมูลเงิน)
   - **Free:** ❌ **ไม่มีสำรองอัตโนมัติเลย** → ต้องทำข้อ 3 ด้วยมือ **ทุกสัปดาห์** หรืออัปเกรดเป็น Pro (~$25/เดือน) — สำหรับระบบที่ถือข้อมูลเงินทั้งบริษัท แนะนำอัปเกรด
2. เปิด **Database → Backups** จดไว้ในตารางข้อ 6 ว่าตั้งค่าเมื่อไหร่

## 3. สำรองด้วยมือ (Free: ทุกสัปดาห์ · Pro: ทุกเดือนเป็นสำเนานอกระบบ)

### 3.1 ฐานข้อมูล
**วิธี A — จาก Dashboard:** ❌ **ใช้ไม่ได้กับ project นี้** — ตรวจแล้ว 18 ก.ย. 2026 สำรองรายวันของ Supabase เป็นชนิด **PHYSICAL** (Database → Backups → Scheduled backups) มีแต่ปุ่ม **Restore** (= กู้ทับระบบจริง ⚠️ ห้ามกดเล่น) **ไม่มีปุ่ม Download** จึงเอาไฟล์ออกมาเก็บนอกระบบเองไม่ได้ → สำเนานอกระบบต้องใช้ **วิธี B** เท่านั้น · ส่วนการซ้อมกู้ใช้แท็บ **Restore to new project** (ข้อ 4)

**วิธี B — ด้วยคำสั่ง (ทุกแผน):** ต้องมี Supabase CLI (ติดตั้งครั้งเดียว: `npm i -g supabase`)
1. Dashboard → **Settings → Database → Connection string** → เลือก **URI** → กด copy (⚠️ ในนั้นมี**รหัสผ่านฐานข้อมูล** = ความลับ **ห้ามวางในแชต/ห้าม commit**)
2. ใน PowerShell:
   ```
   $env:DB_URL = "<วาง connection string ที่ copy มา>"
   supabase db dump --db-url $env:DB_URL -f D:\backups\db\amc-$(Get-Date -Format yyyy-MM-dd).sql
   ```
3. เช็กว่าไฟล์มีขนาดสมเหตุสมผล (หลาย MB ไม่ใช่ 0 KB) แล้วอัปโหลดคลาวด์

### 3.2 ไฟล์แนบ (Storage) — ⚠️ Supabase ไม่สำรองส่วนนี้ให้เลย สำเนาของเราคือสำเนาเดียว
**ที่เก็บ:** Google Drive บัญชี arthitchuaychat@gmail.com (5 TB) → `K:\My Drive\amc-backups\storage\photos\…` ผ่าน Google Drive for desktop โหมด **Stream** (ไฟล์อยู่บนคลาวด์ ในเครื่องเห็นเป็นไดรฟ์ K: กินที่แค่แคช ตั้งแคชไว้ D:) · **ห้าม**ตั้ง Drive แบบ Mirror/ซิงก์ทั้งเครื่อง (เคยทำ C: เต็ม) · ห้ามลบไฟล์ใน K: เพื่อเคลียร์ที่ (= ลบบนคลาวด์)

**ครั้งแรก 18 ก.ย. 2026:** ดึงทั้ง bucket `photos` 22,513 ไฟล์ / 26 GB ใช้เวลา ~2 ชม. 20 นาที (Supabase CLI 2.117 ผ่าน `npx supabase storage cp -r ss:///photos/ ./` — dst ต้องเป็นพาธ relative, ตัวอักษรไดรฟ์ถูกอ่านเป็น URL) แล้ว robocopy /MOVE เข้า K: · bucket อื่น (`hr-documents` `sales-wht-evidence` `AMC pic.` `tm_slides`) **ว่าง** ณ วันนั้น
โครงสร้างใน photos: `materials` รูปสินค้า (10.5k ไฟล์ 5 GB) · `docs` เอกสาร/PDF แนบใบงาน (14 GB) · `line`/`chat` รูปจากแชต · `attendance` รูปลงเวลา · `expenses` บิลเบิกจ่าย · `signatures` ลายเซ็น · `tasks` รูปหน้างาน · `web-*` รูปเว็บไซต์ — **ที่หายแล้วหาใหม่ไม่ได้** = expenses, signatures, tasks, docs (หลักฐานบัญชี/ภาษี)

**ทุกเดือน (วันที่ 1) — ดึงเฉพาะไฟล์ใหม่ ไม่โหลดซ้ำ:** ดับเบิลคลิก **`scripts\backup-storage.cmd`** ใน repo (หรือบอก Claude ให้รัน) → สคริปต์ `scripts/backup-storage.mjs` ถามฐานข้อมูล (`storage.objects`) ว่ามีไฟล์อะไร → เทียบกับ K: → ดึงเฉพาะที่ขาด → พิมพ์ "✓ ครบ" + พื้นที่ว่าง (เตือนถ้า < 20 GB) → log ที่ `K:\My Drive\amc-backups\storage\_logs\` · ใช้ token จาก `npx supabase login` (ทำครั้งเดียว ไม่มี key ในไฟล์) · `supabase link` ทำไว้ที่ `D:\backups` (มี `supabase/.temp`) — ถ้าย้ายเครื่อง: login ใหม่ + `npx supabase link --project-ref tpyrlxhoyghawqvsphfj` ใน D:\backups
- ไฟล์ที่ถูกลบบน Supabase สคริปต์**ไม่ลบ**ในสำเนา (เก็บประวัติ) แค่รายงานจำนวน
- ถ้ามี bucket ใหม่ที่มีไฟล์ สคริปต์เตือนให้แก้ค่า `BUCKET`
- **เมื่อที่เต็ม:** โหมด Stream ไม่กินที่ในเครื่อง · ถ้า Google Drive ใกล้เต็ม (5 TB) ค่อยคิด · ถ้า D: (แคช) ต่ำกว่า 20 GB → Drive Preferences → Local cached files → ล้างแคช หรือย้ายไปไดรฟ์อื่น

### 3.3 ค่าตั้งค่าลับ (Vercel env)
Vercel → Project → Settings → Environment Variables — **จดเฉพาะชื่อ** (ค่าไม่ต้องจด ขอใหม่จากผู้ให้บริการได้ทุกตัว) · ในไฟล์นี้มีแต่ชื่อ ไม่มีค่า ⚠️ ห้ามใส่ค่าลงมาเด็ดขาด

**Project `amc-air` (แอป ERP) — 24 ตัว ตรวจ 18 ก.ย. 2026:**

| กลุ่ม | ตัวแปร | ขอใหม่ได้จาก |
|---|---|---|
| Supabase (ย้าย project ต้องเปลี่ยนทั้งชุด) | `SUPABASE_URL` `SUPABASE_SERVICE_ROLE_KEY` `VITE_SUPABASE_URL` `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| LINE (แชต + บอท) | `LINE_CHANNEL_SECRET` `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers Console → channel AMC AIR |
| LINE (The Top Mentor — ค้างจากตอนยังอยู่ repo นี้) | `MENTOR_LINE_CHANNEL_SECRET` `MENTOR_LINE_ACCESS_TOKEN` | ย้ายไป project the-top-mentor แล้ว → ลบออกจาก amc-air ได้ |
| AI บอท | `ANTHROPIC_API_KEY` | console.anthropic.com → API keys |
| FlowAccount (เลิกใช้ 1 ม.ค. 2027) | `FLOWACCOUNT_CLIENT_ID` `FLOWACCOUNT_CLIENT_SECRET` `FLOWACCOUNT_ENV` | FlowAccount → ตั้งค่า API |
| Facebook Page (Messenger) | `FB_APP_SECRET` `FB_PAGE_ID` `FB_PAGE_ACCESS_TOKEN` `FB_VERIFY_TOKEN` | Meta for Developers → แอป AMC · VERIFY_TOKEN ตั้งเอง |
| Gmail (ส่งอีเมลจากแอป) | `GMAIL_OAUTH_CLIENT_ID` `GMAIL_OAUTH_CLIENT_SECRET` `GMAIL_ADDRESS` | Google Cloud Console → OAuth credentials |
| แจ้งเตือน push ในเบราว์เซอร์ | `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT` | สร้างคู่ใหม่ได้เอง (`npx web-push generate-vapid-keys`) — ผู้ใช้ต้องกดอนุญาตแจ้งเตือนใหม่ |
| ภายในแอป | `CRON_SECRET` `CALENDAR_FEED_TOKEN` | สุ่มใหม่ได้เอง (ลิงก์ปฏิทินเดิมจะใช้ไม่ได้ ต้องแจกใหม่) |

**Project `amc-air-497i` (เว็บ www.amcair.net):** ตรวจ 18 ก.ย. 2026 — **ไม่มี env เลย** (Supabase URL/anon key เป็นค่าสาธารณะฝังในโค้ด) → ไม่มีอะไรต้องกู้

## 4. ซ้อมกู้คืน (ไตรมาสละครั้ง — สำคัญที่สุด)

การซ้อม = พิสูจน์ว่าสำรอง**ใช้กู้ได้จริง** โดยไม่แตะระบบจริงเลย — **วิธีที่ใช้จริงและผ่านแล้ว (18 ก.ย. 2026, ~10 นาที):**
1. project จริง → **Database → Backups → แท็บ "Restore to new project"** (BETA) — ⚠️ **ไม่ใช่**ปุ่ม Restore ในแท็บ Scheduled backups (อันนั้นกู้ทับระบบจริง)
2. แถวสำรองล่าสุด → **Restore** → Continue → ตั้ง **New Project Name = `amc-restore-test`** (ลบอีเมลที่ระบบใส่มาให้ออก) · รหัสผ่านฐานข้อมูลระบบสุ่มให้ (ไม่ต้องใช้ในการซ้อม) → **Restore to new project** · ค่าใช้จ่าย ~$14.83/เดือน คิดรายชั่วโมง เปิดไม่กี่ชั่วโมงแล้วลบ = ไม่กี่บาท
3. ระหว่างรอ (5–15 นาที) เปิด **SQL Editor ของ project จริง** รันนับตัวเลขต้นฉบับ (ตัดที่เวลาสำรอง = 21:05 UTC ของวันก่อน):
   ```sql
   select
     (select count(*) from customers  where created_at < '<วันสำรอง> 21:05:00+00') as customers,
     (select count(*) from quotations where created_at < '<วันสำรอง> 21:05:00+00') as quotations,
     (select count(*) from invoices   where created_at < '<วันสำรอง> 21:05:00+00') as invoices,
     (select count(*) from receipts   where created_at < '<วันสำรอง> 21:05:00+00') as receipts,
     (select max(receipt_no) from receipts where created_at < '<วันสำรอง> 21:05:00+00') as last_receipt;
   ```
4. project ใหม่พร้อม (ป้าย COMPLETED / Go to new project) → **เช็กชื่อมุมบนซ้าย = amc-restore-test** → SQL Editor → รัน SQL **ชุดเดียวกัน** → ทั้ง 5 ช่อง**ต้องเท่ากันเป๊ะ**
5. (ถ้าอยากซ้อมเต็ม) Vercel → สร้าง preview ที่ชี้ env ไป project ทดสอบ → ล็อกอินเปิดแดชบอร์ด/ใบเสนอราคา/ใบเสร็จ 1 ใบ
6. **ลบ project ทดสอบทิ้ง** (ใน amc-restore-test → Project Settings → General → Delete project → พิมพ์ชื่อยืนยัน) เพื่อเลิกจ่าย compute และไม่ให้มีสำเนาข้อมูลลูกค้าค้างอยู่
7. จดผลในตารางข้อ 6 (วันที่ซ้อม · ใช้เวลากี่นาที · ปัญหาที่เจอ)

สิ่งที่ Restore to new project **ไม่**ย้ายมา (หน้าจอบอกเอง): ไฟล์แนบ Storage, Edge Functions, ค่า Auth/API keys, extensions — ถ้าเกิดเหตุจริงแล้วต้องย้ายแอปไปชี้ project ใหม่ ต้องตั้ง Auth/keys ใน Vercel ใหม่ และไฟล์แนบต้องมีสำเนาจากข้อ 3.2

## 5. เมื่อเกิดเหตุจริง (ข้อมูลหาย/ผิดพลาดวงกว้าง)

1. **หยุดเขียน**: แจ้งทุกคนหยุดใช้แอปชั่วคราว · จดเวลาที่เกิดเหตุ (นาที)
2. **อย่าแก้/ลบเพิ่ม** — ยิ่งแก้ ยิ่งกู้ยาก
3. ถ้ามี **PITR** → Database → Backups → Point in time → เลือกเวลา "ก่อนเกิดเหตุ 5 นาที" → Restore (Supabase ทำให้ทั้งหมด)
4. ถ้ามีแค่ **daily backup** → ใช้แท็บ **Restore to new project** กู้เข้า project ใหม่ก่อน (ข้อ 4) ตรวจตัวเลขให้แน่ใจ → แล้วค่อยชี้ Vercel env (SUPABASE URL/keys) ไป project ใหม่ · หรือถ้ามั่นใจว่าต้องย้อนทั้งระบบจริง ๆ ค่อยกด Restore ในแท็บ Scheduled backups (ทับของจริง ย้อนกลับไม่ได้)
5. ข้อมูลที่พนักงานคีย์ **หลัง**จุดที่กู้ ต้องคีย์ใหม่ — เช็กจาก LINE/กระดาษ/ใบเสร็จจริง
6. หลังจบ: เขียนสั้น ๆ ว่าเกิดอะไร กู้ยังไง เสียข้อมูลกี่นาที → ปรับความถี่สำรองถ้าจำเป็น

## 6. ตารางติดตาม (แก้ในไฟล์นี้ทุกครั้งที่ทำ)

| งาน | ความถี่ | ผู้รับผิดชอบ | ทำล่าสุด | หมายเหตุ |
|---|---|---|---|---|
| ตรวจแผน Supabase + ตั้ง daily backup/PITR | ครั้งเดียว | อาทิตย์ | 18 ก.ย. 2026 | Pro · daily backup ทำงานอยู่ (เห็น 7 วัน 11–17 ก.ย. ชนิด PHYSICAL) · PITR ยังไม่เปิด |
| สำรองฐานข้อมูล (ข้อ 3.1) | Free: ทุกสัปดาห์ · Pro: ทุกเดือน | อาทิตย์ | — | |
| สำรองไฟล์แนบ (ข้อ 3.2) | ทุกเดือน (วันที่ 1) | อาทิตย์ / Claude | **18 ก.ย. 2026 ✅** | ครั้งแรกเต็มก้อน photos 22,5xx ไฟล์ 26 GB → K:\My Drive\amc-backups · ครั้งถัดไป 1 ต.ค. 2026 รัน scripts\backup-storage.cmd |
| จดค่าตั้งค่าลับ (ข้อ 3.3) | เมื่อเพิ่ม/เปลี่ยน key | อาทิตย์ | 18 ก.ย. 2026 | amc-air ครบ 24 ตัว · amc-air-497i ยังไม่ได้ตรวจ |
| **ซ้อมกู้คืน (ข้อ 4)** | **ทุกไตรมาส** | อาทิตย์ | **18 ก.ย. 2026 ✅ ผ่าน** | สำรอง 17 ก.ย. → amc-restore-test ~10 นาที · customers 709 / quotations 732 / invoices 354 / receipts 297 / REC-260916-08094 ตรงทุกช่อง · ครั้งถัดไป ≈ ธ.ค. 2026 |

---
*สร้าง 18 ก.ย. 2026 (v849) — ส่วนหนึ่งของแผน stability · โค้ด/migrations อยู่บน GitHub อยู่แล้ว ไม่ต้องสำรองแยก*
