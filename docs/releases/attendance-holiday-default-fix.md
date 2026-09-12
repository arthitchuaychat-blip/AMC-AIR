# Attendance check-in incident — 2026-09-12

Reproduced a staff INSERT failure: hr_att_guard assigned NULL to hol_ok, which is NOT NULL DEFAULT false. Exec/admin bypassed the affected branch. Replace the self-service default with false; preserve holiday and OT authorization guards and server timestamps.

Applied migration 20260912012623. Transactional tests passed for sales, tech, and HR self-service check-in/out; attempted self-approval of holiday/OT remained blocked. Fixtures were rolled back. Existing real attendance records were not changed. This is a database-only fix and does not depend on a frontend deployment.
