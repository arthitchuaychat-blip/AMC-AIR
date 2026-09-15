# Sales document review — v838 draft

Owner resumed this task after the head-technician hotfix on 2026-09-15. Draft PR #8 (`work/sales-document-review`); NOT deployed. Head technician fix PR #9 is merged into the branch and must remain.

- Owner wants a review from quotation through receipt/tax invoice and removal of the B/baht symbol beside amounts.
- Draft removes currency prefixes from sales documents only; preserves numbers and labels the amount heading in baht.
- Follow-up aligns capture with native print for branch, saved signatures, card-installment details, installment base/VAT, titles and withholding annotations. Billing count excludes cancelled invoices.
- `npm run test:sales-documents`: 548 assertions / 110 actual JSX outputs pass. Build and relevant document checks pass. Known unrelated baseline failures are recorded in `docs/qa/v838/sales-document-review.md`.
- A4 visual approval remains pending: local harness was blocked by browser policy; Vercel preview requires login. Do not claim a visual check or release this draft without completing it. The owner can supply exported PDFs instead.
- Detailed review and remaining visual recommendations: `docs/qa/v838/sales-document-review.md`. Keep document CSS and pagination stable until visually checked.
