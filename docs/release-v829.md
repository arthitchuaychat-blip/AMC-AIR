# v829 — executive overview and shared work layouts

Based on production v828, commit `1ba6a629045410295406866b599a01b0e3dcbb0e`.

Changes:
- New executive landing view: approved sales, cash/bank accounts, invoice receivables, BOQ estimate with cost coverage, actionable queues, sales trend and air items ranked by quantity. Uses the existing real data sources. Account entity selection explicitly affects the cash card only; accounts without entity metadata remain in All.
- Secondary receipt/tax/account/stock summaries remain available in an expandable section. All existing dashboard tabs, document drawers and exports remain accessible. The 30-day cash forecast continues in the existing Cash Flow screen, linked directly from the overview; it is not recomputed from a different ledger on the home page.
- Overview navigation comes first. Shared table, list, input, button and responsive layout styling applies within `.amc-design` under screen media. Customer and supplier lists default to their existing list view. HR and follow-up tabs are grouped while retaining every tab key and workflow. Payables search is always visible. Loans, recurring bills and assets use the standard button classes.
- The chart renders negative values below zero, adapts to available width and exposes all values in a table. Unknown BOQ costs are excluded from estimated profit and the matching margin denominator, with coverage shown in overview, sales, trend and executive reports.
- Billing summary no longer labels invoice totals minus period receipts as outstanding debt. Approved sales use approval date consistently. Executive cash reporting separates cash/bank balances from the net position including receivables/payables; settled-invoice collection duration gets a descriptive label.
- Document, account and expense load failures in the changed reports surface as errors rather than successful zero totals. CRM labels identify chat contacts and use central open job statuses.

No schema, RLS, API mutation functions, invoice/payment/stock workflows or print templates were changed. This release does not change the authoritative receivables ledger calculation, payroll accounting policy or Cash Flow's existing entity classification. Air quantities count quotation lines classified as air items; the existing product/unit setup determines machine/set grouping.

Validation:
- `npm run build`.
- `npm run test:reports`: cost cohorts, missing versus recorded-zero cost, negative profit, cash account types/entities and signed chart domain.
- Existing undefined-variable, Promise.all arity, numeric regression, general regression and status-badge checks.
- Server-rendered production components with controlled fixtures: four overview KPIs, permission-filtered metrics, loading/error states, signed chart bars, SalesReport's mixed known/unknown-cost cohorts, BillingSummary's receipts for older invoices.

Validation limitation: browser interaction and authenticated end-to-end workflows were not exercised in this runtime. Production readiness is also checked through the GitHub/Vercel deployment status for the exact published commit.

Rollback: revert this release commit on main to restore v828 while preserving subsequent commits. Do not force-reset main if another developer has published changes.
