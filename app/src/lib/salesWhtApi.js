import { supabase } from './supabase';
export async function listWhtEvidence(receiptNo) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from('sales_wht_evidence').select('*').order('receipt_no').range(offset, offset + 499);
    if (receiptNo) query = query.eq('receipt_no', receiptNo);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}
export async function saveWhtEvidence(row) {
  const { error } = await supabase.from('sales_wht_evidence').upsert(row, { onConflict: 'receipt_no' });
  if (error) throw error;
}
export async function uploadWhtEvidence(file) {
  if (!['application/pdf','image/jpeg','image/png'].includes(file.type) || file.size > 10*1024*1024) throw new Error('เลือก PDF, JPG หรือ PNG ขนาดไม่เกิน 10 MB');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  const path = `${user.id}/${crypto.randomUUID()}.${file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'}`;
  const { error } = await supabase.storage.from('sales-wht-evidence').upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}
export async function whtEvidenceUrl(path) {
  const { data, error } = await supabase.storage.from('sales-wht-evidence').createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}
