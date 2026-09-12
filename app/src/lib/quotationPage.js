import { supabase } from './supabase';
import { hydrateQuotationBundle } from './api';
import { onDataInvalidated } from './cacheSignals';
const cache = new Map();
onDataInvalidated(() => cache.clear());
supabase.auth.onAuthStateChange(() => cache.clear());
export async function loadQuotationPage(filters, force = false) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  const key = session.user.id + ':' + JSON.stringify(filters);
  if (force) cache.clear();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30000) return hit.promise;
  const promise = (async () => {
    const { data, error } = await supabase.rpc('quotation_page_bundle', filters);
    if (error) throw error;
    const { bundle, ...page } = data;
    const rows = hydrateQuotationBundle(bundle);
    const byNo = new Map(rows.map(q => [q.quote_no, q]));
    if (page.nos.some(no => !byNo.has(no))) throw new Error('ข้อมูลใบเสนอราคาไม่ครบ กรุณาโหลดใหม่');
    return { ...page, rows: page.nos.map(no => byNo.get(no)) };
  })();
  cache.set(key, { at: Date.now(), promise });
  try { return await promise; } catch (e) { if (cache.get(key)?.promise === promise) cache.delete(key); throw e; }
}
