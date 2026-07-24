// อัลบั้มผลงาน: 1 อัลบั้มเก็บรูปได้ไม่จำกัด (mig 172 คอลัมน์ images)
//
// เดิม web_portfolio มีแค่ image_url → 1 รายการ = 1 รูป ทีมกราฟิกต้องสร้างหลายรายการต่อ 1 งาน
// กติกาที่ห้ามหลุด:
//   · image_url ต้องเป็น images[0] เสมอ — เว็บบันเดิลเก่า/og:image ยังอ่านคอลัมน์นี้
//   · ยังไม่รัน mig 172 หรืออัลบั้มเก่า (images ว่าง) ต้องไม่กลายเป็นอัลบั้มเปล่า → ถอยไปใช้ image_url
//   · แท็บอื่นในหน้าจัดการเว็บไซต์ (ปก/โลโก้/บทความ…) ต้องไม่ถูกเปลี่ยนพฤติกรรม
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const wm = fs.readFileSync("src/components/WebManage.jsx", "utf8");
const web = fs.readFileSync("../company-website/index.html", "utf8");
const mig = fs.readFileSync("../supabase/migrations/172_portfolio_album_images.sql", "utf8");

console.log("\nอัลบั้มผลงาน (หลายรูปต่ออัลบั้ม):");

// ---------- migration ----------
check("mig 172 เพิ่มคอลัมน์ images", /add column if not exists images text\[\]/.test(mig));
check("mig 172 ย้ายรูปเดิมเข้า images (รันซ้ำได้)",
  /set images = array\[image_url\]/.test(mig) && /coalesce\(array_length\(images, 1\), 0\) = 0/.test(mig),
  "ไม่ย้าย = อัลบั้มเก่ากลายเป็นว่างบนเว็บ");

// ---------- แอป: เปิดโหมดหลายรูปเฉพาะอัลบั้มผลงาน ----------
const pf = wm.slice(wm.indexOf('kind: "portfolio"'), wm.indexOf('kind: "clients"'));
check("แท็บอัลบั้มผลงานเปิด multiImage", /multiImage: true/.test(pf));
const others = wm.slice(wm.indexOf('kind: "clients"'));
check("แท็บอื่นไม่ถูกเปิด multiImage", !/multiImage: true/.test(others),
  "เปิดให้แท็บอื่นด้วยจะพังเพราะตารางอื่นไม่มีคอลัมน์ images");

// ---------- แอป: image_url ต้อง = รูปแรกเสมอ ----------
check("เพิ่มอัลบั้ม: image_url = รูปแรกของ images",
  /image_url: imgs\[0\] \|\| null, images: imgs/.test(wm),
  "ไม่ตรงกัน = เว็บเก่า/og:image โชว์รูปผิดหรือหาย");
check("แก้อัลบั้ม: image_url = รูปแรกของ images",
  /row\.images = edit\.imgs \|\| \[\]; row\.image_url = \(edit\.imgs \|\| \[\]\)\[0\] \|\| null/.test(wm));
check("แก้อัลบั้มเก่า (images ว่าง) ถอยไปใช้รูปปกเดิม",
  /b\.images\?\.length \? \[\.\.\.b\.images\] : \(b\.image_url \? \[b\.image_url\] : \[\]\)/.test(wm),
  "ไม่ถอย = เปิดแก้อัลบั้มเก่าแล้วบันทึก รูปหายทั้งอัลบั้ม");
check("อัปโหลดหลายไฟล์เรียงตามลำดับที่เลือก (ไม่ใช้ Promise.all)",
  /for \(const file of files\) urls\.push\(await uploadWebImage/.test(wm),
  "Promise.all จะสลับลำดับรูป ปกอาจไม่ใช่รูปที่ตั้งใจ");
check("บังคับต้องมีรูปก่อนเพิ่ม (โหมดอัลบั้มนับจาก imgs)",
  /cfg\.imageRequired && !\(cfg\.multiImage \? imgs\.length : img\)/.test(wm));
check("ช่องอัปโหลดรับหลายไฟล์เฉพาะโหมดอัลบั้ม", /multiple=\{!!cfg\.multiImage\}/.test(wm));
check("มีแถบจัดรูป (ย้ายลำดับ/ลบ/ป้ายปก)",
  /function PhotoStrip/.test(wm) && /wb-cover/.test(wm) && /onMove\(i, -1\)/.test(wm));

// ---------- เว็บ: อ่าน images + เปิดแกลเลอรีรายอัลบั้ม ----------
check("เว็บอ่านคอลัมน์ images", /Array\.isArray\(x\.images\) \? x\.images : \[\]/.test(web));
check("เว็บถอยไปใช้ image_url เมื่อยังไม่มี images",
  /imgs\.length \? imgs : \(x\.image_url \? \[x\.image_url\] : \[\]\)/.test(web),
  "ยังไม่รัน mig 172 แล้วเว็บต้องไม่ว่างเปล่า");
check("การ์ดอัลบั้มที่มีหลายรูปกดเปิดได้", /onclick="openAlbum\(/.test(web));
check("มีป้ายจำนวนรูปบนการ์ด", /port-n/.test(web) && /\$\{n\} รูป/.test(web));
check("แกลเลอรีรายอัลบั้มโชว์เฉพาะรูปของอัลบั้มนั้น",
  /function openAlbum\(i\)[\s\S]{0,240}\(a\.imgs \|\| \[a\.img\]\)\.map/.test(web));
check("ดูผลงานทั้งหมด = กางทุกรูปของทุกอัลบั้ม",
  /function openGal\(\)[\s\S]{0,240}PF\.flatMap\(/.test(web));
check("หน้าแรกสุ่มจากทุกรูปในทุกอัลบั้ม",
  /pfPool = shuffle\(PF\.flatMap\(/.test(web),
  "สุ่มจากรูปปกอย่างเดียว = รูปอื่นในอัลบั้มไม่เคยได้โชว์");
check("หัวแกลเลอรีเปลี่ยนตามอัลบั้มได้", /id="galHead"/.test(web));
check("หัวแกลเลอรีเซ็ตด้วย textContent (ชื่ออัลบั้มพิมพ์เอง ห้ามยัดเป็น HTML)",
  /galHead"\)\.textContent =/.test(web) && !/galHead"\)\.innerHTML/.test(web));
check("ชื่อ/ลิงก์รูปถูก escape ก่อนใส่ markup",
  /const escA = /.test(web) && /alt="\$\{t\}"/.test(web) && /src="\$\{escA\(p\.img\)\}"/.test(web),
  'ชื่ออัลบั้มที่มีเครื่องหมาย " จะทำการ์ดพัง');

// ---------- ยังไม่รัน mig 172 ต้องบันทึกได้ (ถอยไปบันทึกรูปปกใบเดียว) ----------
const api = fs.readFileSync("src/lib/api.js", "utf8");
const sw = api.slice(api.indexOf("export async function saveWebItem"), api.indexOf("export async function deleteWebItem"));
check("saveWebItem มี fallback ตอนยังไม่มีคอลัมน์ images",
  /\/images\/i\.test\(error\.message/.test(sw) && /delete r\.images/.test(sw),
  "ไม่มี fallback = ทีมกราฟิกกดเพิ่มอัลบั้มก่อนรัน SQL แล้วเด้ง error ดิบ");

// ---------- 3 จุดที่งานตรวจแบบหักล้าง (adversarial) จับได้ ----------
check("บันทึกได้แค่รูปปกต้องเตือน ไม่ใช่ขึ้นสำเร็จเงียบ ๆ",
  /if \(!error && kept > 1\) degraded = "images"/.test(api) && /return degraded \? \{ degraded \} : null/.test(api) && /res\?\.degraded === "images"/.test(wm),
  "เงียบ = อัปโหลด 12 รูปแล้วขึ้น 'เพิ่มแล้ว ✓' ทั้งที่เก็บรูปเดียว อีก 11 รูปกำพร้าใน storage กู้จากจอไม่ได้");
check("บันทึกไม่ครบแล้วคงรูปไว้ในฟอร์ม (กด SQL แล้วบันทึกซ้ำได้)",
  /degraded === "images"\) \{ await load\(\); flash/.test(wm),
  "ล้างรูปทิ้ง = ที่อัปโหลดไปแล้วหายจากจอ ต้องอัปใหม่ทั้งหมด");
check("ลบรูปหมดอัลบั้มแล้วบันทึกไม่ได้ (image_url เป็น NOT NULL)",
  /if \(cfg\.multiImage && cfg\.imageRequired && !\(edit\.imgs \|\| \[\]\)\.length\) return flash\("อัลบั้มต้องมีอย่างน้อย 1 รูป/.test(wm),
  "ปล่อยผ่าน = ยิง image_url null ชน NOT NULL แล้วเด้ง error ดิบจากฐานข้อมูล");
check("สไลด์หน้าแรกนับจำนวนรูป ไม่ใช่จำนวนอัลบั้ม",
  /pfPhotos = PF\.reduce/.test(web) && /pfPhotos > 3/.test(web),
  "นับอัลบั้ม = พอยุบเหลือ ≤3 อัลบั้ม (ซึ่งคือผลของฟีเจอร์นี้) สไลด์หน้าแรกค้างถาวร");
check("ป้ายบอกให้รัน migration 172 (เหมือนแท็บ services/reviews)", /ต้องรัน migration 172 ก่อน/.test(wm));

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
