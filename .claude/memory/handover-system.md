---
name: handover-system
description: "ใบส่งมอบงาน — technician-filled service handover form (multi-form builder + on-screen signatures), prints/PDFs the saved data."
metadata: 
  node_type: memory
  type: project
  originSessionId: b8d73488-693d-46d1-b5f3-7849cf1f6166
---

ใบส่งมอบงาน (job handover) is a digital form the **technician fills while on the job**, optionally linked to a job order (or standalone). Migration **077** (`job_handovers` table); run manually in Supabase.

- Structure: one handover = header (customer + ประเภทงาน + 2 signatures) + a list of **sub-forms** in a `forms` jsonb. **3 main types (v343, ADD_KINDS)** offered by "+ เพิ่มแบบฟอร์ม": `accept` = ส่งมอบงานติดตั้ง (multi-unit in ONE form: machines[], rows[13 items][machine]='pass'|'fail'|null in 5 ACCEPT_GROUPS, itemNotes, overall[4], photos[] unlimited; customer signature relabeled ผู้ตรวจสอบ/ผู้รับมอบงาน) · `clean` = ส่งมอบงานล้าง per machine (acts=PM 15 done/not + rows=CLEAN_ROWS 16 b/a + photosBefore/photosAfter ≤4 each) · `repair` = ส่งมอบงานซ่อม per machine (rows=REPAIR_ROWS 13 b/a + fix text + 4+4 photos). Legacy kinds `perf`/`pm` hidden from the add menu but old docs still open/print. Photos upload via uploadMaterialPhoto (PhotoPicker in HandoverEditor).
- Shared defs live in `lib/handover.js` (PERF_ROWS, PM_ROWS, WORK_TYPES, blank factories) — used by BOTH the editor and the print renderer so they stay in lockstep.
- Components: `HandoverEditor.jsx` (the fill-in form), `SignaturePad.jsx` (draw-on-screen tech+customer signatures → PNG via `uploadSignatureDataUrl`), `JobHandover.jsx` (print/PDF renderer of SAVED data, paginates across A4), `Handover.jsx` (the module: list/create/edit/print/delete).
- Entry points: หน้า **"งานของฉัน"** on in-progress jobs + **ใบงาน** detail popup → `onHandover(jo)` opens the editor; module "handover" allows standalone create (ไม่ผูกใบงาน). New nav module `handover` in [[permissions-system]] (tech+lead_tech+office = edit; stock = none).
- **Two-phase fill**: tech fills ก่อน (before-work column) → บันทึกร่าง (draft); after work, taps the same job button → it **reopens that job's existing draft** (Handover.jsx startJob effect finds `status==='draft'`) to fill หลัง + checklist → บันทึก & ส่ง (submitted). The job button only continues a draft; once submitted it starts fresh.
- RLS: ช่างจัดการของตัวเอง (`created_by = auth.uid()`); admin/exec/sales/finance/lead_tech see all.
- Print uses native browser pagination (no `.doc-sheet`), so the printDoc paginator no-ops — see [[print-pagination]]. Verify print/editor layout in the `_design/` harness (handover.html / handover-editor.html, not committed).
- Earlier draft (v198) was a blank printout from the job; superseded by this tech-filled version (v199).
