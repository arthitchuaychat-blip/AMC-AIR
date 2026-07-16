---
name: print-pagination
description: How printed A4 documents (BOQ/Quotation/Invoice/Receipt) repeat the letterhead on every page
metadata: 
  node_type: memory
  type: project
  originSessionId: 85b6d010-27bd-419a-ad75-1ac380626a9a
---

Printed docs open a popup window (`app/src/lib/printDoc.js` → `openPrintWindow`/`writeAndPrint`) and print that; `DocSlip.jsx` is the shared layout.

**Repeating the letterhead on every page: do NOT rely on `<thead>` repeat or `position:fixed`.** Both were tried across many versions (v46–v50) and BOTH fail in the user's Chrome — `<thead>` simply doesn't repeat in this document, and `position:fixed` lands the header in unpredictable spots (content-area-relative, ends up mid/bottom of page).

**Working approach (v51): deterministic JS pagination in `printDoc.js`.** After the popup renders, `paginate(win)` measures the `.doc-running` header height and each body `<tr>` height, greedily packs rows into pages (`budget = A4height − margins − headerH`), then rebuilds `.doc` as one `.pg` block per page — each led by a clone of the header, with `page-break-after:always` between them. Header strip and body table share a `<colgroup>` (`COL_W` in DocSlip) so columns align; `table-layout:fixed` + `word-break` on the code column stop long codes spilling.

**Chrome fixed-layout colgroup gotcha (v267, 2026-07-04): every `<col>` in `COL_W` must have an explicit width — never leave one `null`/auto.** Under `table-layout:fixed` Chrome sizes auto columns from the FIRST body row; the BOQ body starts with a `colSpan=6` section-header row (`doc-sec`), which collapsed the auto รายการ column to ~2mm (product names wrapped one word per line). Quotations/invoices (no section row) looked fine, masking the bug. Fix: `COL_W = ["8mm","30mm","83mm","15mm","23mm","27mm"]` summing exactly to the 186mm content width. Verified in a harness with real measurements: auto+section-first-row → 9px; explicit → 314px (=83mm, identical to the quotation reference).

**Verify print changes in a browser harness — never ship blind.** The app is login-gated so the print button isn't reachable, but you CAN drop a self-contained HTML (real `.doc-*` CSS inlined + a copy of `paginate()`) in `app/public/`, run the dev server via preview tools, navigate to `/app/public/<file>.html`, and screenshot to confirm header-per-page + column alignment before deploying. Delete the harness after. See [[stale-cache-deploys]] for confirming the live bundle.
