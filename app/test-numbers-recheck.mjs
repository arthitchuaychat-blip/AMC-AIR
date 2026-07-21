// บั๊กตัวเลข dashboard/งาน/เว็บ/แชต ที่งานกวาดเจอ
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const api = fs.readFileSync("src/lib/api.js", "utf8");
const jo = fs.readFileSync("src/components/JobOrders.jsx", "utf8");

console.log("\nตัวเลข dashboard/งาน/เว็บ/แชต:");

// ---------- #2 dashboard "ยอดค้างจ่าย" ต้องหักยอดจ่ายบางส่วน = ตรงกับเมนูค้างจ่าย ----------
const dash = api.slice(api.indexOf("export async function dashboardActionLite"), api.indexOf("export async function listPayables"));
check("dashboard: อ่าน paid_amount ของใบเบิก", /expense_requests"\)\.select\("id,status,amount,paid_amount/.test(dash),
  "ไม่อ่าน paid_amount = หักยอดจ่ายบางส่วนไม่ได้");
check("dashboard: ใบเบิกทั่วไปหักยอดจ่ายแล้ว", /amount\) \|\| 0\) - \(Number\(x\.paid_amount\) \|\| 0\)/.test(dash),
  "นับเต็มหน้าใบ = การ์ดสูงกว่าเมนูค้างจ่าย");
check("dashboard: PO ปันยอดจ่ายผ่านใบเบิก (expPaidLeft) เหมือน listPayables", /expPaidLeft/.test(dash),
  "ไม่ปันยอดจ่าย = PO ที่จ่ายบางส่วนยังนับเต็ม");

// รันสูตร dashboard vs listPayables ด้วยข้อมูลชุดเดียวกัน — ต้องได้ยอดค้างจ่ายเท่ากัน
// PO-1 (received, vat) ยอด 1000×1.07=1070 ผูกใบเบิก E1 จ่ายแล้ว 500 → ค้าง 570
// ใบเบิก E2 ทั่วไป 300 จ่ายแล้ว 100 → ค้าง 200 · รวมค้างจ่าย (เฉพาะ 2 ส่วนนี้) = 770
const pos = [{ po_no: "PO-1", status: "received", vat: true, expense_id: "E1", paid_at: null }];
const poi = [{ po_no: "PO-1", qty: 10, price: 100 }];
const exp = [{ id: "E1", status: "approved", amount: 1070, paid_amount: 500 }, { id: "E2", status: "approved", amount: 300, paid_amount: 100 }];
const poTotal = {}; poi.forEach((it) => { poTotal[it.po_no] = (poTotal[it.po_no] || 0) + it.qty * it.price; });
// dashboard สูตรใหม่
const expById = Object.fromEntries(exp.map((x) => [x.id, x]));
const expPaidLeft = {}; let poPayable = 0;
pos.filter((x) => x.status !== "cancelled" && !x.paid_at && (x.status === "received" || x.expense_id)).forEach((x) => {
  const gross = (poTotal[x.po_no] || 0) * (x.vat ? 1.07 : 1); let paid = 0;
  if (x.expense_id) { if (!(x.expense_id in expPaidLeft)) expPaidLeft[x.expense_id] = Number(expById[x.expense_id]?.paid_amount) || 0; paid = Math.min(gross, expPaidLeft[x.expense_id]); expPaidLeft[x.expense_id] = Math.round((expPaidLeft[x.expense_id] - paid) * 100) / 100; }
  poPayable += Math.max(0, Math.round((gross - paid) * 100) / 100);
});
const poExpIds = new Set(pos.map((x) => x.expense_id).filter(Boolean));
const approvedExpenseSum = exp.filter((x) => x.status === "approved" && !poExpIds.has(x.id)).reduce((a, x) => a + Math.max(0, (Number(x.amount) || 0) - (Number(x.paid_amount) || 0)), 0);
check("dashboard: ยอดค้างจ่ายหักงวดจ่ายแล้วถูก (PO 570 + ใบเบิก 200 = 770)",
  Math.abs(poPayable + approvedExpenseSum - 770) < 0.01, `ได้ ${poPayable + approvedExpenseSum}`);

// ---------- #3 ป้ายสั่งของซ่อนในโหมดจอช่าง ----------
check("ป้ายสั่งของซ่อนในโหมดจอช่าง (fieldOnly)", /!fieldOnly && jo\.quote_no && \(\(\) =>/.test(jo),
  "ช่างไม่โหลด docLinks → ป้ายแดง 'ยังไม่สั่งของ' ตลอด ไม่มีความหมาย");

// ---------- #7 listWebOrders แบ่งหน้า ----------
const lwo = api.slice(api.indexOf("export async function listWebOrders"), api.indexOf("export async function listWebOrders") + 400);
check("listWebOrders แบ่งหน้า (_fetchAll + order)", /_fetchAll\(\(f, t\) => supabase\.from\("web_orders"\)/.test(lwo) && /\.order\("id"\)/.test(lwo),
  "ไม่แบ่งหน้า = เกิน 1000 ใบ ใบเก่าหาย + นับตามสถานะผิด");

// ---------- #9 ตัวกรองวันที่ใบงานใช้วันที่ท้องถิ่น ----------
check("jobDates ใช้ ymd (วันที่ท้องถิ่น) ไม่ใช่ toISOString (UTC)",
  /const ds = \(jo\.visits[\s\S]{0,120}ymd\(new Date\(s\)\)/.test(jo) && !/visits[\s\S]{0,60}toISOString\(\)\.slice/.test(jo),
  "แปลง UTC = งานเริ่มก่อน 07:00 ไทยหล่นไปวันก่อนหน้า หายจากตัวกรอง");

// ---------- #8 team-chat unread ถามทีละห้อง ไม่ใช่ 500 ก้อนเดียว ----------
const lcr = api.slice(api.indexOf("export async function listChatRooms"), api.indexOf("export async function listChatRooms") + 2600);
check("team-chat: นับยังไม่อ่านทีละห้องด้วย count (ไม่ใช่ 500 ก้อนเดียว)",
  /count: "exact", head: true[\s\S]{0,40}\.eq\("room_id", r\.id\)\.gt\("created_at", lr\)/.test(lcr),
  "500 ก้อนเดียว = ห้องเงียบหลุดหน้าต่าง ป้ายยังไม่อ่าน = 0 ทั้งที่มีของค้าง");
check("team-chat: ไม่ใช้ limit(500) ก้อนเดียวแล้ว", !/\.in\("room_id", ids\)[\s\S]{0,80}limit\(500\)/.test(lcr));

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
