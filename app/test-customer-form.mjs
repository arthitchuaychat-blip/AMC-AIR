// ฟอร์มลูกค้ามี 2 ที่ (Customers.jsx กับ CustomerFormModal.jsx) แต่ละที่ถือ "รายชื่อฟิลด์" ของตัวเอง
// ถ้าที่ไหนตกฟิลด์ที่ saveCustomer เขียนลง DB → แก้ลูกค้าจากที่นั่นครั้งเดียว ฟิลด์นั้นถูกล้างเงียบ ๆ
//
// เกิดจริงมาแล้ว 2 รอบ:
//   · email หายตั้งแต่แรก (หน้ารายละเอียดโชว์ช่องอีเมล แต่ไม่มีที่ให้กรอก)
//   · credit_days หายตอนเพิ่ม mig 159 — แก้ลูกค้าจากเมนู "ลูกค้า" ครั้งเดียว เครดิตเทอม 30 วันกลายเป็น 0
//     แล้ววันครบกำหนดของใบแจ้งหนี้ใบถัดไปเพี้ยน
// และไซต์ที่ไม่พก id → saveCustomer ลบไซต์ทิ้งสร้างใหม่ เอกสารเก่าทุกใบลืมไซต์ถาวร (กู้ไม่ได้)
import fs from "node:fs";

const FORMS = ["src/components/Customers.jsx", "src/components/CustomerFormModal.jsx"];
let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };

// ฟิลด์ที่ saveCustomer เขียนจริง — อ่านจากโค้ดจริง ไม่ได้ hardcode
const api = fs.readFileSync("src/lib/api.js", "utf8");
const i = api.indexOf("const fields = { type: cust.type");
const fieldsLine = api.slice(i, api.indexOf("\n", i));
const need = [...new Set([...fieldsLine.matchAll(/cust\.(\w+)/g)].map((m) => m[1]))].filter((f) => !["type", "name"].includes(f));

console.log("\nฟอร์มลูกค้า — ต้องมีครบทุกฟิลด์ที่ saveCustomer เขียน (" + need.join(", ") + "):");

for (const f of FORMS) {
  const s = fs.readFileSync(f, "utf8");
  const miss = need.filter((k) => !s.includes(k));
  check(f.split("/").pop() + ": ฟิลด์ครบ", miss.length === 0, "ขาด: " + miss.join(", ") + " → แก้ลูกค้าครั้งเดียวค่าพวกนี้ถูกล้าง");

  // ไซต์ที่โหลด "ของเดิม" มาแก้ ต้องพก id เดิมไปด้วย
  // (แถวเปล่าของฟอร์มใบใหม่ไม่ต้องมี id — จึงต้องดูเฉพาะบรรทัดที่ map จากข้อมูลจริง)
  // เฉพาะบรรทัดที่ "คัดลอกรูปแถวไซต์" มาใส่ state (มี site_name: x.site_name) ไม่ใช่ลูปวาดหน้าจอ
  const mapLines = s.split("\n").filter((l) => /\.sites\.map\(/.test(l) && /site_name: x\.site_name/.test(l));
  check(f.split("/").pop() + ": ไซต์เดิมพก id ไปด้วย",
    mapLines.length > 0 && mapLines.every((l) => l.includes("id: x.id")),
    mapLines.length === 0 ? "ไม่เจอจุดที่ map ไซต์เดิม"
      : "ไม่พก id → saveCustomer ลบไซต์ทิ้งสร้างใหม่ เอกสารเก่าลืมไซต์ถาวร (FK เป็น on delete set null)");
}

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
