---
name: release-gate
description: ด่านปล่อยรุ่นตั้งแต่ 17 ก.ย. 2026 — main ถูกป้องกัน (push ตรงถูกปฏิเสธ) ต้องส่งเป็น PR ให้ CI test-and-build เขียวแล้วเจ้าของกด Merge; วิธีส่งงาน, ข้อความปฏิเสธที่จะเจอ, กับดัก "branch ต้องทันสมัย"
metadata:
  type: project
---

**main ถูกป้องกันแล้ว (classic branch protection, ตั้ง 17 ก.ย. 2026, ยืนยัน API `protected: true` + push ตรงโดน `GH006 protected branch hook declined`).** กฎ: Require PR (ไม่บังคับ approval — เจ้าของคนเดียว) · Require status check **`test-and-build`** (GitHub Actions `.github/workflows/test.yml` = npm ci → npm test → build → node --check api) · Require branch up to date · **Do not allow bypassing** (admin/AI ก็ข้ามไม่ได้). repo เป็น **public** (แผน Free บังคับกฎได้เฉพาะ public — ถ้าจะ private ต้อง Pro)

**วิธีส่งงานทุกครั้ง (แทน "push main"):**
1. ทำบนสาขา (`harden/…`, `fix/…`) → ผ่าน `npm test` (0 ตก) + `npm run build` ในเครื่องก่อน
2. `git push -u origin <สาขา>` → GitHub พิมพ์ลิงก์ `https://github.com/arthitchuaychat-blip/AMC-AIR/pull/new/<สาขา>` → **ให้ลิงก์นี้เจ้าของ** (ไม่มี `gh` CLI ในเครื่อง สร้าง PR จากเทอร์มินัลไม่ได้)
3. เจ้าของกด Create PR → CI รัน ~30 วิ → ปุ่ม Merge เขียวเมื่อผ่าน / เทาเมื่อตก → เจ้าของกด Merge → Vercel deploy จาก main
4. หลัง merge: `git checkout main && git pull` ก่อนเริ่มงานถัดไป (กฎ 0 เดิม)
- memory (`.claude/memory/`) ก็ต้องไปกับ PR — รวมในสาขาของงานนั้น อย่าแยก PR เฉพาะ memory ถ้าไม่จำเป็น
- **กับดัก "Require branches to be up to date":** ถ้า main ขยับหลังเปิด PR (เจ้าของ merge PR อื่นก่อน) ปุ่ม Merge จะขอให้อัปเดตสาขา → `git merge origin/main` เข้าสาขาแล้ว push อีกครั้ง (หรือกด "Update branch" ใน PR) — CI จะรันใหม่
- ห้ามแนะนำให้เจ้าของปิด/ข้ามกฎเพื่อความสะดวก — ถ้า CI ตก ต้องแก้ให้ผ่าน (ดู [[build-passes-page-dead]])
