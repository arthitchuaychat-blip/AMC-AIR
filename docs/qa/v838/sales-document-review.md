# Sales document review — v838 (draft)

Date: 2026-09-15. Current main baseline: `70260d86760903eb6590c29b91629e4798c58b8c`.
Status: code and rendered-content checks complete; A4 visual check pending. Not deployed to production.

## Review

The source has a consistent blue letterhead, billing and site address blocks, numeric columns, totals, terms and signatures. This is a source and rendered-HTML assessment. It is not a visual approval of font sizes, Thai wrapping or printed pagination.

| Document | Assessment and next visual check |
| --- | --- |
| Quotation | Keep the basic structure. Currency prefixes add clutter; remove them while stating the unit in the amount heading. Check long Thai descriptions and discount-column width. |
| Delivery note / invoice | The current installment should be easier to distinguish from the full contract amount. Check the longer combined Thai/English title and multi-page totals. |
| Receipt / tax invoice | Keep payment confirmation and installment base/VAT visible. Check that the net receipt is clearly the main total and that signatures fit the last page. |
| Billing note | Invoice-specific headings would be clearer than empty quantity/unit-price columns. Visible invoice count must exclude cancelled invoices. |
| Credit / debit note | Preserve the reason, references and withholding detail. Check long reasons and note titles. |

## Implemented in this draft

- Remove the leading baht symbol only in sales document amounts, preserving the existing separators, precision and rounding. The amount heading states `(บาท)`.
- Align capture output with the existing native print output: customer branch, saved signature or explicit no-signature choice, quotation card/discount details, invoice title, installment base/VAT and per-line withholding annotations.
- Use the same saved values and existing withholding display logic as native print. No tax rule, calculation in the data layer, access policy or document lifecycle change.
- Native billing count now counts the same live invoices that are printed; cancelled invoices remain excluded.
- All five document families now produce identical print/capture HTML in the tested cases.
- Print pagination and the document CSS are unchanged. Visual hierarchy and billing-column redesign remain recommendations pending visual review.

## Verification

- `npm run test:sales-documents`: 548 assertions across 110 rendered outputs (11 scenarios × 5 families × 2 paths).
- Cases cover VAT/no VAT, discount/withholding, 40 rows, full-card/10-month installments, unpaid receipt, credit/debit, saved/empty signatures, cancelled invoices and fractional withholding rates.
- Independent expected amounts verify a 50% installment: base 29,500.00, VAT 2,065.00, withholding 105.00, net 31,460.00. Internal notes remain absent.
- Compared 20 native print outputs with the pre-change baseline: complete HTML matches after only removing the baht prefix and adding the currency heading. The cancelled-invoice count fix is separately covered by its fixture.
- Production build passes. Address, customer-note, quotation-WHT, BOQ-internal, sales-WHT and recheck regression tests pass.
- `npm test` still stops at the pre-existing Receipts unpaid badge check. Undefined-variable scan still reports the pre-existing Settings `m` and API loan `status` references; no new identifiers.
- Cloud browser reaches the Vercel preview sign-in screen. It cannot inspect the document without authenticated preview access. Earlier local-harness navigation was blocked by browser policy. No visual or printer approval is claimed.

## Remaining release gate

Inspect a real A4 preview (including long Thai rows, a partial-payment invoice/receipt, and repeated page headers) before publishing. Use the `_design/` harness procedure in `.claude/memory/print-pagination.md`; synthetic fixtures only. Do not send test documents to customers. Alternatively, the owner can provide exported PDFs for the visual review.

PR #8 remains a draft. The head-technician production fix from PR #9 is preserved on this branch.
