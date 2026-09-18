// การ์ดดูข้อผิดพลาดจากเครื่องผู้ใช้ใน Settings (v849) — ปิดวงจร error tracking (v847 เก็บ → v849 ดูได้ในแอป)
//
// กติกา:
//   (1) การ์ดแสดงเฉพาะ admin/exec (ตรงกับ RLS select ของ client_errors) — role อื่นไม่เห็นแม้จะเปิด Settings ได้
//   (2) api.listClientErrors อ่านอย่างเดียว: select คอลัมน์ชัดเจน (ไม่ *) · เรียงล่าสุดก่อน · มี limit · ไม่มี delete/update
//   (3) ใช้คลาส audit-* เดิม (ไม่เพิ่ม CSS) · โหลดล้มต้องแจ้ง + ชี้ migration
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const fnBody = (src, head) => { const i = src.indexOf(head); if (i < 0) return ""; const j = src.indexOf("\n}", i); return src.slice(i, j < 0 ? undefined : j); };

const api = read("src/lib/api.js");
const st = read("src/components/Settings.jsx");

console.log("\napi.listClientErrors:");
const fn = fnBody(api, "export async function listClientErrors(");
check("มีฟังก์ชัน และ select คอลัมน์ชัดเจน (ไม่ใช่ *)", fn.includes('from("client_errors").select("id,at,build,url,kind,message,stack,component_stack,ua")'));
check("เรียงล่าสุดก่อน + จำกัดจำนวน", fn.includes('.order("at", { ascending: false }).limit(limit)'));
check("อ่านอย่างเดียว (ไม่มี delete/update/insert ใน listClientErrors)", !/\.(delete|update|insert|upsert)\(/.test(fn));
check("error โยนต่อ (ไม่กลืน)", fn.includes("if (error) throw error;"));
check("ไม่มีฟังก์ชันลบ client_errors ที่ไหนใน api.js", !/from\("client_errors"\)\.delete\(/.test(api));

console.log("\nSettings.jsx — ErrorsCard:");
check("import listClientErrors จาก api", /import \{[^}]*\blistClientErrors\b[^}]*\} from "\.\.\/lib\/api"/.test(st));
check("มีคอมโพเนนต์ ErrorsCard", st.includes("function ErrorsCard({ flash })"));
check("แสดงเฉพาะ admin/exec", /\{\["admin", "exec"\]\.includes\(role\) && <Fold [^\n]*<ErrorsCard flash=\{flash\} \/><\/Fold>\}/.test(st));
const card = st.slice(st.indexOf("function ErrorsCard({ flash })"), st.indexOf("export default function Settings("));
check("โหลดล้ม → flash + ชี้ migration (ไม่เงียบ)", card.includes('flash("โหลดข้อผิดพลาดไม่สำเร็จ: "') && card.includes("20260917120000_client_errors.sql"));
check("ใช้คลาส audit-* เดิม (ไม่เพิ่ม CSS ใหม่)", card.includes('className="audit-list"') && card.includes('className="audit-row"') && card.includes('className="audit-filters"'));
// ERR_KINDS ประกาศ "นอก" ฟังก์ชัน ErrorsCard → ต้องค้นทั้งไฟล์ ไม่ใช่แค่ตัวการ์ด
const kinds = st.slice(st.indexOf("const ERR_KINDS = {"), st.indexOf("function ErrorsCard({ flash })"));
check("กรองชนิด (render / window.error / unhandledrejection)", kinds.includes('"window.error"') && kinds.includes("unhandledrejection") && kinds.includes("render") && card.includes("ERR_KINDS"));
check("ว่างเปล่าแสดงข้อความชัด (ไม่ใช่ตารางว่างเฉย ๆ)", card.includes("ไม่มีข้อผิดพลาดที่เก็บไว้"));

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
