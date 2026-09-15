# Sales documents — approved v838 release

Owner approved the blue-original / gray-copy mockup, Sarabun typography, and production deployment on 2026-09-15. Release is deployed by merging PR #8. Production confirmation is recorded separately after deployment.

## Changes

- Sales documents use Sarabun 400 for text, 600 for emphasis/table headings, and 700 for titles. Explicit sales-only styles are independent of the application font preference.
- Original documents use blue `#1959b8`; copies use gray `#5d636b`. The palette applies to headings, table headers, customer panels, project labels, total bars and page rules. The company logo and brand name retain their original colors.
- Original/copy badges are included in the repeated header and remain explicit in monochrome printing. The existing print/capture copy selector and the no-stamp option are preserved.
- Sales amounts no longer have a baht prefix. The amount heading states `(บาท)`.
- Exact 100% invoices omit installment numbering and “งวดนี้”. Their summaries show VAT and the final total once; partial invoices retain installment references and contract context. Stored values and paid/unpaid state are unchanged.
- Print/capture content matches for customer branch, saved signatures, card/discount information, installment base/VAT and withholding annotations. Billing invoice counts exclude cancelled invoices.
- BOQ, purchasing, application screens, data loading, permission rules and financial calculations are unchanged. Sales pagination reserves 36px for the new footer and puts the badge inside the measured header; non-sales pagination keeps its old reserve and badge.

## Verification

- `npm run test:sales-documents`: **743 assertions / 140 rendered outputs**, including VAT/no VAT, discounts, full/partial/card payment, unpaid receipts, signatures, cancelled invoices, fractional withholding and 40 rows. Actual print and capture JSX produce matching HTML.
- Chrome A4 harness: **60 layout cases, zero failures** after correcting the sales-footer reserve. Five families × four scenarios (full, partial, 40 rows, no VAT) × original/copy/both. Checked page height, repeated headers, column groups, row preservation, signatures, colors and actual Sarabun 400/600/700 font loading.
- The long quotation initially exceeded A4 by about 2 CSS pixels; the increased footer reserve fixed it. Final original/copy screenshots are saved alongside this report.
- Build passes. Address, customer-note, BOQ-internal and sales-WHT checks pass. `npm test` still stops at the pre-existing Receipts unpaid badge check; the undefined-variable scan still reports existing Settings `m` and API loan `status` references.
- All visual tests used synthetic records. No customer messages, live document changes or database migrations were performed.
- Temporary public `_qa/sales-v838.html` existed only to run the isolated browser harness. This release removes it from the application.

## Limits

Chrome page geometry and rendered text were checked; a physical printer was not exercised. Long customer/site details and all payment/warranty terms can legitimately require a second page. Existing record content is retained.

Screenshots: [original](original.jpg), [copy](copy.jpg).
