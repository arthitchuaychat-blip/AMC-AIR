// ยอดคงเหลือจริงอยู่ใน view material_stock (current_stock) ไม่ได้อยู่ในตาราง materials
// listMaterialsLite() อ่านจากตาราง materials ตรง ๆ (เร็วกว่า) → enrich() จึงตกไปใช้ init_stock
//   api.js: stock: Number(m.current_stock ?? m.init_stock ?? 0)
// init_stock = ยอดตั้งต้นตอนนำเข้าครั้งแรก ของที่เข้าคลังด้วยการซื้อจะเป็น 0 ตลอดกาล
//
// เกิดจริง: หน้าเตรียมวัสดุใช้ lite อย่างเดียว → คอลัมน์ "คงเหลือ" ผิด, คำเตือน "เบิกเกินคงเหลือ" ผิดฐาน
// และ smartSplit ดันของเข้าช่อง 🛒 สั่งซื้อ ทั้งที่ของอยู่ในคลังแล้ว = ร้านสั่งซื้อซ้ำของที่มีอยู่
//
// กฎ: หน้าไหน "โชว์/คิดเลขจาก .stock" ต้องเรียก listMaterials() มาทับด้วยเสมอ
import fs from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };

const dir = "src/components";
const files = fs.readdirSync(dir).filter((n) => n.endsWith(".jsx")).map((n) => path.join(dir, n));

console.log("\nยอดคงเหลือ — หน้าที่ใช้ .stock ต้องทับด้วยยอดจริงจาก listMaterials():");

let checked = 0;
// ⚠️ ต้องตัดคอมเมนต์ทิ้งก่อนตรวจ — ไม่งั้นคอมเมนต์ที่พูดถึง listMaterials() ทำให้ตัวตรวจผ่านทั้งที่โค้ดไม่ได้เรียกจริง
//    (เจอกับตัวเอง: เขียนคอมเมนต์อธิบายกฎไว้ แล้วตัวตรวจก็เลยมองไม่เห็นตอนโค้ดถูกถอดออก)
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

for (const f of files) {
  const s = stripComments(fs.readFileSync(f, "utf8"));
  if (!/listMaterialsLite/.test(s)) continue;
  // อ่าน .stock ของสินค้าจริง ๆ ไหม (ไม่นับ min_stock / init_stock / stockcount ฯลฯ)
  const usesStock = /(?<![\w_])(?:m|x|mat|material|pm)\??\.stock\b/.test(s);
  if (!usesStock) continue;
  checked++;
  const short = f.split(/[\\/]/).pop();
  const overlays = /listMaterials\(\)/.test(s) && /\.stock\b/.test(s) && /stockByCode|\.\.\.x, stock:|\.\.\.m, stock:/.test(s);
  check(`${short}: ทับ stock ด้วยยอดจริง`, overlays,
    "ใช้ listMaterialsLite แล้วอ่าน .stock แต่ไม่ได้ดึง listMaterials() มาทับ → เลขที่โชว์คือ init_stock (ยอดตั้งต้น) ไม่ใช่ยอดคงเหลือ");
}

if (checked === 0) { check("มีหน้าให้ตรวจ", false, "ไม่เจอหน้าที่ใช้ listMaterialsLite + .stock เลย — ตัวตรวจนี้อาจตกยุคแล้ว"); }

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
