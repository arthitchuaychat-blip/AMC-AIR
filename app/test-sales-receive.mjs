// ฝ่ายขายรับสินค้าเข้าสต๊อก + บันทึกความเคลื่อนไหวได้ (เจ้าของสั่ง 2026-07-24)
//
// บทเรียนที่เทสต์นี้กันไว้: สิทธิ์ในแอปกับ RLS ในฐานข้อมูลเป็น "คนละชั้น"
//   เปิดแค่ในแอป  → ปุ่มขึ้น กดได้ แต่ insert โดน RLS ปฏิเสธ (คืน 0 แถว ไม่ใช่ error) = ของไม่เข้าสต๊อก
//   เปิดแค่ใน DB  → เมนูไม่โผล่ ปุ่มรับของพาไปหน้าที่เปิดไม่ได้
// จึงตรวจแบบไขว้: ทุก role ที่แอปให้ movements = edit ต้องเขียน transactions ได้จริงในระดับ policy
//
// และต้องเปิด "อ่าน" ด้วย ไม่ใช่แค่ "เขียน": poReceivedQty อ่าน transactions ไม่ได้ → คืน {} = ระบบคิดว่า
// ยังไม่เคยรับของใบนั้น → หน้ารับของเติมเต็มใบใหม่ทุกครั้ง = ทยอยรับ 2 รอบ ของเข้าซ้ำสองเด้ง
// (ยอดคงเหลือไม่เกี่ยว — view material_stock เป็น security definer ตั้งแต่ mig 127)
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };

console.log("\nฝ่ายขายรับของเข้าสต๊อก (สิทธิ์ในแอป ↔ RLS ใน DB):");

// ---------- ชั้นแอป: DEFAULT_PERMS ----------
const js = fs.readFileSync("src/lib/permissions.js", "utf8");
const head = js.indexOf("export const DEFAULT_PERMS");
const block = js.slice(head, js.indexOf("\n};", head));
const PERMS = {};
for (const m of block.matchAll(/^\s{2}(\w+):\s*\{([^}]*)\}/gm)) {
  PERMS[m[1]] = Object.fromEntries([...m[2].matchAll(/(\w+):\s*([EVN])\b/g)].map((kv) => [kv[1], kv[2]]));
}
check("อ่าน DEFAULT_PERMS ได้ครบทุก role", Object.keys(PERMS).length >= 10, `เจอ ${Object.keys(PERMS).length} role — regex เพี้ยน ไม่ใช่โค้ดถูก`);
check("ฝ่ายขาย: เมนูเบิก/คืน/ซื้อ/ตัดเสีย = แก้ไขได้", PERMS.sales?.movements === "E",
  "ปุ่ม 'รับสินค้าเข้าสต๊อก' บนใบสั่งซื้อพาไปหน้า movements — ปิดไว้ = กดแล้วไปต่อไม่ได้");
check("ฝ่ายขาย: ยังเห็นคลังสินค้าได้ (ใช้เลือกของตอนรับ)", PERMS.sales?.catalog === "E" || PERMS.sales?.catalog === "V");

// ---------- ชั้น DB: หา policy ที่ "มีผลจริง" (เลข migration สูงสุดชนะ) ----------
const DIR = "../supabase/migrations";
const migs = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort((a, b) => parseInt(a) - parseInt(b));
function latestPolicy(name, table) {
  let out = null;
  for (const f of migs) {
    const s = fs.readFileSync(`${DIR}/${f}`, "utf8");
    const i = s.indexOf(`create policy ${name} on ${table}`);
    if (i >= 0) out = { file: f, sql: s.slice(i, s.indexOf(";", i)) };
  }
  return out;
}
const rolesIn = (sql) => [...(sql || "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

const ins = latestPolicy("txn_insert", "transactions");
const sel = latestPolicy("txn_read", "transactions");
const del = latestPolicy("txn_delete", "transactions");
check("หา policy ล่าสุดของ transactions เจอครบ (insert/select/delete)", !!(ins && sel && del),
  `insert=${ins?.file} select=${sel?.file} delete=${del?.file}`);

check(`ฝ่ายขาย: เขียนความเคลื่อนไหวได้ (${ins?.file})`, rolesIn(ins?.sql).includes("sales"),
  "ไม่มี sales = กดรับของแล้วขึ้น new row violates row-level security policy for table transactions");
check(`ฝ่ายขาย: อ่านความเคลื่อนไหวได้ (${sel?.file})`, rolesIn(sel?.sql).includes("sales"),
  "อ่านไม่ได้ = material_stock (security_invoker) คืน current_stock เท่ากับ init_stock ทั้งคลัง " +
  "และต้นทุนเฉลี่ยถ่วงน้ำหนักตอนรับของจะถูกเขียนทับด้วยราคาล็อตล่าสุด");

// ---------- กติกาบ้าน: ลบถาวรไม่ใช่ของฝ่ายขาย ----------
check(`ลบความเคลื่อนไหวยังเป็น admin/exec/finance เท่านั้น (${del?.file})`,
  !rolesIn(del?.sql).includes("sales") && !rolesIn(del?.sql).includes("stock"),
  "ยกเลิกรับเข้า = ลบแถวซื้อ+เบิกทั้งชุด กระทบสต๊อก/ต้นทุนงาน — กติกาบ้านให้ธุรการ/บัญชีเท่านั้น");
check("ปุ่มยกเลิกในหน้าจอตรงกับ policy (canEditPast)",
  /const canEditPast = \["admin", "exec", "finance"\]\.includes\(role\)/.test(fs.readFileSync("src/components/Movements.jsx", "utf8")),
  "UI กับ RLS ไม่ตรงกัน = ปุ่มขึ้นแล้วกดไม่ติด หรือกดติดทั้งที่ไม่ควรได้");

// ---------- ตรวจไขว้: ทุก role ที่แอปให้ movements=edit ต้องเขียน transactions ได้จริง ----------
const insRoles = rolesIn(ins?.sql);
const editRoles = Object.entries(PERMS).filter(([, p]) => p.movements === "E").map(([r]) => r);
const orphans = editRoles.filter((r) => !insRoles.includes(r) && !new RegExp(`my_role\\(\\) = '${r}'`).test(ins?.sql || ""));
check(`ทุก role ที่กดบันทึกได้ในแอป เขียน DB ได้จริง (${editRoles.join(", ")})`, orphans.length === 0,
  `role ที่แอปเปิดให้แต่ RLS ปิด: ${orphans.join(", ")} — กดแล้วเด้ง error หรือบันทึกไม่ติดเงียบ ๆ`);

// ---------- "แก้ราคาตามบิลซัพฯ หลังรับของ" ต้องไม่รายงานสำเร็จปลอม ----------
// ปุ่มนี้เปิดให้ทุกคนที่แก้ใบ PO ได้ (can(role,"po","edit") = admin/exec/finance/stock/sales/hr)
// แต่ policy txn_admin_edit มีแค่ admin/exec/finance ⇒ ธุรการวัสดุ/ฝ่ายขายกดแล้ว RLS ปัด update ทิ้ง
// แบบ "ไม่มี error + 0 แถว" · ถ้านับว่าสำเร็จ จะไปเขียน materials.cost (สิทธิ์ผ่าน) ต่อทั้งที่ต้นทุนงานยังเก่า
const api = fs.readFileSync("src/lib/api.js", "utf8");
const rep = api.slice(api.indexOf("export async function repriceReceivedPo"), api.indexOf("export async function poReceivedQty"));
check("แก้ราคาหลังรับของ: นับเฉพาะแถวที่เปลี่ยนจริง (.select)", /\.update\(\{ unit_cost: want \}\)\.eq\("id", r\.id\)\.select\(/.test(rep),
  "ไม่ .select = RLS ปัดทิ้งแล้วยังนับว่าสำเร็จ (update ที่ถูกปฏิเสธคืน 0 แถว ไม่ใช่ error)");
check("แก้ราคาหลังรับของ: ล้มดัง ๆ เมื่อปรับต้นทุนไม่ผ่าน", /if \(!upd\?\.length\) throw new Error/.test(rep),
  "ต้นทุนคลังกับต้นทุนงานไม่ตรงกันเงียบ ๆ = กำไร/งานเพี้ยนโดยไม่มีใครรู้");
const po = fs.readFileSync("src/components/PurchaseOrders.jsx", "utf8");
check("หน้าใบสั่งซื้อไม่กลืน error ของการปรับต้นทุน", !/repriceReceivedPo\(poNo, items\)\.catch\(\(\) => 0\)/.test(po) && /repriceErr/.test(po),
  ".catch(() => 0) = ขึ้นข้อความว่าบันทึกสำเร็จทั้งที่ต้นทุนไม่ได้ปรับ");

// ---------- migration 174 ต้องไม่ไปแตะสิทธิ์ลบของตารางอื่น ----------
const mig = fs.readFileSync(`${DIR}/174_sales_receive_stock.sql`, "utf8");
const touched = ["materials", "purchase_orders", "po_items", "stock_counts"].filter((t) => new RegExp(`on ${t} for`).test(mig));
check("174 แตะเฉพาะ transactions (ไม่ไปรื้อ policy ตารางอื่น)", touched.length === 0, `แตะ: ${touched.join(", ")}`);
check("174 ไม่เปิดสิทธิ์ลบ/แก้ย้อนหลังเพิ่ม", !/on transactions for (delete|update)/.test(mig),
  "โจทย์คือ 'รับของ + บันทึก' ไม่ใช่ 'ลบ/แก้ย้อนหลัง'");

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
