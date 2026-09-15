# Head technician work status — fixed in production

2026-09-15: applied migration `20260915044533_lead_tech_work_status_scope`.

The head technician screen displays all teams, but `set_job_status` and `set_visit_status` still required `my_team()` to match the job/visit. A head technician with no assigned team could not start or submit any work. Earlier status tests covered a lead assigned to a team and incorrectly treated cross-team denial as intended.

- Fix only the membership condition: `lead_tech` can start, submit for approval and request another appointment across teams, with or without an assigned team.
- Keep all field transition, closed-visit, cancelled-job, lock and override guards. This does not grant final office approval, unlock, cancellation or financial access. Regular technicians/helpers still act only on their own team.
- Existing routine signatures, ACLs, security-definer status, RLS, room policies, contract triggers and status recomputation stay unchanged.
- No frontend change or BUILD bump is needed; the fix takes effect at the existing RPCs while the app remains v837. The separate sales-document PR #8 remains paused.

Verification: `npm run test:lead-tech-status` passes 157 assertions. It reproduces the failure first, applies the migration, tests leads with/without a team, regular technicians/helpers, inactive/unassigned/other roles, protected states, shared-team visits, daily contractor triggers, office behavior and rollback. `npm run test:work-scope` passes, including the previous 481 database assertions. Production build passes. `npm test`/undefined-variable check retain the known unpaid badge, Settings `m`, and loan `status` baseline failures.

Production verification: both installed routine definitions exactly match tested SQL. Read/room policy and contract/status-trigger digests match predeployment. A read-only transaction using the real lead actor confirms no assigned team, safe job visibility and zero raw job/price rows. Security advisor finding identities and severities remain unchanged. No live job/profile records were modified for testing, and no customer messages were sent. End-user clicking on a technician device is not claimed as tested.

Rollback: `docs/proposals/rollback-lead-tech-work-status.sql` restores only the two original routine bodies. Migration filename matches the timestamp recorded by Supabase; do not reapply it.
