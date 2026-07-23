// ตัวกรองแอร์บนเว็บ (ยี่ห้อ / ประเภท / ขนาด) ต้องตรงกับฐานข้อมูลในแอปเสมอ
//
// ยี่ห้อ + ขนาด BTU: เว็บดึงจากสินค้าที่เผยแพร่จริง (web_products) อยู่แล้ว → ตรงอัตโนมัติ
// ประเภทแอร์: ในแอปเป็น "ช่องพิมพ์อิสระ" (datalist ไม่ใช่ตัวเลือกตายตัว) ค่าใน DB จึงมีตัวสะกดต่างกัน
//   เช่น "Floor Standing" / "Floor standing Type" / "ตู้ตั้งพื้น" = ความหมายเดียวกัน
// เดิมเว็บแปลด้วยแผนที่ตายตัว → ค่าที่ไม่อยู่ในแผนที่โชว์เป็นอังกฤษดิบปนไทย (เจ้าของเห็นในเมนูจริง)
// กฎ: ตัวสะกดเดียวกันต้องยุบเป็นตัวเลือกเดียว · ค่าใหม่ที่ยังไม่รู้จักต้องยังโชว์ (ไม่หายจากเมนู)
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const web = fs.readFileSync("../company-website/index.html", "utf8");

console.log("\nตัวกรองแอร์บนเว็บ:");

// ดึงฟังก์ชันจริงจากไฟล์เว็บมารัน
const grab = (start, end) => web.slice(web.indexOf(start), web.indexOf(end, web.indexOf(start)) + end.length);
const src = grab("const typeKey =", "const typeLabel = (s) => TYPE_TH[typeKey(s)] || String(s || \"\").trim();");
if (!src.includes("typeKey")) { console.log("  ✗ หา typeKey/typeLabel ในไฟล์เว็บไม่เจอ"); process.exit(1); }
const { typeKey, typeLabel } = new Function(src + "\n return { typeKey, typeLabel };")();

// ค่าจริงที่เห็นในเมนูหน้าเว็บ (ภาพหน้าจอเจ้าของ) — 2 ตัวท้ายเคยโชว์เป็นอังกฤษดิบ
check("Floor standing Type → ตู้ตั้งพื้น", typeLabel("Floor standing Type") === "ตู้ตั้งพื้น", `ได้ "${typeLabel("Floor standing Type")}"`);
check("Floor & Ceiling type → แขวน/ตั้งพื้น", typeLabel("Floor & Ceiling type") === "แขวน/ตั้งพื้น", `ได้ "${typeLabel("Floor & Ceiling type")}"`);
check("Wall type → ติดผนัง", typeLabel("Wall type") === "ติดผนัง");
check("Duct Type → ต่อท่อลม", typeLabel("Duct Type") === "ต่อท่อลม");
check("Cassette 1 way type → ฝังฝ้า 1 ทิศ", typeLabel("Cassette 1 way type") === "ฝังฝ้า 1 ทิศ");
check("Cassette 4 way type → ฝังฝ้า 4 ทิศ", typeLabel("Cassette 4 way type") === "ฝังฝ้า 4 ทิศ");

// ตัวสะกดต่างกัน ความหมายเดียวกัน ต้องยุบเป็นตัวเลือกเดียว
const same = (a, b) => typeLabel(a) === typeLabel(b);
check("ตัวพิมพ์เล็ก/ใหญ่ต่างกัน ยุบเป็นตัวเดียว", same("Floor Standing", "floor standing"));
check("มี/ไม่มีคำว่า Type ยุบเป็นตัวเดียว", same("Floor Standing", "Floor standing Type"));
check("ไทย/อังกฤษความหมายเดียวกัน ยุบเป็นตัวเดียว", same("Wall type", "ติดผนัง") && same("Duct Type", "ต่อท่อลม"));
check("คนละประเภทต้องไม่ถูกยุบรวมกัน",
  !same("Cassette 1 way type", "Cassette 4 way type") && !same("Wall type", "Duct Type"));

// ค่าใหม่ที่ยังไม่มีในแผนที่ ต้องยังโชว์ (ไม่หายจากเมนู) — นี่คือสิ่งที่ทำให้เว็บตามฐานข้อมูลเสมอ
check("ประเภทใหม่ที่ยังไม่รู้จัก ยังโชว์ข้อความดิบ", typeLabel("Multi Split Inverter") === "Multi Split Inverter");
check("ค่าว่างไม่กลายเป็นตัวเลือกขยะ", typeLabel("") === "" && typeLabel(null) === "");

// จุดที่ต้องใช้ชื่อมาตรฐานให้ครบ ไม่งั้นเลือกแล้วกรองไม่เจอ
check("กรองสินค้าเทียบด้วย typeLabel", /typeLabel\(p\.ac_type\) === prodType/.test(web),
  "ถ้ายังเทียบสตริงดิบ เลือกชื่อไทยแล้วจะไม่เจอสินค้าเลย");
check("เมนูประเภทยุบซ้ำก่อนสร้างตัวเลือก", /new Set\(types\.map\(typeLabel\)/.test(web));
check("การ์ดสินค้าโชว์ชื่อมาตรฐาน", /\[typeLabel\(p\.ac_type\), p\.energyLabel\]/.test(web));
check("ตัวกรองบริการใช้ชื่อมาตรฐานด้วย", /svcs\.map\(\(p\) => typeLabel\(p\.ac_type\)\)/.test(web));
check("จับคู่ค่าบริการติดตั้งใช้คีย์เดียวกัน", /const normType = \(s\) => typeKey\(s\)/.test(web),
  "ถ้า normType ยังเป็น lowercase เฉย ๆ แอร์ 'Floor standing Type' จะไม่เจอค่าติดตั้งที่แท็ก 'Floor Standing'");

// ตัวเลือกตายตัวใน markup (ก่อนสินค้าโหลด) ต้องใช้ชื่อมาตรฐาน ไม่งั้นเลือกแล้วกรองไม่เจอ
const staticSel = web.slice(web.indexOf('<select id="fltType"'), web.indexOf("</select>", web.indexOf('<select id="fltType"')));
const staticVals = [...staticSel.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
check("ตัวเลือกตายตัวใน markup ใช้ชื่อมาตรฐาน",
  staticVals.length > 0 && staticVals.every((v) => typeLabel(v) === v),
  `ค่าที่ไม่ตรง: ${staticVals.filter((v) => typeLabel(v) !== v).join(", ")}`);

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
