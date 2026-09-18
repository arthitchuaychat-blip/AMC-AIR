---
name: storage-backup
description: สำรองไฟล์แนบ Supabase Storage (bucket photos 26 GB) → Google Drive K: โหมด Stream ด้วย scripts/backup-storage.mjs (ดึงเฉพาะไฟล์ใหม่ผ่าน db query + storage cp) — กับดัก CLI (dst ต้อง relative, --workdir D:\backups, --linked --project-ref), bucket อื่นว่าง, ทำทุกวันที่ 1
metadata:
  type: project
---

**Supabase ไม่สำรอง Storage objects ให้เลย** (daily backup = DB อย่างเดียว) → สำเนาของเราคือสำเนาเดียว ทำครั้งแรก 18 ก.ย. 2026: bucket `photos` 22,513 ไฟล์ / 26 GB (materials 5 GB, docs 14 GB, line/chat/attendance ที่เหลือ) · bucket `hr-documents` `sales-wht-evidence` `AMC pic.` `tm_slides` ว่าง

**ที่เก็บ:** `K:\My Drive\amc-backups\storage\photos\…` — Google Drive for desktop โหมด **Stream** (เจ้าของมี Drive 5 TB) แคชอยู่ D: · เจ้าของเลือกเองหลังคุยเรื่อง "ที่เต็ม/ลบได้ไหม/ซิงก์ทั้งเครื่อง" (Mirror ทั้งเครื่องเคยทำ C: เต็ม → ห้าม)

**รายเดือน (วันที่ 1):** `scripts/backup-storage.cmd` → `scripts/backup-storage.mjs` — เทียบ `storage.objects` (SQL ผ่าน `npx supabase db query ... --linked --project-ref tpyrlxhoyghawqvsphfj --output-format json`) กับไฟล์ใน K: → `storage cp` เฉพาะที่ขาด (ขนาน 4) → log ใน `_logs/` · ไม่ลบไฟล์ที่หายจากเซิร์ฟเวอร์ · เตือน bucket ใหม่ · เตือนที่ว่าง < 20 GB · Claude รันให้ได้จาก Bash: `cd /c/Users/HUAWEI/Documents/AMC-AIR/scripts && node backup-storage.mjs` (ต้อง export TEMP/TMP/npm_config_cache ไป D:\build-tmp)

**กับดัก Supabase CLI 2.117 (npx, ไม่ได้ติดตั้ง global):**
- `storage cp -r ss:///photos/ ./` ใช้ได้เฉพาะ dst แบบ **relative** — `D:/...` ถูกอ่านเป็น URL scheme → "Unsupported operation" · src ต้องมี `/` ท้าย · bucket ว่าง → "Object not found" (ไม่ใช่ error จริง)
- `cp` ทั้ง bucket **ไม่ข้ามไฟล์ที่มีแล้ว** → ต้องเทียบเองด้วย SQL แล้วดึงทีละไฟล์
- `--linked` ต้องคู่กับ `--project-ref` และ link state อยู่ที่ `D:\backups\supabase\.temp` → ใช้ `--workdir D:/backups` เมื่อรันจากที่อื่น
- `db query` ใช้ token จาก `npx supabase login` (management API) ไม่ต้องรหัส DB — เจ้าของ login ไว้แล้ว 18 ก.ย. 2026 (ทำใน PowerShell ด้วย `npx.cmd` เพราะ .ps1 ถูกบล็อก)
- ต่อท้าย `< /dev/null` และ grep ทิ้ง "npm notice" เสมอ
- ความเร็วดาวน์โหลด ~7 GB/ชม. (26 GB ≈ 2 ชม. 20 นาที)
ดู [[release-gate]] · คู่มือเต็ม docs/runbooks/backup-restore.md
