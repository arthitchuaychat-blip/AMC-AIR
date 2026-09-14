import { supabase } from './supabase';
import { cacheRevision, onDataInvalidated } from './cacheSignals';

const cache = new Map();
let authRevision = 0;
let actorId;
onDataInvalidated(() => cache.clear());
supabase.auth.onAuthStateChange((event, session) => {
  const next = session?.user?.id || null;
  const changed = actorId !== undefined && actorId !== next;
  actorId = next;
  if (changed || event === 'SIGNED_OUT' || event === 'USER_UPDATED') { authRevision++; cache.clear(); }
});

export async function loadBoqPage(filters, force = false) {
  const authAtStart = authRevision;
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session || authAtStart !== authRevision || (actorId !== undefined && actorId !== session.user.id)) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  const key = session.user.id + ':' + JSON.stringify(filters);
  if (force) cache.clear();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30000) return hit.promise;
  const revision = cacheRevision();
  const promise = (async () => {
    const { data, error } = await supabase.rpc('boq_page', filters);
    if (error) throw error;
    if (authAtStart !== authRevision || revision !== cacheRevision()) throw new Error('ข้อมูลมีการเปลี่ยนแปลง กรุณาลองใหม่');
    if (!data || !Array.isArray(data.rows) || !Number.isFinite(data.total) || !data.links) throw new Error('ข้อมูล BOQ ไม่ครบ กรุณาลองใหม่');
    return { ...data, rows: data.rows.map(row => {
      const address = (row.siteAddress || row.customerAddr || '').trim();
      return { ...row, mapUrl: row.mapUrl || (address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address) : null) };
    }) };
  })();
  cache.set(key, { at: Date.now(), promise });
  try { return await promise; }
  catch (e) { if (cache.get(key)?.promise === promise) cache.delete(key); throw e; }
}
