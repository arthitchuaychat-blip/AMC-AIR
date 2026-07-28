# ย้ายมาคอมเครื่องใหม่ — เช็กลิสต์ตั้งค่า AMC AIR (วัสดุOS)

คู่มือนี้ทำให้คอมเครื่องใหม่พร้อมทำงานต่อได้ทันที ครอบคลุมของ **3 อย่างที่ไม่ได้อยู่ใน git**:
ความจำของ Claude (junction), คีย์ Supabase ในเครื่อง (`app/.env`), และ secrets ที่อยู่บน Vercel

> TL;DR: ติดตั้งเครื่องมือ → `git clone` → รัน `.\.claude\setup-new-computer.ps1` → เติม `app/.env` → เสร็จ

---

## 1) ติดตั้งเครื่องมือที่ต้องมี

| โปรแกรม | ใช้ทำอะไร | โหลดจาก |
|---|---|---|
| **Git** | ดึง/ส่งโค้ด | git-scm.com |
| **Node.js LTS** (≥ 20) | `npm run build` / `dev` + ชุดเทสต์ | nodejs.org |
| **Claude Code** | ตัวช่วยเขียนโค้ด (อ่าน `.claude/memory`) | claude.ai/code |
| **Google Drive Desktop** | *(ไม่บังคับ)* สำรองความจำผ่าน junction | google.com/drive/download |
| VS Code / เบราว์เซอร์ | แก้ไฟล์ / เปิดเว็บ | — |

ตั้งค่า git ครั้งแรก:
```bash
git config --global user.name "ชื่อคุณ"
git config --global user.email "arthitchuaychat@gmail.com"
```

---

## 2) Clone repo

```bash
git clone https://github.com/arthitchuaychat-blip/AMC-AIR.git "Inventory Management"
cd "Inventory Management"
```

> ทุกอย่างที่จำเป็นอยู่ใน repo แล้ว รวมถึง `.claude/memory/*.md` (ความจำ) และ `.claude/settings.json`
> โฟลเดอร์ที่ **ไม่ได้** อยู่ใน git (ตาม `.gitignore`): `node_modules/`, `dist/`, `.env`, `.vercel`

---

## 3) ตั้งค่าความจำ Claude + คีย์ Supabase (รันสคริปต์เดียวจบ)

```powershell
powershell -ExecutionPolicy Bypass -File .claude\setup-new-computer.ps1
```

สคริปต์นี้จะ:
1. สร้างโฟลเดอร์ความจำ local ที่ Claude Code อ่าน
   `%USERPROFILE%\.claude\projects\C--Users-User-OneDrive-Desktop-Inventory-Management\memory`
2. ดึงความจำจาก repo ลงเครื่อง (`sync-memory.ps1 -Pull`)
3. ก็อป `app\.env.example` → `app\.env` ให้ (ถ้ายังไม่มี) — **แล้วต้องไปเติมคีย์เอง (ข้อ 4)**

### ถ้าอยากสำรองความจำผ่าน Google Drive ด้วย (ไม่บังคับ)
ทำงานได้โดยไม่ต้องมี junction — repo คือตัวจริงของความจำอยู่แล้ว แต่ถ้าอยากได้ redundancy บน Drive
ให้ติดตั้ง Google Drive Desktop ก่อน (จำอักษรไดรฟ์ที่มันเมานต์ เช่น `G:` — เครื่องใหม่อาจไม่ใช่ G:) แล้วรัน:
```powershell
powershell -ExecutionPolicy Bypass -File .claude\setup-new-computer.ps1 -GoogleDrivePath "G:\My Drive\claude-memory\Inventory-Management"
```
สคริปต์จะทำโฟลเดอร์ความจำเป็น **junction** ชี้ไปที่ path นั้นแทน (แบบเดียวกับเครื่องเดิม)

---

## 4) เติมคีย์ Supabase ใน `app\.env`

เปิด `app\.env` (สคริปต์ก็อปโครงให้แล้ว) ใส่ค่าจริงจาก **Supabase → Project Settings → API**:
```
VITE_SUPABASE_URL=https://tpyrlxhoyghawqvsphfj.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```
> คีย์ **anon** เปิดเผยได้ ปลอดภัย (ดูค่าได้จาก `company-website/index.html` หรือ Supabase dashboard)
> จำเป็นเฉพาะตอนรัน `npm run dev`/`build` ในเครื่อง — เว็บ production ใช้ env ของ Vercel

---

## 5) ติดตั้ง dependencies + ตรวจว่าใช้ได้

```bash
cd app
npm install
npm run build   # ต้องผ่าน
npm test        # ชุดเทสต์ต้องผ่านก่อน commit ทุกครั้ง (กฎข้อ 6)
```
> แอปตัวจริงอยู่ใน `app/` (React+Vite → Vercel) · `index.html` ที่ราก = ต้นแบบ ดับเบิลคลิกเปิดได้เลย

---

## 6) Secrets อยู่บน Vercel — ไม่ต้องมีในเครื่อง

การ deploy ทั้งหมดอ่าน env จาก **Vercel dashboard** ไม่ใช่จากเครื่อง คอมใหม่จึง **ไม่ต้องมี** คีย์พวกนี้
(ยกเว้นจะรัน serverless api ในเครื่อง ซึ่งปกติไม่ทำ) — เก็บลิสต์ไว้เผื่อวันหนึ่งต้องตั้ง Vercel project ใหม่:

| กลุ่ม | ตัวแปร |
|---|---|
| Supabase (frontend) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Supabase (api) | `SUPABASE_URL`, `SUPABASE_ANON` / `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| LINE OA | `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET` |
| บอท AI | `ANTHROPIC_API_KEY` |
| Facebook Messenger | `FB_APP_SECRET`, `FB_PAGE_ACCESS_TOKEN`, `FB_PAGE_ID`, `FB_VERIFY_TOKEN` |
| FlowAccount | `FLOWACCOUNT_CLIENT_ID`, `FLOWACCOUNT_CLIENT_SECRET`, `FLOWACCOUNT_ENV` |
| Google Translate | `GOOGLE_TRANSLATE_API_KEY` |
| Web Push (VAPID) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| ปฏิทิน / ดีบัก | `CALENDAR_FEED_TOKEN`, `DEBUG_TOKEN` |

> **ห้าม** เอา secrets พวกนี้ลงโค้ดหรือ commit เด็ดขาด (กฎข้อ 1) — ตั้งใน Vercel เท่านั้น

### Vercel projects (deploy อัตโนมัติจาก GitHub `main`)
| โปรเจกต์ | โฟลเดอร์ (Root Dir) | โดเมน |
|---|---|---|
| แอปหลัก (ERP) | `app/` | amc-air.vercel.app · app.amcair.net |
| เว็บบริษัท | `company-website/` | www.amcair.net (amc-air-497i) |
| ร้านแอร์ | `air-shop/` | แอร์ถูกกว่าห้าง.com (amc-air-6os6) |

Supabase ทั้งหมด: โปรเจกต์ `tpyrlxhoyghawqvsphfj` (migration รันมือใน SQL Editor — กฎข้อ 2)

---

## 7) กิจวัตรทำงานประจำวันบนคอม (กฎข้อ 0 / 0.1)

```powershell
# เริ่มงาน
git pull origin main
.\.claude\sync-memory.ps1 -Pull      # ดึงความจำล่าสุดลงเครื่อง

# ... ทำงาน ...

# จบงาน
.\.claude\sync-memory.ps1 -Push      # ดันความจำเข้า repo
git add .claude/memory <ไฟล์งาน>     # ห้าม -A/. · ก็อปพาธจาก git status เป๊ะ ๆ
git commit ; git push
```
> แท็บเล็ต (claude.ai/code) ไม่ต้องรัน sync — clone ใหม่ทุกครั้งจึงอ่าน `.claude/memory` ใน repo ได้ตรงเลย
