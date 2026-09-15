# Sales documents — v838

Owner approved the mockup and instructed production deployment on 2026-09-15. Release through PR #8 (`work/sales-document-review`), preserving the PR #9 head-technician fix.

- `.doc-sales` scopes the approved design to sales output. New `sales-documents.css`: blue original, gray copy, fixed Sarabun 400/600/700; company logo remains unchanged.
- `DocSlip` carries the original/copy badge in its repeated header. `printDoc` reserves 36px for the sales footer and omits the old standalone sales badge. BOQ/purchase behavior stays unchanged.
- Currency prefix removed from sales output only. Exact 100% invoices have no installment labels and no duplicate VAT/full-contract totals. Partial payments retain installment labels; no payment-state or financial-rule changes.
- Capture content now matches native print, including branches, saved signatures and withholding details. Billing counts exclude cancelled invoices.
- 743 SSR assertions / 140 outputs pass; 60 Chrome layout cases pass. Real Sarabun weights loaded. The former visual-review blocker is resolved with a temporary synthetic harness, which this release deletes.
- Full review, screenshots and known unrelated test baseline failures: `docs/qa/v838/sales-document-review.md`. Production verification is recorded there after deployment in a separate JSON record.
