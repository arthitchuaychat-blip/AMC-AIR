# AMC AIR — วัสดุOS (ERP + เว็บไซต์)

ERP ของร้านแอร์ AMC AIR + เว็บขายหน้าบ้าน เจ้าของสื่อสารภาษาไทย ตอบภาษาไทยเสมอ

- `app/` — React 18 + Vite SPA (ล็อกอินด้วย Supabase Auth) → Vercel auto-deploy จาก GitHub `main` → amc-air.vercel.app / app.amcair.net
- `company-website/` — เว็บสาธารณะ www.amcair.net (Vercel โปรเจกต์แยก amc-air-497i) — SSR หน้า `/p/:code`, `/a/:id` อยู่ใน `api/`
- `supabase/` — schema + migrations (Postgres/RLS/Realtime โปรเจกต์ tpyrlxhoyghawqvsphfj)
- `app/api/` — Vercel serverless (line-webhook.js = แชต LINE + บอท AI, push-send, calendar ฯลฯ)
- **The Top Mentor (BNI Chapter) — ย้ายออกไปเป็นโปรเจกต์อิสระแล้ว (23 ก.ค. 2026)**: repo แยก `github.com/arthitchuaychat-blip/the-top-mentor` → Vercel `the-top-mentor.vercel.app` → Supabase `podnetvgaboegaqyetwq` (คนละที่กับ ERP ทั้งหมด) · โค้ดใน AMC-AIR (the-top-mentor/, app/public/mentor/, app/api/mentor-*) ลบออกแล้ว · migration tm_* (108/109/110/170) เก็บไว้เป็นประวัติเฉย ๆ
- **`.claude/memory/` — ความจำสะสมของ Claude (อ่านก่อนเริ่มงานเสมอ)** เริ่มที่ `.claude/memory/MEMORY.md` = สารบัญ แล้วเปิดไฟล์ที่เกี่ยวกับงานที่จะทำ

## กฎเหล็ก (ห้ามละเมิด)

0. **เจ้าของทำงานสลับ คอม ↔ แท็บเล็ต (claude.ai/code)** — บนคอม: `git pull origin main` ก่อนเริ่มแก้โค้ดทุกเซสชัน (แท็บเล็ต clone ใหม่เสมอจึงล่าสุดอยู่แล้ว) และ push ทันทีที่จบงานทุกครั้ง อย่าปล่อยงานค้างไม่ push

0.1 **ความจำต้องเดินทางไปกับ repo** — `.claude/memory/*.md` คือความจำที่ใช้ร่วมทุกเครื่อง
   - **ทุกเครื่อง**: อ่าน `.claude/memory/MEMORY.md` ก่อนเริ่มงาน · เขียน/แก้ความจำแล้ว **commit `.claude/memory/` ไปกับงานด้วยเสมอ**
   - **เฉพาะบนคอมเครื่องเจ้าของ** (มีความจำ local ที่ `~/.claude/projects/.../memory` → junction ไป Google Drive): หลัง `git pull` รัน `.\.claude\sync-memory.ps1 -Pull` · ก่อน push รัน `.\.claude\sync-memory.ps1 -Push` เพื่อให้ 2 ที่ตรงกัน

1. **ห้ามจับ secrets/API keys** ในโค้ดหรือแชตเด็ดขาด — เจ้าของตั้ง env ใน Vercel dashboard เอง (ยกเว้น Supabase anon key = public, commit ได้)
2. **Migration รันเองไม่ได้** — เขียนไฟล์ใน `supabase/migrations/` แล้ว**วาง SQL ในแชต**ให้เจ้าของไปรันใน Supabase SQL Editor เสมอ (ล่าสุด: 151)
3. **ก่อน commit**: `git reset -q .claude/settings.local.json` แล้ว `git add` เฉพาะไฟล์ที่ระบุชื่อ (ห้าม `-A`/`.`) — **ก็อปพาธจาก `git status` ตรง ๆ** (กับดัก: ไฟล์คือ `app/src/components/BOQ.jsx` ตัวใหญ่ — add เป็น `Boq.jsx` จะหลุดเงียบ)
4. **Bump `BUILD`** ใน `app/src/App.jsx` ทุกครั้งที่แก้โค้ดใน app/ (แก้เฉพาะ `app/api/*` ไม่ต้อง bump) — เวอร์ชันโชว์มุมซ้ายล่างไว้เช็กว่าเบราว์เซอร์โหลดบันเดิลใหม่
5. Commit ลงท้าย `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` · ห้าม commit ไฟล์ `_design/*`
6. **ตรวจงาน** = `npm run build` ใน `app/` + `node --check` สำหรับไฟล์ api (แอปล็อกอินอยู่ ไม่มี browser preview) — งานพิมพ์เอกสารตรวจใน harness `_design/`

## กติกาเอกสารของเจ้าของ (ต้องรักษาไว้ทุกงานใหม่)

สายเอกสาร: **BOQ → ใบเสนอราคา → ใบส่งของ/ใบแจ้งหนี้ → (ใบวางบิล) → ใบเสร็จ** · ใบงานผูกกับใบเสนอ · PO ผูกใบเสนอ (งานแอร์ต้องผูก)

1. ยกเลิก/ลบ ต้องไล่จากเอกสารล่าสุดย้อนกลับ (มีตัวล็อกทุกชั้น) + **ระบุเหตุผลเสมอ** (ConfirmDialog `prompt.required`)
2. เอกสารยกเลิกแล้ว ล็อกปุ่มสร้างต่อทั้งหมด เหลือ ดู/พิมพ์ — ยกเว้น BOQ แก้ได้ บันทึก = คืนชีพ
3. เอกสารขายทุกใบเริ่มจาก BOQ (ใบเสนอใหม่บังคับ boq_no ไม่มีปุ่มสร้างซ้ำ)
4. **ลบถาวร = role `admin` (ธุรการ) เท่านั้น** ทุกเอกสาร · ยกเลิก/ลบ sync กระแสเงินสดอัตโนมัติ
5. ราคา: ส่วนลดรายบรรทัด (`quotation_items.discount`, mig 142) หักก่อนส่วนลดรวมท้ายบิล · ใบส่งของ/ใบเสร็จพิมพ์รายการจากใบเสนอ (ไม่มีตารางรายการของตัวเอง) · จ่ายบัตร = บวกเข้าราคาต่อหน่วย (unit_price ที่เก็บ = เงินสดเสมอ)

## กับดักทางเทคนิคที่เจ็บมาแล้ว

- **Supabase ตัด 1000 แถวทุก select** — ตารางโตต้อง `_fetchAll` หรือแยก query ต่อหมวด (เคย: รายการ BOQ หาย, บริการโดนแอร์ 855 รุ่นเบียดหลุดจากบอท)
- **Vercel serverless ฆ่า promise ที่ไม่ await หลังตอบ response** — งานเขียนทุกอย่างต้อง await (บทเรียนกล่องดำบอท LINE)
- **LINE ส่ง event มาแบบไม่มี replyToken ได้** — ห้ามใช้ token เป็นเงื่อนไขตอบ, `sendAuto` fallback เป็น push · ดีบักบอท: `?autoreply=1` (กล่องดำ ai_bot_last), `?aitest=1&q=&find=ชื่อ`, `?aicat=1`
- งานพิมพ์: หัวกระดาษซ้ำทุกหน้าใช้ JS pagination ใน `printDoc.js` (thead/fixed ใช้ไม่ได้ใน Chrome) · DocSlip มี `discountCol` เพิ่มคอลัมน์ส่วนลด
- `web_products` เป็น view ระบุคอลัมน์ตายตัว — เพิ่มคอลัมน์ใหม่ให้เว็บเห็นต้อง drop+create view + grant anon ใหม่
- แก้แล้วเว็บ "ไม่เปลี่ยน" มักเป็น cache บันเดิลเก่า — เช็ก BUILD มุมซ้ายล่างก่อนไล่บั๊ก

## แผนที่ระบบ (ไฟล์หลัก)

- สถานะกลาง: `lib/schedule.js` (JOB_STATUSES — เสร็จปิดงาน/รอนัดหมายเพิ่ม ฯลฯ ทุกเมนูต้องใช้ชุดนี้) · สิทธิ์: `lib/permissions.js can()` + matrix ใน Settings · ตำแหน่ง = role
- HR: `lib/hr.js` (กะ/ลา — ลาราย ชม. 8 ชม.=1 วัน, buildLeaveDaySet ใช้ร่วมทุกแท็บ) · เงินเดือน `lib/payroll.js` (รอบตัด 25) · ลาไม่รับค่าแรงหักผ่าน overLeave
- เอกสาร: `DocCard.jsx` (หัวการ์ดมาตรฐาน) · `DocChips.jsx` (ชิปเชื่อมโยง + ป้าย ✓เสร็จปิดงาน) · `DocPeek.jsx` (พรีวิวแผงขวา useDocPeek(onOpenDoc)) · `DocSlip.jsx` (แม่แบบพิมพ์ A4) · `DocTerms.jsx` (เงื่อนไขท้ายเอกสาร + ตัวดึงรับประกันรุ่นแอร์)
- สินค้า: ตาราง `materials` (kind ac/service/material · sale_price≠cost · warranty mig 140) · ฟอร์ม `MaterialModal.jsx` · แผงขวา `MaterialDrawer.jsx`
- บอท LINE: `app/api/line-webhook.js` aiAnswer() — Claude Sonnet 5, แคตตาล็อก = materials (ac+service เท่านั้น, แยก 2 query), ราคาขายเท่านั้น
- การเงิน: เบิกจ่าย `Expenses.jsx` (จ่ายรวมหลาย PO ได้ผ่าน expense_id) · เจ้าหนี้ `Payables.jsx` · กระแสเงินสด `CashFlow.jsx` (seed จากเอกสาร)
