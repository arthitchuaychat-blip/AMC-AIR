# Shared performance v833 — 2026-09-12

## Deployment status

Owner explicitly authorized both GitHub/Vercel production publication and the 38-policy RLS optimization. Migration `20260912091640_read_policy_role_initplan` is applied. Post-application authenticated quotation bundle EXPLAIN measured 78.698ms in a single run (not a browser timing). Application deployment is in progress; check the commit's Vercel status for completion.

## Prepared application changes

- One `quotation_page_bundle` RPC replaces expiry-write, page lookup, header/item and related-data requests for a quotation page. All totals, filters and 50-row ordering retain the existing server page implementation. Existing financial hydration is shared with other quotation readers; VAT, service-only WHT and discounts are not reimplemented.
- Read-only role/status RPCs verified STABLE no longer flush the shared short cache. Writes/unknown RPCs still invalidate it; account changes/logout clear caches. Old failed promises cannot delete a newer cached response. Quotation pages also subscribe to shared invalidation.
- Sidebar notification/chat/team/email timers pause while a tab is hidden and refresh on return. Realtime subscriptions remain enabled; hidden callbacks do not fetch counts. This is not cross-tab leader election.
- Dashboard BOQs are fetched in bounded batches of actual quotation references; no >200-reference fallback to an unscoped loader. Existing reporting formulas retained.
- Quote list no longer waits an unconditional 250ms when the search is empty.
- Executive sidebar adds **ผลวัดความเร็ว**, recording up to 100 local-memory opening samples for quotation, receipt and office subcontractor screens. Readiness follows loading/error state and two animation frames. Navigation and mount-only samples are labelled separately. No amounts, names, documents, auth tokens or remote telemetry are recorded. This does not measure save latency or all menus. Loading background tabs can delay animation frames.

## Applied database migration

`20260912090124_quotation_page_bundle_read_only`: verified installed before UI deployment. Function is STABLE SECURITY INVOKER; public/anon execution revoked and authenticated granted. Renewal accepts an already-expired date without requiring a bulk status update during list opening; date, reason, permissions, downstream locks and audit retained.

## Measurement and tests

- Single-page request count in the core loader is now one RPC. Company settings/auth/background requests are separate and are not claimed eliminated.
- Five-run database-only comparison of previous page hydration vs bundled hydration: previous median **548.629ms**, bundle median **551.311ms**. Bundling alone did **not** demonstrate faster DB computation; its intended benefit is fewer network round trips. Full browser benefit is not yet measured.
- Authenticated sales bundle: 50 of 702 quotes, 157 line items, about 170457 JSON bytes at the measured snapshot.
- Build passed. Tests passed: page order/cache/auth/retry, shared read/write invalidation, stale promise race, hidden-tab polling and overlap, document startup, subcontractor scopes, quotation-first/automatic BOQ, WHT (9), document addresses (17), job visits (8), Promise.all arity (115 sites).
- SQL pagination fixture: 123 records/3 pages, inclusive end date, old search, status filters, no missing/duplicate records. Renewal test: derived expiration, invalid dates, duplicate renewal, audit and HR denial, all rolled back.
- Browser interaction in an authenticated Thai session has not been run. No measured whole-app p95 or guarantee of a final latency target.

## Approved and applied RLS optimization

`docs/proposals/read-policy-performance.sql` wraps existing zero-argument STABLE `my_role()` lookups in scalar SELECTs in 38 SELECT policies. Roles, row conditions, restrictive policies and write policies are retained. This allows one role lookup per statement instead of per row, following Supabase RLS performance guidance.

Five controlled runs under sales RLS, same quotation bundle:

| Stage | Database execution milliseconds |
|---|---|
| Before | 441.944, 419.828, 418.728, 419.343, 419.050 |
| Proposed | 44.923, 43.856, 45.460, 47.127, 46.228 |

Median **419.343 →45.460ms**, about **89.2% less DB time** (9.2x). Total, status counts and page identifiers matched. Access regression compared 12 roles ×11 core tables (132 cases), with unchanged counts; every test rolled back. This is evidence about the tested database request, not whole-app speed or exhaustive authorization equivalence.

Automatic approval initially rejected the policy application. The owner subsequently explicitly approved both deployment and all 38 policy changes. The approved SQL is now recorded in the migration directory. Proposal and rollback scripts remain for audit history.

Official guidance: https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations

## Limits and rollback

No region move, server purchase, plan upgrade or persistent IndexedDB cache. Broad server summaries and complete menu-by-menu pagination remain outside this change. Known unrelated legacy static checks described in the previous performance report are not represented as passing.

UI rollback: restore the previous production commit `1943d14523e93d1f1afbeb690422b54cc8a96098`; the additive bundle RPC and expanded renewal handling are backward-compatible. No business documents were changed by the read-only benchmarks; fixture tests were transactional and rolled back.
