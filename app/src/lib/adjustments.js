// รวมยอดปรับปรุงจากใบลดหนี้/ใบเพิ่มหนี้ (adjustment_notes) เข้าไปในรายงานต่าง ๆ
// เครื่องหมาย: ใบลดหนี้ (credit) = ลบ · ใบเพิ่มหนี้ (debit) = บวก · นับเฉพาะสถานะ "issued" (ยกเลิกไม่นับ)
// ผูกยอดกับ "วันที่ออกเอกสาร" (issue_date) เพื่อให้รายงานรายเดือนตรงกับงวดที่ปรับ
export function sumAdj(notes, inRangeFn) {
  const z = { base: 0, vat: 0, wht: 0, net: 0, total: 0, creditNet: 0, debitNet: 0, n: 0 };
  (notes || []).forEach((a) => {
    if (a.status !== "issued") return;
    if (inRangeFn && !inRangeFn(a.issue_date || a.created_at)) return;
    const sign = a.kind === "debit" ? 1 : -1;
    z.base += sign * (Number(a.base) || 0);
    z.vat += sign * (Number(a.vat_amt) || 0);
    z.wht += sign * (Number(a.wht_amt) || 0);
    z.net += sign * (Number(a.net) || 0);
    z.total += sign * (Number(a.total) || 0);
    if (sign < 0) z.creditNet += Number(a.net) || 0; else z.debitNet += Number(a.net) || 0;
    z.n += 1;
  });
  return z;
}
