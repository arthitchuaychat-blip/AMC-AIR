let revision = 0;
const listeners = new Set();
export const cacheRevision = () => revision;
export function invalidateData() { revision++; for (const fn of listeners) fn(); }
export function onDataInvalidated(fn) { listeners.add(fn); return () => listeners.delete(fn); }
// Only functions verified STABLE in the production catalog. Unknown RPCs still invalidate.
export const READ_RPCS = new Set(['hr_today','jobs_for_team','kpi_scorecard','list_teams_for_role','quotation_page','quotation_page_bundle','sales_wht_locks','sub_pending_for_team','team_unread_count']);
