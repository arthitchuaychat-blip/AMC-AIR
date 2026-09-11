# Job-level subcontract contracts

Select labor/inclusive/daily when assigning a sub team in the job form. Rates are snapshotted from shared configuration; existing saved labor is not migrated or recalculated automatically.

A database trigger computes quotation-based labor on opted-in jobs using actual quote prices, line/end discounts, service/material categories, and excludes AC units and categories marked as parts/accessories. Unknown catalog material rows receive zero and a review flag. Cleaning defaults to 70%; labor 45%; materials 10%; inclusive 65%.

Daily calculation uses distinct calendar dates for the assigned team across non-cancelled visits, expanding multi-day visits inclusively. Same-day duplicates count once; separate visits do not fill gaps. One job has one team; other teams use linked jobs.

Manual edits, confirmed labor, and paid/reserved labor remain frozen. Calendar changes set a review flag when the automatic amount differs. An explicit reset on an unconfirmed/unpaid job recalculates and saves current defaults. Internal SQL helpers have no PUBLIC/anon/authenticated execution grants.

Validation: transactional database tests before/after migration covered all three modes, AC/part exclusion, day-range overlap, cancelled visits, deletion, manual/confirmed freezes, and private-helper permissions. Test fixtures rolled back. Production build passed. No authenticated browser session test was performed.

Rollback: revert application commit and apply supabase/rollback/job_contract_mode_calendar.sql to stop triggers while retaining columns and saved data.
