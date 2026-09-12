# Subcontractor performance — 2026-09-12
Scope: Subcontractor menu, keeping existing labor/pay calculations and permissions.
- Labor tab reads quotations only for non-cancelled jobs assigned to subcontractor teams.
- Quote IDs deduplicated and sorted; batches <=100, max two concurrent. No >200 legacy full-table fallback; empty jobs make no quote request.
- Payout history loaded only on pay/score; material cost only on score.
- Settings tab makes no document requests (rate settings still loaded).
- Tab navigation remains visible during loads. Stale tab responses ignored. Missing/error data blocks operational content and shows retry, rather than a false zero.
- No DB schema or stored financial data changed.

## Current data counts
702 quotations ->173 relevant subcontractor quotation IDs.
2846 quotation items ->456 relevant items (84.0% fewer).
No subcontractor jobs with a non-null quote reference missing from quotations.

## Read-only DB workload benchmark
5 sequential repetitions, exec role with RLS. JSON serialization of headers+items all vs relevant IDs. Excludes fetching job/team IDs, other dependent datasets, HTTP round trips, JavaScript rendering and Thai-device latency. These are not complete menu load times.
Before bytes: 2150519; after: 361261 (83.2% less).
Before milliseconds: 836.192,813.719,812.632,830.485,808.545.
After milliseconds: 147.353,146.373,146.09,145.214,145.945.
Median: 813.719 ->146.09 ms (82.0% shorter for this sub-workload).
Do not extrapolate this percentage to the whole application or compare directly with the prior sales-role benchmark.

## Verification
Executable loader tests: 251 unique IDs across 3 batches, deduplication, exclude cancelled/own-team jobs, per-tab dependencies, settings no requests, empty scope, missing reference rejected.
Promise.all arity checks passed (114 sites); production build passed.
No authenticated browser/end-to-end timing available. Remaining large loaders: jobs and teams; material cost still full when score is explicitly opened.
Rollback: revert this UI commit; no migration required.

