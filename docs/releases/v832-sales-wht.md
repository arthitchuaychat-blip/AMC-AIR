# v832 — Customer withholding tax and evidence

Implements the owner's requested workflow on top of production ef0aaa4852dee657266b587142dc4ff5b15875b1.

- New quotations for company customers enable service-only WHT by default. Users can disable it or set 0–100%, including 1% and 3%. Personal customers have no WHT controls or deductions.
- Quotations, invoices, receipts and adjustment notes use the same rounded service share of the discounted pre-VAT base. Invoice/receipt selections inherit the source's enabled flag and rate. Product, air-conditioner and material categories do not contribute to the WHT base.
- No historical financial records are rewritten. Unknown legacy item categories require checking the source before changing WHT. Editing invoice/receipt WHT requires a reason and creates an audit entry.
- Exported/claimed, posted, reconciled or verified receipts cannot have financial amounts changed. Invoices with subsequent active documents are locked. Metadata-only notes remain editable.
- Customer WHT register: expected / paid and awaiting evidence / received / verified. Sales can attach evidence; finance, manager or owner can verify paid receipts with matching amounts. Private PDF/JPG/PNG uploads, maximum 10 MB; signed download links.
- Actual WHT reporting uses paid receipts and their recorded payment date. Legacy paid receipts without that date visibly use document date. Adjustment notes do not silently reverse tax credit.
- Sales and field sales can send VAT sales documents through the existing FlowAccount flow without accounting-module privileges. Export RPCs enforce claims and prevent overwriting completed exports.

## Validation

Passed: shared calculation tests (corporate/personal, service/product, 0/1/3%, discounts, proportional installments, inheritance, rounding); sales export API role tests with mocked credentials and no external sends; quotation/print and FlowAccount regression contracts; v831 permission and admin-user regressions; dashboard loading and report metrics; production build.

The migration and database fixtures were exercised together inside BEGIN/ROLLBACK. Corporate/personal amounts, zero rate, document propagation, downstream locks, payment date, atomic export claim, retained export ID, sales evidence creation, finance verification, mismatched evidence rejection and HR denial passed. Test users, document rows, file metadata and schema changes were rolled back.

Browser interaction testing was unavailable in this runtime because a Chromium executable is not installed. No authenticated production UI session and no real FlowAccount/customer send was performed.

## Deployment

Apply `supabase/pending/sales_wht_v832.sql` before merging the app. After success, move it to the migrations directory using the exact version reported by Supabase. Check schema/RLS advisories and Vercel statuses. Do not label deployment complete until both database and app are confirmed.

Emergency compatibility rollback: restore the v831 app, then review/apply `supabase/rollback/sales_wht_v832.sql`. It restores previous export RPCs and removes new document guards while retaining evidence, private files, columns and audit history. Do not delete customer data.

## Boundaries

The service-only category rule is the requested business default, not automatic legal classification. Certain repair contracts or public-sector customers may need different bases or rates; confirm those with the accountant (Revenue Department ruling https://www.rd.go.th/42086.html).

FlowAccount WHT is included in document remarks by the existing integration. This release does not claim to create native FlowAccount WHT certificates or file tax returns. Sales export is the existing receipt/tax-invoice action; quotation and invoice creation remain inside AMC.
