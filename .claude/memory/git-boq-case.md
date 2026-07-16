---
name: git-boq-case
description: git add ต้องใช้ตัวพิมพ์ตรงกับ index — ไฟล์ BOQ คือ app/src/components/BOQ.jsx (ตัวใหญ่); add เป็น Boq.jsx จะหลุดเงียบ ๆ
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b8d73488-693d-46d1-b5f3-7849cf1f6166
---

The BOQ component's git index path is `app/src/components/BOQ.jsx` (UPPERCASE), while tools may display the on-disk name as `Boq.jsx` (Windows is case-insensitive). `git add app/src/components/Boq.jsx` matches NOTHING and fails **silently** in compound commands — the edit stays uncommitted while the commit reports success (happened in v409/v413, caught+fixed in v419/bca9c1f).

**Why:** git pathspecs are case-sensitive even on Windows; only the index entry's exact case counts.

**How to apply:** before committing, `git status --short` and copy paths verbatim from its output into `git add` (never retype from memory). If a file you edited doesn't appear in the commit's file count, suspect a case-mismatched pathspec. Claude memory now lives in Google Drive via junction: `C:\Users\User\.claude\...\memory` → `G:\My Drive\claude-memory\Inventory-Management` (set up 2026-07-16; local backup at `memory-local-backup`).
