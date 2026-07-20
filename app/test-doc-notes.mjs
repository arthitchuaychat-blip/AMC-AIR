// หมายเหตุ 2 ช่องบนเอกสารทุกใบ (กติกาเจ้าของ)
//   · note          = ลูกค้าเห็น · พิมพ์ลงเอกสารผ่าน DocSlip prop `terms`
//   · internal_note = หลังบ้านเท่านั้น · ห้ามพิมพ์ลงเอกสารเด็ดขาด
// เริ่มกรอกที่ BOQ แล้วติดไปกับเอกสารใบถัดไปตอนสร้าง (ใบเสนอ → ใบส่งของ/ใบแจ้งหนี้ → ใบเสร็จ)
//
// เกิดจริงมาแล้ว: ทั้ง 5 ใบส่ง terms={...} เข้า DocSlip มาตลอด แต่ DocSlip ไม่ได้รับ prop นี้
// หมายเหตุที่พิมพ์ไปเลยหายเงียบทุกใบ · และ 4 ใน 5 ใบไม่มีช่องให้กรอกด้วยซ้ำ
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const read = (f) => fs.readFileSync(f, "utf8");
const DOCS = [["BOQ", "BOQ.jsx"], ["ใบเสนอราคา", "Quotation.jsx"], ["ใบส่งของ/ใบแจ้งหนี้", "Invoices.jsx"], ["ใบวางบิล", "BillingNotes.jsx"], ["ใบเสร็จ", "Receipts.jsx"]];

console.log("\nหมายเหตุบนเอกสาร — ต้องมี 2 ช่องครบทุกใบ และพิมพ์เฉพาะช่องที่ลูกค้าเห็น:");

// 1) DocSlip ต้องรับ terms และพิมพ์ออกมา · และห้ามพิมพ์หมายเหตุภายในเด็ดขาด
const slip = read("src/components/DocSlip.jsx");
check("DocSlip รับ prop terms", /function DocSlip\(\{[^)]*\bterms\b/.test(slip),
  "ไม่รับ = ทุกใบส่งมาแล้วตกหาย (เกิดมาแล้วจริง)");
check("DocSlip พิมพ์กล่องหมายเหตุ", /\{terms &&[\s\S]{0,120}หมายเหตุ/.test(slip));
check("DocSlip ไม่พิมพ์หมายเหตุภายใน", !/internal_note|internalNote/.test(slip),
  "หมายเหตุภายในหลุดลงเอกสารลูกค้า = ผิดกติกาบ้าน (mig 055 มีไว้กันเรื่องนี้)");

// 2) ทุกใบต้องมีช่องกรอกทั้งคู่ และส่ง terms ไปพิมพ์
for (const [th, f] of DOCS) {
  const s = read("src/components/" + f);
  check(`${th}: มีช่องหมายเหตุ (ลูกค้าเห็น)`, /<DocNoteField/.test(s), "ไม่มีที่ให้กรอก คอลัมน์ note เลยเป็นค่าว่างตลอด");
  check(`${th}: มีช่องหมายเหตุภายใน`, /<InternalNoteField/.test(s));
  check(`${th}: ส่งหมายเหตุไปพิมพ์`, /terms=\{/.test(s));
}

// 3) สายส่งต่อ — ใบถัดไปต้องรับหมายเหตุจากใบก่อนหน้ามาตั้งต้น
const chain = [
  ["BOQ → ใบเสนอราคา", "Quotation.jsx", /note: b\.note \|\| ""/, /internal_note: b\.internal_note \|\| ""/],
  ["ใบเสนอราคา → ใบส่งของ/ใบแจ้งหนี้", "Invoices.jsx", /note: q\?\.note \|\| ""/, /internal_note: q\?\.internal_note \|\| ""/],
  ["ใบแจ้งหนี้ → ใบเสร็จ", "Receipts.jsx", /note: s\.note \|\| iv\?\.note \|\| ""/, /internal_note: s\.internal_note \|\| iv\?\.internal_note \|\| ""/],
];
for (const [label, f, reNote, reInt] of chain) {
  const s = read("src/components/" + f);
  check(`${label}: หมายเหตุติดไปด้วย`, reNote.test(s), "ใบถัดไปเริ่มด้วยหมายเหตุว่าง ต้องพิมพ์ใหม่ทุกใบ");
  check(`${label}: หมายเหตุภายในติดไปด้วย`, reInt.test(s));
}

// 4) state ของ "ใบใหม่" ต้องประกาศทั้ง 2 ฟิลด์ — ฟิลด์ที่ขาดจะโดน save เขียนค่าว่างทับ
//    (บั๊กคลาสเดียวกับฟอร์มลูกค้าล้าง credit_days และฟอร์มสินค้าล้าง web_published)
for (const [th, f] of DOCS) {
  const s = read("src/components/" + f);
  // ⚠️ ต้องนับวงเล็บเอง — ของใบแจ้งหนี้ setEd({...}) กินหลายบรรทัด regex บรรทัดเดียวจะมองไม่เห็น
  const seeds = [];
  for (let k = s.indexOf("setEd({"); k !== -1; k = s.indexOf("setEd({", k + 1)) {
    let depth = 0, end = k;
    for (let j = s.indexOf("{", k); j < s.length; j++) {
      if (s[j] === "{") depth++;
      else if (s[j] === "}") { depth--; if (depth === 0) { end = j; break; } }
    }
    const blk = s.slice(k, end + 1);
    if (/note:/.test(blk) && !/_edit: true/.test(blk)) seeds.push(blk);
  }
  check(`${th}: state ใบใหม่ประกาศ internal_note ครบทุกจุด`, seeds.length > 0 && seeds.every((x) => /internal_note:/.test(x)),
    seeds.length === 0 ? "ไม่เจอ state ใบใหม่ — โครงไฟล์เปลี่ยนไปแล้ว ตรวจตัวนี้ใหม่" : `${seeds.filter((x) => !/internal_note:/.test(x)).length} จุดขาด internal_note`);
}

// 5) ช่องค้นหาของทุกหน้าเอกสารต้องค้นหมายเหตุได้ — ไม่งั้นเขียนโน้ตไว้แล้วหาไม่เจอ
//    (เจ้าของใช้หมายเหตุภายในเก็บเลขอ้างอิงของซัพฯ แล้วต้องค้นกลับ)
const SEARCHABLE = [
  ["BOQ", "BOQ.jsx", "bo"], ["ใบเสนอราคา", "Quotation.jsx", "q"], ["ใบส่งของ/ใบแจ้งหนี้", "Invoices.jsx", "x"],
  ["ใบวางบิล", "BillingNotes.jsx", "b"], ["ใบเสร็จ", "Receipts.jsx", "x"], ["ใบสั่งซื้อ", "PurchaseOrders.jsx", "po"],
];
for (const [th, f, v] of SEARCHABLE) {
  const s = read("src/components/" + f);
  const line = s.split("\n").find((l) => /matchText\((?:search|q),/.test(l) && new RegExp(`${v}\\.(?:boq_no|quote_no|invoice_no|billing_no|receipt_no|po_no)`).test(l)) || "";
  check(`${th}: ช่องค้นหาค้นหมายเหตุได้`,
    line.includes(`${v}.note`) && line.includes(`${v}.internal_note`),
    !line ? "หาบรรทัดตัวกรองไม่เจอ — โครงไฟล์เปลี่ยน ตรวจตัวนี้ใหม่"
      : `ขาด ${[!line.includes(`${v}.note`) && "note", !line.includes(`${v}.internal_note`) && "internal_note"].filter(Boolean).join(" + ")}`);
}

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
