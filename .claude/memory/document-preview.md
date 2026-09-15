# Document preview — v839

Owner asked to show product details and preview the actual document in the right-hand drawer. Sales types in DocPeek now open DocPreview (keyed by type + number), which uses DocCapture and the existing printDoc A4 pipeline. No new database queries or financial calculations.

DocPreview keeps an unscaled A4 iframe and scales its outer wrapper for fit/zoom. Its sandbox allows same-origin reads but no scripts. Original/copy changes rebuild from the unpaginated document; zoom never paginates again. Source capture unmounts after its HTML is ready. DocCapture ignores errors after unmount.

94 Chrome checks + 743 sales SSR assertions pass. Review and reproducible synthetic harness: docs/qa/v839/document-preview.md, app/scripts/build-document-preview-review.mjs. Preserve legacy BOQ/PO/job summary behavior. Existing baseline unpaid badge and undefined Settings m/API status failures remain.
