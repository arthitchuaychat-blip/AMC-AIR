import { supabase } from './supabase';
import { listQuotations, expireOverdueQuotes } from './api';
const cache = new Map();
supabase.auth.onAuthStateChange(() => cache.clear());
export async function loadQuotationPage(filters, force = false) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  const key = session.user.id + ':' + JSON.stringify(filters);
  if (force) cache.clear();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30000) return hit.promise;
  const promise = (async () => {
    await expireOverdueQuotes();
    const { data, error } = await supabase.rpc('quotation_page', filters);
    if (error) throw error;
    // Never pass an empty scope to the legacy loader (it means load everything).
    const rows = data.nos.length ? await listQuotations({ nos: data.nos, fresh: Date.now() }) : [];
    const byNo = new Map(rows.map(q => [q.quote_no, q]));
    return { ...data, rows: data.nos.map(no => byNo.get(no)).filter(Boolean) };
  })();
  cache.set(key, { at: Date.now(), promise });
  try { return await promise; } catch (e) { cache.delete(key); throw e; }
}
