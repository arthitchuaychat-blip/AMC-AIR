---
name: stock-count
description: "Stock count / นับสต๊อก module — compare system vs counted, adjust on-hand, keep audit history"
metadata: 
  node_type: memory
  type: project
  originSessionId: b8d73488-693d-46d1-b5f3-7849cf1f6166
---

Stock count feature (v227, 2026-06-29 — **needs migration `086_stock_count.sql`**). Nav key `stockcount`, module in [[permissions-system]] (admin/exec/stock = edit, finance = view). Component `StockCount.jsx`, under the คลังสินค้า & จัดซื้อ nav group.

**Model recap:** on-hand stock is NOT stored — `material_stock` is a *view* deriving `current_stock` from the `transactions` ledger. So a count adjustment must be a movement. Migration 086 adds two movement types **`adjust_in`** (+) / **`adjust_out`** (−) to the `transactions.type` check (via DO-block drop+recreate, like 082) and **rebuilds the material_stock view** to include them (`+ adjust_in − adjust_out`). `txn_insert` RLS already allows admin/exec/finance/stock to insert any type, so no txn RLS change.

**Tables:** `stock_counts` (round header: count_no `SC-YYMMDD-HHMMSS`, note, status draft|applied, counted_by/applied_by/applied_at) + `stock_count_items` (count_id, material_code, system_qty [snapshot at apply], counted_qty [null=not counted], diff, unit_cost; unique(count_id,material_code)). RLS: read admin/exec/finance/stock, write admin/exec/stock.

**Flow:** `createStockCount({note,codes})` seeds a draft with items for the chosen scope (whole warehouse or picked categories). During counting the table shows LIVE `current_stock` as "ยอดในระบบ" vs typed "นับได้" with live diff (▲over/▼short/✓match) + summary. `saveStockCountCounts(id,{code:qty})` upserts counted_qty (draft). **`applyStockCount(id)`** reads live current_stock again, snapshots `system_qty`+`diff` on each item, inserts an adjust_in/adjust_out txn per nonzero diff (qty=|diff|, ref_no=count_no, reason="ปรับยอดจากการนับสต๊อก …"), then sets status=applied (locked). So stock lands exactly on the counted value; the round's per-item system/counted/diff stays for audit.

**Gotcha handled:** `Movements.jsx` does `TYPE_BY[type].th` — would crash on the new types. Extended `TYPE_BY` (NOT `TYPES`) with display-only rows for adjust_in/out so movement history renders "ปรับยอด (เพิ่ม/ลด)" without adding a manual recording tab. Adjust txns have job_no null → excluded from job-cost aggregates automatically.
