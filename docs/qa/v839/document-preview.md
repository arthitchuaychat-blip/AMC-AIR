# v839 — Actual sales-document preview

The document drawer previously showed a separate compact summary and omitted saved product descriptions. Sales previews now use DocCapture, DocSlip, buildDocHtml and the same measured A4 pagination as print/PDF.

- Quotation, invoice/delivery, receipt/tax invoice, billing and credit/debit previews include their actual customer-facing content. Product descriptions come from saved document items; no internal notes are shown.
- The drawer fits a complete page to its width. Original/copy selection and 100%, 125%, 150% zoom change the view without changing saved data or A4 page breaks.
- Sales details are fetched only after opening the drawer, using the existing scoped document loader. The former summary load is skipped for these types.
- Load errors show retry, changed document keys unmount previous requests, and capture errors after unmount are ignored. Close, Escape and full-page editing/printing remain available.
- Other document summaries remain in place; saved item descriptions are also displayed there when available. Job and purchasing behavior is retained.

Validation: production build passes; 743 sales assertions across 140 rendered outputs pass. The real React drawer and document capture were exercised in Chrome with a synthetic API: 94 checks passed, including desktop/mobile, original/copy, long documents, zoom, retry, close, navigation and the existing job summary. Desktop and 390px mobile layout were visually reviewed. No live customer records were edited and no physical printer was tested.

Existing baseline failures remain: npm test stops at the Receipts unpaid status badge check, and the undefined-variable scan finds Settings `m` and API loan `status`. No new undefined variables were reported.

Reproduce the isolated browser harness with `node app/scripts/build-document-preview-review.mjs /tmp/preview.html`. Its temporary public review page is removed by this release.
