# Performance rollout summary — 2026-09-12
## Scope and shipped changes
1. Quotations: server pagination, full search/filter counts, 50-row hydrated pages, account-isolated short page cache and forced reload, lazy editor references.
2. Subcontractors: only quotes of relevant non-cancelled subcontractor jobs, <=100 ID batches / max two in flight, payout history on pay/score only, material costs on score only, settings independent.
3. Receipts (this commit): list loads referenced invoices and quotations only. All receipt rows still loaded so search, VAT classification, counts and print data retain complete coverage. On receipt creation, invoice candidates load then their related quotations. Existing financial methods unchanged. Empty scopes never invoke an unbounded legacy loader.
4. Office job list (this commit): jobs, teams, document links and handover flags only; customers, quotes and templates deferred to editor entry. Unused staff fetch removed. From-quote, chat-survey and calendar entry flows load editor prerequisites before enabling the form. Technician data access retains its existing restricted loader.

## Evidence, not whole-app promises
Database JSON workload timings, five sequential runs with authenticated RLS context. These measure quote headers/items, not full API network transfer, all dependent queries, browser rendering or Thai-device latency.
| Menu | Before JSON bytes | After JSON bytes | Before median DB ms | After median DB ms |
|---|---:|---:|---:|---:|
| Quotation list (sales role) | 2129395 | 132019 | 1374.838 | 680.181 |
| Subcontractor quote dependency (exec role) | 2150519 | 361261 | 813.719 | 146.090 |
| Receipt quote dependency (exec role) | 2150519 | 565243 | 820.277 | 225.207 |

Different snapshots/roles: these percentages must not be combined as one app-wide speedup.
Receipt snapshot: 702 quotes ->244 referenced; 2846 quote items ->727; 341 invoices ->280 referenced.
Receipt before ms: 842.083,820.277,821.037,816.899,817.954.
Receipt after ms: 228.128,228.457,225.207,223.161,223.632.
Job list startup removes all eager quotation/customer/template/staff fetches; no direct before/after browser timing was recorded.

## Verification
- Production build passed; Promise.all arity checks passed (115 sites).
- Executable startup test exercises actual receipt/job load functions with mock network: only referenced documents requested; office list has four dependencies; technicians never fetch quote/customer financial datasets.
- Shared scoped loader: 251 IDs in 3 bounded batches, deduplication, empty scope and propagated failure.
- Existing quotation page cache, quotation-first saving and subcontractor data tests pass.
- WHT quotation regression 9/9; visit save regression 8/8.
- Current data has no missing quotation references from receipts or subcontractor jobs.
- Document address regression 17/17. The existing stock-receiving static permission test has 13 pass / 1 failure about field_sales/assistant; unchanged by this work and not evidence of a newly introduced live RLS failure.
- New editor loaders cancel stale responses and block incomplete forms; retry/back available.
- No database changes this commit. Previously required migrations verified applied before deployment.
- Authenticated real browser testing / Thai-device timings unavailable.
- Known preexisting test failures remain outside changed files: scoped-load suite broad timestamp-lte check and unordered acc_journal readers; undefined-variable check reports Settings.jsx m and api.js status. Neither Settings.jsx nor api.js is changed here.

## Boundaries / remaining opportunities
This completes the first loading-reduction pass across the four agreed menus. It does not mean every menu is fully optimized.
Receipt/job primary lists and shared document-link metadata still load full lists. Editor candidate lists still use existing loaders. Persistent IndexedDB, targeted cross-menu invalidation, dashboard server summaries and region migration are not included.
No subscription/server purchase, no region change, no financial formula or payroll changes.
Rollback: revert the current receipt/job commit. Earlier quotation pagination RPC can remain installed.

