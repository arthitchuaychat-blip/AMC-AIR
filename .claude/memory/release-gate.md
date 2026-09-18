---
name: release-gate
description: ด่านปล่อยรุ่นตั้งแต่ 17 ก.ย. 2026 — main ถูกป้องกัน (push ตรงถูกปฏิเสธ) ต้องส่งเป็น PR ให้ CI test-and-build เขียวแล้ว merge; บนคอมมี gh CLI ทำ PR + auto-merge เองครบวงจร (พาธเต็ม + < /dev/null), บนแท็บเล็ตให้ลิงก์เจ้าของ; กับดัก "branch ต้องทันสมัย"
metadata:
  type: project
---

**main ถูกป้องกันแล้ว (classic branch protection, ตั้ง 17 ก.ย. 2026, ยืนยัน API `protected: true` + push ตรงโดน `GH006 protected branch hook declined`).** กฎ: Require PR (ไม่บังคับ approval — เจ้าของคนเดียว) · Require status check **`test-and-build`** (GitHub Actions `.github/workflows/test.yml` = npm ci → npm test → build → node --check api) · Require branch up to date · **Do not allow bypassing** (admin/AI ก็ข้ามไม่ได้). repo เป็น **public** (แผน Free บังคับกฎได้เฉพาะ public — ถ้าจะ private ต้อง Pro)

**วิธีส่งงานทุกครั้ง (แทน "push main"):**
1. ทำบนสาขา (`harden/…`, `fix/…`) → ผ่าน `npm test` (0 ตก) + `npm run build` ในเครื่องก่อน
2. `git push -u origin <สาขา>`
3. **บนคอมเจ้าของ (มี `gh` CLI, ล็อกอินแล้ว 18 ก.ย. 2026 — ทำเองได้ครบ ไม่ต้องรบกวนเจ้าของ):**
   - เรียกด้วยพาธเต็มเสมอ `"/c/Program Files/GitHub CLI/gh.exe"` (PATH ของ Bash tool ไม่เห็น `gh`) · ต่อท้ายคำสั่ง `< /dev/null` กัน gh รอ stdin ค้าง (เคยค้าง 120 วิ)
   - เขียน body ลงไฟล์ใน scratchpad (ลงท้าย `🤖 Generated with [Claude Code](https://claude.com/claude-code)`) → `gh pr create --base main --head <สาขา> --title "…" --body-file <ไฟล์>`
   - `gh pr merge <เลข> --auto --merge --delete-branch` → `gh pr checks <เลข> --watch --fail-fast` (CI ~30 วิ) → `gh pr view <เลข> --json state,mergedAt` ต้องเป็น MERGED → `git pull origin main` แล้วเช็ก BUILD
   - PR #16 (v849) คือใบแรกที่ทำครบวงจรแบบนี้ สำเร็จ · เจ้าของคาดหวังแบบนี้: "เช็คความถูกต้องให้ แล้ว Merge pull request อัตโนมัติให้"
   **บนแท็บเล็ต (ไม่มี gh):** ให้ลิงก์ `https://github.com/arthitchuaychat-blip/AMC-AIR/pull/new/<สาขา>` เจ้าของกด Create PR → Enable auto-merge เอง
4. หลัง merge: `git checkout main && git pull` ก่อนเริ่มงานถัดไป (กฎ 0 เดิม)
- memory (`.claude/memory/`) ก็ต้องไปกับ PR — รวมในสาขาของงานนั้น อย่าแยก PR เฉพาะ memory ถ้าไม่จำเป็น
- **กับดัก "Require branches to be up to date":** ถ้า main ขยับหลังเปิด PR (เจ้าของ merge PR อื่นก่อน) ปุ่ม Merge จะขอให้อัปเดตสาขา → `git merge origin/main` เข้าสาขาแล้ว push อีกครั้ง (หรือกด "Update branch" ใน PR) — CI จะรันใหม่
- ห้ามแนะนำให้เจ้าของปิด/ข้ามกฎเพื่อความสะดวก — ถ้า CI ตก ต้องแก้ให้ผ่าน (ดู [[build-passes-page-dead]])

**ตั้งค่า repo เพิ่ม (18 ก.ย. 2026):** Automatically delete head branches ✓ · Always suggest updating PR branches ✓ (มีปุ่ม Update branch ใน PR) · **Allow auto-merge ✓** → บอกเจ้าของได้ว่า "กด Create pull request แล้วกด **Enable auto-merge** ปิดหน้าจอได้เลย" GitHub merge ให้เมื่อ CI เขียว (ยังบังคับ test เหมือนเดิม). เจ้าของ merge PR แรก (#15) ด้วยตัวเองสำเร็จแล้ว — เข้าใจ flow แล้ว (ถามว่า merge คืออะไร → อธิบายเทียบ "ร่าง → ตรวจ → อนุมัติเข้าต้นฉบับ")
