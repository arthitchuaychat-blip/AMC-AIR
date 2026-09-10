# Trial only: financing guards

Branch trial/financing-payment-guards. See docs/financing-trial-review.md.
Preflight rejects missing submitted_seq before creating an expense; no fallback from submitted_seq write failure to paid_count. Auto debit refuses an already submitted installment. Manual confirmation requires exactly paid_count+1 as submitted_seq.
NOT an atomic payment implementation. Do not merge as complete financing fix. Next: explicit expense-to-installment links, transaction/RPC uniqueness and full payment lifecycle. No production migration or backfill performed. Baseline npm test scoped-load suite already fails 2 checks (53 pass); new API mock tests and build pass.
