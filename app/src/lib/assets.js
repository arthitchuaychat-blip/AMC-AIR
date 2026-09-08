// สินทรัพย์/ครุภัณฑ์ — คิดค่าเสื่อมราคาแบบเส้นตรง (straight-line)
export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const ASSET_CATS = ["เครื่องมือช่าง", "ครุภัณฑ์สำนักงาน", "คอมพิวเตอร์/ไอที", "ยานพาหนะ", "เครื่องจักร/อุปกรณ์", "อื่นๆ"];

// จำนวนเดือนระหว่าง 2 วันที่ (ปัดเศษเดือนตามวันที่)
function monthsBetween(from, to) {
  if (!from) return 0;
  const a = new Date(from + "T00:00:00"), b = to || new Date();
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
}

// สรุปค่าเสื่อม ณ ปัจจุบัน (หรือถึงวันจำหน่าย)
export function depreciation(a) {
  const cost = Number(a.cost) || 0;
  const salvage = Math.min(Number(a.salvage) || 0, cost);
  const lifeM = Math.max(1, Math.round((Number(a.life_years) || 5) * 12));
  const depreciable = r2(cost - salvage);
  const perMonth = r2(depreciable / lifeM);
  const asOf = a.disposed && a.disposed_date ? a.disposed_date : null;
  const elapsed = Math.min(lifeM, monthsBetween(a.purchase_date, asOf ? new Date(asOf + "T00:00:00") : null));
  let accum = a.disposed ? depreciable : r2(Math.min(perMonth * elapsed, depreciable));
  const book = r2(cost - accum);
  const done = accum >= depreciable - 0.005;
  // วันคิดค่าเสื่อมครบ
  let endDate = null;
  if (a.purchase_date) { const d = new Date(a.purchase_date + "T00:00:00"); d.setMonth(d.getMonth() + lifeM); endDate = d; }
  return { cost, salvage, depreciable, perMonth, lifeM, elapsed, accum, book, done, endDate };
}

// ตารางค่าเสื่อมรายปี
export function scheduleByYear(a) {
  const { perMonth, lifeM, depreciable, cost, salvage } = depreciation(a);
  if (!a.purchase_date) return [];
  const start = new Date(a.purchase_date + "T00:00:00");
  const rows = [];
  let accum = 0;
  const years = Math.ceil(lifeM / 12);
  for (let y = 0; y < years; y++) {
    const mThisYear = Math.min(12, lifeM - y * 12);
    let dep = r2(perMonth * mThisYear);
    if (accum + dep > depreciable) dep = r2(depreciable - accum);
    accum = r2(accum + dep);
    rows.push({ year: start.getFullYear() + y, dep, accum, book: r2(cost - accum) });
  }
  return rows;
}
