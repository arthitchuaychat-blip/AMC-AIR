# Sales document review and currency display — v838

Date: 2026-09-15. Baseline: `d6de1fbea4aae6848cbee52953382a384abea1b4`.
Status: implementation prepared for review; not a production release.

## Assessment

The existing templates have a suitable business-document structure: a consistent blue letterhead, separate billing/site information, right-aligned numeric columns, an emphasized final total, terms, and signatures. This is a source and server-rendered HTML review, not a completed visual approval of A4 output. Browser access to the local harness was blocked; font wrapping, page breaks, and printer output remain unverified.

| Document | Existing strengths | Follow-up recommendation |
| --- | --- | --- |
| Quotation | Clear validity/reference fields, project name, item discounts and payment terms | Keep the structure. Use the same date format and payment/discount detail in print and capture. |
| Delivery note / invoice | Separates contract and installment totals in the print template | Visually distinguish contract reference amounts from the amount due now. The capture title and installment breakdown should match print. |
| Receipt / tax invoice | Print includes installment base, VAT, withholding and net receipt, plus payment confirmation | Make the current installment the primary summary. Bring the capture installment breakdown into alignment with print. |
| Billing note | Lists related invoices with a clear total | Consider invoice-specific column names instead of the generic quantity/unit-price columns. |
| Credit / debit note | Reason, related document numbers and adjustment totals are present | Keep labels consistent across print and capture, including withholding detail. |

## Existing inconsistencies found (not changed in this patch)

- `DocCapture.jsx` invoice and receipt totals omit the current-installment base and VAT rows that `Invoices.jsx` and `Receipts.jsx` already show. A partial-payment document therefore presents different detail depending on export path.
- Capture quotation, invoice and receipt customer objects omit `customerBranch`; native print passes it. `DocSlip` can consequently show the default head-office label in capture for a customer with a branch.
- Capture invoice title is INVOICE, while native print is DELIVERY NOTE / INVOICE. Quotation capture also omits the native after-discount subtotal and card-installment information.
- Sales templates duplicate their content between menu print and capture. A later shared-renderer change should preserve saved values, signatures, withholding rules and document lifecycle behavior, with output comparisons before rollout.
- Secondary text is approximately 9–11.5px in CSS. Printed readability and long Thai descriptions need visual confirmation; no conclusion about actual clipping is claimed.

These are presentation findings, not a tax-compliance certification. No financial policy or calculation is changed here.

## Implemented

- Added `fmtDocAmount`, retaining the exact existing separators, decimal precision and rounding from `fmtBaht`, without its leading baht symbol.
- Applied it only to quotation, invoice, receipt/tax invoice, billing and credit/debit document output in the menu and capture paths.
- Added an optional currency-unit label to the amount column (`จำนวนเงิน (บาท)` or the existing adjustment label plus `(บาท)`). The same header is used on repeated pages.
- Kept other menu money displays, purchase/BOQ output, data loading, database policies, calculations and pagination code unchanged.

## Verification

- Rendered the actual native print JSX and actual `DocCapture` slip functions through React's server renderer, using synthetic company/customer data. No live customer documents or messages were used.
- Compared 40 before/after outputs: five document families × print/capture × four scenarios (discount + withholding, simple VAT, no VAT, and 40 item rows).
- All numeric tokens were identical. In every case, the complete HTML matched the baseline after only removing `฿` and adding ` (บาท)` to the amount heading. This also confirms preservation of descriptive text, payment confirmation, terms and signatures in those fixtures.
- Production build passed.
- `npm test` stopped at the existing `Receipts.jsx` unpaid-status badge failure. The independent undefined-variable check reported the existing `Settings.jsx` variable `m` and `api.js` variable `status`; no new missing identifiers were reported.
- Browser A4/font/page-break verification remains outstanding. Keep this change in review until a print preview can be checked.
