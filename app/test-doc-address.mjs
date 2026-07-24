// ที่อยู่ในเอกสารมี 2 ช่อง และห้ามสลับกัน (กติกาเจ้าของ)
//   ช่อง 1 "ลูกค้า"    = ที่อยู่หลักที่จดทะเบียน (customerAddr) — ใช้ออกเอกสารบัญชี/ภาษี ต้องเป็นที่อยู่หลักเสมอ
//   ช่อง 2 "📍 หน้างาน" = ที่อยู่ไซต์งาน (siteAddress) — บอกว่าไปทำงานที่ไหน
//
// เกิดจริง: หน้าพิมพ์ทำถูกอยู่แล้ว แต่ "รูปเอกสารที่ส่งลูกค้าทาง LINE" (DocCapture) เขียน
//   address: siteAddress || customerAddr → ใบเดียวกันแต่ที่อยู่ในช่องภาษีกลายเป็นที่อยู่ไซต์งาน
//   และไม่มีช่องหน้างานเลย · ใบกำกับที่ยิงเข้า FlowAccount ก็ส่งที่อยู่ไซต์เป็นที่อยู่ผู้ซื้อ
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const read = (f) => fs.readFileSync("src/components/" + f, "utf8");
// ตัดคอมเมนต์ทิ้งก่อนตรวจ — ไม่งั้นคำอธิบายกฎในไฟล์จะทำให้เทสต์ผ่านเองโดยที่โค้ดยังผิด
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

console.log("\nที่อยู่ในเอกสาร (ช่องลูกค้า/ภาษี ≠ ช่องหน้างาน):");

// ---------- ทุกจุดที่ส่ง customer เข้า DocSlip ห้ามเอาที่อยู่ไซต์มาใส่ช่องที่อยู่หลัก ----------
const SALES = ["Quotation.jsx", "Invoices.jsx", "Receipts.jsx", "BillingNotes.jsx", "BOQ.jsx", "DocCapture.jsx"];
let sites = 0;
for (const f of SALES) {
  const src = strip(read(f));
  for (const m of src.matchAll(/customer=\{\{([^}]*)\}\}/g)) {
    const obj = m[1];
    const addr = (obj.match(/(?:^|[,{\s])address:\s*([^,}]+)/) || [])[1];
    if (!addr) continue;                                  // การ์ดในแอป (addr:) / ใบสั่งซื้อผู้ขาย — คนละเรื่อง
    if (/sup\?\./.test(addr)) continue;                   // ใบสั่งซื้อใช้ที่อยู่ผู้ขาย ไม่มีไซต์งาน
    sites++;
    check(`${f}: ช่องลูกค้าใช้ที่อยู่หลักล้วน (${addr.trim()})`,
      /customerAddr\s*$/.test(addr.trim()) && !/siteAddress/.test(addr),
      "เขียน siteAddress || customerAddr = พอมีไซต์งาน ที่อยู่ในช่องภาษีกลายเป็นที่อยู่หน้างาน");
  }
}
// 8 = หน้าพิมพ์ 5 ใบ (BOQ/ใบเสนอ/ใบแจ้งหนี้/ใบวางบิล/ใบเสร็จ) + รูปส่ง LINE 3 ใบ
check("ตรวจครบทุกใบที่ส่งเข้า DocSlip (≥ 8 จุด)", sites >= 8, `เจอแค่ ${sites} จุด — regex อาจไม่จับ ไม่ใช่ว่าโค้ดถูก`);

// ---------- ใบที่ส่งลูกค้าทาง LINE ต้องมีช่องหน้างานด้วย (ไม่ใช่ตัดที่อยู่ไซต์ทิ้งเฉย ๆ) ----------
const cap = strip(read("DocCapture.jsx"));
for (const [th, key] of [["ใบเสนอราคา", "q"], ["ใบแจ้งหนี้/ใบเสร็จ", "x"]]) {
  const n = (cap.match(new RegExp(`siteAddress: ${key}\\.siteAddress`, "g")) || []).length;
  check(`${th}: รูปที่ส่ง LINE ยังโชว์ช่องหน้างาน`, n > 0,
    "ตัด siteAddress ทิ้ง = ช่างไม่รู้ว่าไปทำงานที่ไหน ใบที่ส่งลูกค้าไม่ตรงกับใบที่พิมพ์");
}
check("รูปที่ส่ง LINE ใช้ผู้ติดต่อหลักในช่องลูกค้า (เหมือนหน้าพิมพ์)",
  !/contactName: [qx]\.contactName/.test(cap) && /contactName: [qx]\.mainContactName/.test(cap),
  "contactName/contactPhone เป็นตัวที่เอียงไปทางไซต์งานอยู่แล้ว (site ก่อน main)");

// ---------- ใบกำกับภาษีที่ยิงเข้า FlowAccount ----------
const rc = strip(read("Receipts.jsx"));
check("FlowAccount: ที่อยู่ผู้ซื้อบนใบกำกับ = ที่อยู่หลัก",
  /contactAddress: x\.customerAddr\b/.test(rc) && !/contactAddress:[^,\n]*siteAddress/.test(rc),
  "ส่งที่อยู่ไซต์งานเป็นที่อยู่ผู้ซื้อ = ใบกำกับภาษีผิดที่อยู่จดทะเบียน");

// ---------- แม่แบบพิมพ์ต้องแยก 2 ช่องจริง ----------
const slip = strip(fs.readFileSync("src/components/DocSlip.jsx", "utf8"));
check("DocSlip: ช่องลูกค้าแสดง customer.address", /customer\.address && <div className="doc-cust-line">/.test(slip));
check("DocSlip: ช่องหน้างานแยกออกมาต่างหาก (customer.siteAddress)",
  /doc-cust-site/.test(slip) && /customer\.siteAddress && <div className="doc-cust-line">/.test(slip));

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
