# Quotation performance — 2026-09-12
## Scope
Quotation list only. Server-side search, filters, complete counts and stable 50-row pages. Existing financial calculations hydrate only selected quote numbers. No changes to other report loaders or historical documents.
Customer/material data loads on editor entry; BOQ list loads only when choosing an existing BOQ (BOQ deep links fetch one). Page cache 30 seconds, separated by authenticated user, cleared on auth events and forced refresh. Mutation reloads clear the page cache; editing fetches the latest quotation. No persistent IndexedDB added this round.

## Measured evidence
Read-only transactional measurement using existing sales role/RLS, 5 sequential runs on production data. Compare JSON serialization of quotation headers + items for all quotations with a page of 50, including new paging/counts/links RPC work in the latter.
This is a database-side sub-workload measurement, NOT end-to-end browser timings and NOT total HTTP transfer sizes. Related customer, site, material and BOQ datasets are outside these byte counts.
- Existing quotations: 698; quotation items: 2817.
- New page: 50 quotation headers; 133 items.
- Before JSON bytes: 2129395; after: 132019 (93.8% less).
- Before database milliseconds: 2393.403, 1243.421, 1344.018, 2768.683, 1374.838.
- After database milliseconds: 680.181, 826.458, 648.668, 703.024, 592.298.
- Median: 1374.838 -> 680.181 ms (50.5% shorter; approximately 2.02x).
- Additional eager BOQ-item load (2828 rows) and material catalog load are removed from list startup, not included in the measured byte comparison above.
Network latency from a Thai employee device and rendering time have NOT been measured. No claim that the entire app opens twice as fast.

## Validation
- SQL fixture: 123 rows, 3 pages, stable unique order, last date included, older quote search, status filtering, empty pages. ROLLBACK; no real quotation modified.
- Sales RLS workload succeeded; HR page returns zero quotations.
- Cache test: warm cache, force reload, user separation, auth invalidation, no empty-scope full fetch, failed request retry, server sort preserved.
- Quotation-first save regression passed (normal/variation BOQs, preexisting links, service cost, failed-save reference).
- Quote WHT regression: 9 passed. Promise.all arity: 114 sites passed.
- Production build passed.
- Existing scoped-load suite: 53 pass / 2 preexisting failures outside new page loader (broad timestamp-lte scan and three acc_journal loaders missing order). api.js unchanged this round; new pagination/date tests independently pass.
- Authenticated browser UI/Thai-device timing unavailable in this runtime.

## Deployment and rollback
Apply supabase/migrations/20260912030204_quotation_server_pagination.sql before UI deployment.
Rollback UI commit restores old list; additive invoker RPC can remain unused or be dropped afterwards.
Production Supabase region unchanged. No subscription upgrade.
