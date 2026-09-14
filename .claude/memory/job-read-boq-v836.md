# v836 — job read scope and BOQ pilot (prepared, not deployed)

Deployment authorization update: after reviewing the implementation and Claude follow-up, the owner explicitly requested “งั้นปรับขึ้นใช้งานริงเลยครับ”. This authorizes publishing this reviewed batch and the required production migration/deployment; the earlier publication hold is superseded for this batch. Preflight confirmed main is still 7e3ce6b and live dependency definitions match the tested snapshot. Deployment verification is in progress; record the final migration/merge/results below when complete.

14 Sep 2026: user approved the five-step permission/performance/menu plan and emphasized the app is live. Work is isolated on `work/menu-polish-preflight`, based on main `7e3ce6b`. No production row, migration or deployment performed for this batch.

Implementation commit: `eabb1a9`. Push was rejected by automatic approval review: public/unverified GitHub publication of code/schema/QA needs explicit user authorization. Do not bypass via another transport or connector. No PR created; local work and review package are complete, awaiting publication approval.

- Remove jobs_for_team error fallback to office list; persistent retry in MyJobs, JobOrders, Schedule, JobTimeline. Discard stale role/team responses.
- Existing production migrations 20260914045754 and 20260914050118 were absent from git; restored their inspected definitions. Do not reapply them to production.
- New migration 20260914060726: actor menu scope for job reads, own-team field stock jobs/logs, guarded refs, invoker boq_page (50 summaries). Still needs owner-run SQL per CLAUDE.md, before UI deployment.
- Preserve custom graphic.joborders=view, assistant normalization and lead visibility; shared visits remain context, other-team status changes still denied. Use safe job_field_refs for group timeline and notification metadata.
- BOQ loads items/editor prerequisites on demand, has stable pages/all-dataset search/old-document focus, refresh and user-separated cache; initial auth delivery must not be treated as logout. Preserve map-address fallback and customerVat when printing.
- Actual PostgreSQL fixture tests: 480 assertions including rollback; browser tests use actual screens/CSS, synthetic data and blocked external network. Core work-round/chat checks pass. See docs/qa/v836/review.md and regression-status.json.
- Claude review follow-up: added explicit direct quotations/quotation_items RLS checks before/after migration for all roles, nonempty own/other-team price fixtures, pre-migration raw field-job denial + safe visibility, and attempted office-bundle denial for field roles. Re-read live my_role()/policies: assistant→tech and field_sales→sales confirmed. Test/documentation edits only; publication block remains, no retry or deployment authorized by receiving the review.
- Baseline comparison: 42/48 suites pass; six remaining failures already fail main. npm test is not green. Undefined m in Settings and status in loan code are pre-existing and were not changed.
- Live read-only payload measurement: BOQ list 2,749,864 bytes -> 51,465 bytes (50/683 documents, 98.13% lower). Database single samples ~91 vs94ms; no measured CPU/page-load-time speedup claim. BOQ added to existing speed report; measure real navigation after deployment.
- Rollout/rollback instructions and SQL: docs/qa/v836/review.md. Other menus remain future batches; no room membership/chat sending/payroll business changes.
