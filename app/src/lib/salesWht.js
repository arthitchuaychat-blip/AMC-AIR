// One calculation for quotation, invoice, receipt and adjustments.
// Business default: company customers, service category only; classification is not tax advice.
export const money = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export function whtRate(value) {
  if (value == null || value === '') return 3;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('อัตราหัก ณ ที่จ่ายต้องอยู่ระหว่าง 0–100%');
  return money(n);
}
export const companyCustomer = type => type === 'company';
export function whtEnabled(doc, type) {
  return companyCustomer(type) && (doc?.wht_enabled ?? doc?.wht ?? (Number(doc?.wht_amt) > 0));
}
export function salesItems(quote, enabled = quote?.wht ?? true) {
  return (quote?.items || []).map(it => {
    const price = Number(it.price_show ?? it.unit_price) || 0;
    return { code: it.item_code || it.code || null, name: it.name, desc: it.description || '', unit: it.unit,
      kind: it.kind || 'material', qty: Number(it.qty), price, discount: Number(it.discount) || 0,
      amount: money(Number(it.qty) * price - (Number(it.discount) || 0)),
      wht: companyCustomer(quote?.customerType) && !!enabled && it.kind === 'service' };
  });
}
export function enrichSalesItems(items, quote) {
  return (items || []).map((it, index) => {
    const src = (quote?.items || []).find(x => (it.code && x.item_code === it.code) || (!it.code && x.name === it.name))
      || (quote?.items?.[index]?.name === it.name ? quote.items[index] : null);
    return { ...it, kind: it.kind || src?.kind || 'unknown' };
  });
}
export function calculateSalesWht({ items = [], base = 0, total = 0, customerType, enabled = true, rate = 3 }) {
  const appliedRate = whtRate(rate);
  const on = companyCustomer(customerType) && !!enabled;
  const normalized = items.map(it => ({ ...it, amount: money(Number(it.amount) || 0), wht: on && it.kind === 'service' }));
  const all = normalized.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const services = normalized.filter(it => it.kind === 'service').reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const ratio = all > 0 ? Math.max(0, Math.min(1, services / all)) : 0;
  const taxableBase = on ? money(Math.max(0, Number(base) || 0) * ratio) : 0;
  const amount = money(taxableBase * appliedRate / 100);
  return { enabled: on, rate: appliedRate, items: normalized, ratio, taxableBase, amount, net: money((Number(total) || 0) - amount) };
}
export function receiptWhtSummary(receipts, evidence = []) {
  const byNo = new Map(evidence.map(e => [e.receipt_no, e]));
  return receipts.filter(r => r.status !== 'cancelled' && Number(r.wht_amt) > 0).map(r => {
    const e = byNo.get(r.receipt_no);
    return { ...r, evidence: e, evidenceState: r.status !== 'paid' ? 'expected' : e?.status || 'waiting', taxDate: r.paid_on || r.issue_date };
  });
}
