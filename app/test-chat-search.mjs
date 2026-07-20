// ค้นข้อความในแชต LINE จากช่องค้นหา
// จอโหลดข้อความมาแค่ท้าย ๆ ของห้องที่เปิดอยู่ (CHAT_TAIL) จึงต้องค้นฝั่งเซิร์ฟเวอร์
//
// จุดที่พลาดง่ายและเทสต์นี้เฝ้าไว้:
//   1. ไม่ escape % _ \ ก่อนยัดเข้า ilike → ลูกค้าพิมพ์ "50%" แล้ว % กลายเป็น wildcard จับมาทั้งตาราง
//   2. ยิง query ทุกตัวอักษร (ไม่หน่วง) → พิมพ์ 10 ตัว = 10 query
//   3. ไม่ทิ้งผลที่กลับมาช้ากว่าคำค้นล่าสุด → ผลของคำเก่าทับผลคำใหม่ รายชื่อกระพริบผิด
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };

const api = fs.readFileSync("src/lib/api.js", "utf8");
const chat = fs.readFileSync("src/components/Chat.jsx", "utf8");

console.log("\nค้นข้อความในแชต:");

// ---------- รันฟังก์ชันจริงจาก api.js กับ supabase ปลอม ----------
const i = api.indexOf("export async function searchLineMessages");
const body = api.slice(i, api.indexOf("\n}", i) + 2).replace("export async function", "async function");
let captured = null;
const chain = (rows) => {
  const o = {
    select: () => o, order: () => o, limit: () => Promise.resolve({ data: rows, error: null }),
    ilike: (col, pat) => { captured = { col, pat }; return o; },
  };
  return o;
};
const ROWS = [
  { line_user_id: "U1", text: "ลด 50% ได้ไหม", created_at: "2026-07-20T10:00:00Z", direction: "in" },
  { line_user_id: "U1", text: "ลด 50% ไม่ได้ครับ", created_at: "2026-07-19T10:00:00Z", direction: "out" },
  { line_user_id: "U2", text: "สนใจ 50% off", created_at: "2026-07-18T10:00:00Z", direction: "in" },
];
const supabase = { from: () => chain(ROWS) };
const searchLineMessages = new Function("supabase", body + "; return searchLineMessages;")(supabase);

const hits = await searchLineMessages("50%");
check("escape % ก่อนส่งเข้า ilike", captured && captured.pat === "%50\\%%",
  `ส่งไป ${captured ? JSON.stringify(captured.pat) : "(ไม่ได้เรียก ilike)"} — ถ้าไม่ escape "50%" จะจับมาทั้งตาราง`);
check("ยุบเหลือห้องละ 1 ข้อความ", Object.keys(hits).length === 2, `ได้ ${Object.keys(hits).length} ห้อง`);
check("เก็บข้อความล่าสุดของห้องที่ตรง", hits.U1?.created_at === "2026-07-20T10:00:00Z",
  `ได้ ${hits.U1?.created_at} — ต้องเป็นข้อความใหม่สุด ไม่ใช่เก่าสุด`);
check("คำค้นสั้นกว่า 2 ตัวไม่ยิง query", Object.keys(await searchLineMessages("ล")).length === 0);
check("คืนค่าชนิดเดียวกันเสมอ (object ไม่ใช่ array)", !Array.isArray(await searchLineMessages("ล")),
  "คืน [] ตอนสั้น แต่คืน {} ตอนยาว → ฝั่งจอเช็ก hits[id] แล้วพังเงียบ");

// ---------- ฝั่งจอ ----------
check("หน่วงเวลาก่อนยิง (ไม่ยิงทุกตัวอักษร)", /setTimeout\([\s\S]{0,200}searchLineMessages/.test(chat));
check("ทิ้งผลที่กลับมาช้ากว่าคำค้นล่าสุด", /dropped/.test(chat) && /return \(\) => \{ dropped = true/.test(chat),
  "ไม่มีตัวกันผลเก่าทับ → พิมพ์เร็ว ๆ แล้วรายชื่อเด้งไปมา");
check("เอาผลค้นข้อความมารวมกับตัวกรองรายชื่อ", /msgHits\[c\.line_user_id\]/.test(chat));
check("โชว์ข้อความที่ตรงให้เห็นว่าเจอเพราะอะไร", /chat-convo-hit/.test(chat));
check("ช่องค้นหาบอกผู้ใช้ว่าค้นข้อความได้", /ข้อความในแชต/.test(chat));

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
