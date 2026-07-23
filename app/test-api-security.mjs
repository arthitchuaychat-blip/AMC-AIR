// ความปลอดภัยฝั่ง serverless (app/api/*) — ไม่มี build/เทสต์รันโค้ดจริง จึงตรวจที่ต้นฉบับ
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };

console.log("\nความปลอดภัย serverless:");

// ---------- 1) ลบบัญชี: ต้องลบ auth ก่อน profiles (cascade) ห้ามลบ profiles ก่อน ----------
const au = fs.readFileSync("api/admin-user.js", "utf8");
const del = au.slice(au.indexOf('action === "delete"'), au.indexOf('} else {', au.indexOf('action === "delete"')));
const authDel = del.indexOf('auth/v1/admin/users');
const profDel = del.indexOf('rest/v1/profiles');
check("ลบบัญชี: ลบ auth ก่อน (profiles cascade ตามเอง)",
  authDel !== -1 && (profDel === -1 || authDel < profDel),
  "ลบ profiles ก่อนแล้ว auth ล้มเพราะ FK = ชื่อ/role/ทีมหายถาวร บัญชีล็อกอินได้แต่กลายเป็นช่าง");
check("ลบบัญชี: ไม่ลบ profiles ตรง ๆ (ปล่อย cascade จัดการ)", !/profiles\?id=eq[^\n]*DELETE|method: "DELETE"[^\n]*profiles/.test(del) && del.indexOf('rest/v1/profiles') === -1,
  "ยังมี DELETE profiles ตรง ๆ อยู่ — เสี่ยงลบ profile ทิ้งทั้งที่ auth ยังอยู่");
check("ลบบัญชี: FK ค้าง = แจ้งให้ปิดใช้งานแทน ไม่ทำข้อมูลกำพร้า", /foreign key|violates/i.test(del) && /ปิดใช้งาน|เปลี่ยนตำแหน่ง/.test(del));

// หมายเหตุ: เคยมีเทสต์สิทธิ์แอดมินของแอป Mentor (api/mentor-auth.js) ตรงนี้
// The Top Mentor แยกออกไปเป็นโปรเจกต์อิสระแล้ว (repo the-top-mentor) และโค้ดถูกลบออกจาก repo นี้
// → เทสต์ย้ายตามไปอยู่ repo นั้น ที่นี่ไม่ต้องมี (เจ้าของสั่ง: แอป Mentor ไม่ต้องแตะ)

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
