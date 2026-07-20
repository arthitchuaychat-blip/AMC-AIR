// BOQ = เอกสารภายใน พิมพ์ "ต้นทุนซื้อ" ออกมา แต่ใช้แม่แบบ DocSlip ตัวเดียวกับใบเสนอราคา/ใบแจ้งหนี้
// หัวกระดาษบริษัทเต็ม + บล็อกลูกค้า + หัวคอลัมน์เขียนว่า "หน่วยละ / จำนวนเงิน" เหมือนใบเสนอราคาเป๊ะ
// → หลุดมือไปถึงลูกค้าเมื่อไหร่ ลูกค้าอ่านต้นทุนของร้านเป็นราคาเสนอทันที
//
// กฎ: หน้าพิมพ์ BOQ ต้องติดป้าย "เอกสารภายใน" · หัวคอลัมน์ต้องบอกว่าเป็นต้นทุน · ไม่พิมพ์เลขผู้เสียภาษีของลูกค้า
// (ที่อยู่หน้างาน/ผู้ติดต่อยังต้องมี — คนประมาณราคาใช้จริง)
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const slip = fs.readFileSync("src/components/DocSlip.jsx", "utf8");
const boq = fs.readFileSync("src/components/BOQ.jsx", "utf8");
const css = fs.readFileSync("src/styles.css", "utf8");

console.log("\nBOQ = เอกสารภายใน (พิมพ์ต้นทุน):");

check("DocSlip รับ prop internal", /function DocSlip\(\{[^)]*\binternal\b/.test(slip));
check("แบนเนอร์อยู่ใน .doc-running (ซ้ำหัวทุกหน้าเอง)",
  /doc-running[\s\S]{0,220}internal && <div className="doc-internal"/.test(slip),
  "ถ้าอยู่นอก .doc-running จะขึ้นแค่หน้าแรก หน้า 2 เป็นต้นไปไม่มีป้าย");
check("มีสไตล์ .doc-internal และบังคับพิมพ์พื้นสี", /\.doc-internal\{/.test(css) && /print-color-adjust:exact/.test(css),
  "Chrome ตัดพื้นหลังทิ้งตอนพิมพ์ ป้ายจะจางจนมองไม่เห็น");

const call = boq.slice(boq.indexOf("titleTh=\"ใบประมาณการ (BOQ)\""), boq.indexOf("totals={<div className=\"doc-totals\">"));
check("หน้าพิมพ์ BOQ ติดป้ายเอกสารภายใน", /\binternal\b/.test(call), "ไม่ติด = กระดาษไม่มีอะไรบอกว่าห้ามส่งลูกค้า");
check("หัวคอลัมน์บอกว่าเป็นต้นทุน", /unitHead="ต้นทุน\/หน่วย"/.test(call) && /amountHead="ต้นทุนรวม"/.test(call),
  'ยังเขียน "หน่วยละ / จำนวนเงิน" เหมือนใบเสนอราคา อ่านแล้วเข้าใจว่าเป็นราคาขาย');
check("ไม่พิมพ์เลขผู้เสียภาษีของลูกค้าบน BOQ", !/taxId: printB\.customerTaxId/.test(boq),
  "เอกสารภายในไม่ต้องมีเลขภาษีลูกค้า และยิ่งทำให้ดูเหมือนเอกสารที่ออกให้ลูกค้า");
check("ยังพิมพ์ที่อยู่/ผู้ติดต่อหน้างาน (คนประมาณราคาต้องใช้)",
  /siteAddress: printB\.siteAddress/.test(boq) && /contactName: printB\.mainContactName/.test(boq));

// เอกสารที่ออกให้ลูกค้าจริงต้องไม่ติดป้ายนี้
for (const [th, f] of [["ใบเสนอราคา", "Quotation.jsx"], ["ใบส่งของ/ใบแจ้งหนี้", "Invoices.jsx"], ["ใบเสร็จ", "Receipts.jsx"], ["ใบวางบิล", "BillingNotes.jsx"]]) {
  const s = fs.readFileSync("src/components/" + f, "utf8");
  const i = s.indexOf("<DocSlip");
  const c = i < 0 ? "" : s.slice(i, i + 1800);
  check(`${th}: ไม่ติดป้ายเอกสารภายใน`, !/\sinternal[\s=]/.test(c), "เอกสารที่ส่งลูกค้าติดป้ายนี้ไม่ได้");
}

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
