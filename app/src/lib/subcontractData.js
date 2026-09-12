import { listJobOrders, listTeams, listQuotations, listSubPayouts, jobMaterialCost } from './api';

export async function loadSubcontractData(tab) {
  if (tab === 'settings') return null;
  const [jobs, teams, payouts, matCost] = await Promise.all([
    listJobOrders(), listTeams(),
    tab === 'pay' || tab === 'score' ? listSubPayouts() : Promise.resolve([]),
    tab === 'score' ? jobMaterialCost() : Promise.resolve({}),
  ]);
  const subIds = new Set(teams.filter(t => t.type === 'sub').map(t => t.id));
  const relevant = jobs.filter(j => subIds.has(j.assigned_team) && j.status !== 'cancelled');
  const nos = [...new Set(relevant.map(j => j.quote_no).filter(Boolean))].sort();
  const quotes = [];
  // Keep every required quotation; bounded batches avoid the legacy >200 full-table fallback.
  // Two batches in flight at most, to avoid a burst of dozens of dependent queries.
  for (let i = 0; i < nos.length; i += 200) {
    const batches = [nos.slice(i, i + 100), nos.slice(i + 100, i + 200)].filter(a => a.length);
    const rows = await Promise.all(batches.map(nos => listQuotations({ nos })));
    quotes.push(...rows.flat());
  }
  const quoteBy = Object.fromEntries(quotes.map(q => [q.quote_no, q]));
  if (nos.some(no => !quoteBy[no])) throw new Error('ข้อมูลใบเสนอราคาของงานช่างซัพไม่ครบ กรุณาโหลดใหม่หรือตรวจสิทธิ์');
  return { jobs: relevant, teams, quoteBy, payouts, matCost };
}
