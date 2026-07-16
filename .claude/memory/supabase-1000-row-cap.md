---
name: supabase-1000-row-cap
description: Supabase caps EVERY select at 1000 rows (even with .limit(5000)) — full-table reads of growing tables silently drop rows; always page with _fetchAll in api.js
metadata: 
  node_type: memory
  type: project
  originSessionId: b8d73488-693d-46d1-b5f3-7849cf1f6166
---

Supabase/PostgREST caps every request at **1000 rows** (db-max-rows) — `.limit(10000)` does NOT override it. Any `select("*")` over a whole growing table silently truncates.

**Why:** Bit hard 2026-07-07: BOQ items "vanished" after save (v324 fix). Saves succeeded; `listBoqs` read all `boq_items` ordered by id ASC, so once the table crossed 1000 rows, items of NEW docs were dropped on read → lists/prints showed empty docs, and re-saving an "empty-looking" doc then really wiped its lines (editor loads empty → delete+insert nothing). Days were lost chasing DB constraints/RLS because the symptom looked like a failed write.

**How to apply:** In `app/src/lib/api.js` use the existing `_fetchAll((f,t) => supabase.from(tbl).select(cols, { count: "exact" }).order(...).range(f, t))` helper for every read of a growing table (doc item tables, transactions, cash_entries, doc heads in syncCashEntriesFromDocs). When adding a new list function or a new *_items table, never do a bare full-table `.select()` — page it from day one. Diagnostic tell: "data disappears but only for NEW records, old ones fine" = read truncation, not write failure.

**Paged reads MUST have a stable `.order()`** (v326): each `.range()` page is a separate query; without ORDER BY the row order is non-deterministic (worst on GROUP BY views like material_stock) → rows duplicate on one page and vanish from another while the total count still looks right. Symptom: per-category/per-group tallies differ between two screens reading the same data (Catalog vs StockCount incident). Order by the PK (`code` for materials, `id` elsewhere).
