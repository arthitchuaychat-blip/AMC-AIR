// เก็บ error จากเครื่องผู้ใช้ (v847) — "รู้ปัญหาก่อนพนักงานมาบอก" โดยไม่ละเมิดเจตนาเดิมเรื่องความเป็นส่วนตัว
//
// กติกาที่ต้องคงไว้ตลอด:
//   (1) ตัวรายงานห้ามโยน error ออกจากตัวเอง (ทั้งฟังก์ชันอยู่ใน try/catch) — ไม่งั้นตัวรายงาน error จะทำหน้าพังเพิ่ม
//   (2) เก็บใน Supabase ของเราเอง ไม่ส่งบริการภายนอก · ตัด message/stack สั้น · ไม่เก็บ props/state
//   (3) จำกัดอัตรา (ซ้ำใน 1 นาทีส่งครั้งเดียว · ≤10/นาที) · ข้าม chunk error หลัง deploy (รีโหลดเองอยู่แล้ว)
//   (4) ติดตั้ง global hook ที่ main.jsx และ ErrorBoundary รายงาน render error
//   (5) migration: insert ได้เฉพาะของตัวเอง · อ่านได้เฉพาะ admin/exec
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const er = read("src/lib/errorReport.js");
const main = read("src/main.jsx");
const eb = read("src/components/ErrorBoundary.jsx");
const app = read("src/App.jsx");
const mig = read("../supabase/migrations/20260917120000_client_errors.sql");

console.log("\nlib/errorReport.js:");
const body = er.slice(er.indexOf("export async function reportClientError"), er.indexOf("export function installGlobalErrorReporting"));
check("reportClientError ครอบทั้งตัวด้วย try/catch (ห้ามพังเอง)", /^\s*try \{/m.test(body) && /\} catch \{/.test(body));
check("ตัด message ≤500 / stack ≤1500 / componentStack ≤1500 / ua ≤200", body.includes(".slice(0, 500)") && (body.match(/\.slice\(0, 1500\)/g) || []).length >= 2 && body.includes(".slice(0, 200)"));
check("ไม่เก็บ props/state/ฟอร์ม (ไม่มี JSON.stringify ของ object ใด ๆ)", !/JSON\.stringify/.test(body));
check("จำกัดอัตรา: ซ้ำใน 60 วิส่งครั้งเดียว + เพดานต่อนาที", body.includes("< 60000") && body.includes("sentThisMinute >= 10"));
check("ข้าม chunk error หลัง deploy (รีโหลดเองอยู่แล้ว)", /CHUNK_RE\.test\(message\)\) return/.test(body));
check("ส่งเข้าตาราง client_errors ของเราเอง ไม่มี fetch ออกโดเมนอื่น", body.includes('from("client_errors").insert(') && !/fetch\(\s*["']https?:/.test(er));
check("ไม่มี user (ยังไม่ล็อกอิน) → ไม่ส่ง (RLS ให้เฉพาะของตัวเอง)", body.includes("if (!user) return;"));
check("installGlobalErrorReporting ติดตั้งครั้งเดียว (กันซ้ำด้วย __amcErrHooked) + จับ error และ unhandledrejection", er.includes("window.__amcErrHooked") && er.includes('addEventListener("error"') && er.includes('addEventListener("unhandledrejection"'));

console.log("\nจุดติดตั้ง:");
check("main.jsx เรียก installGlobalErrorReporting() ก่อน render", main.includes("installGlobalErrorReporting();") && main.indexOf("installGlobalErrorReporting();") < main.indexOf("ReactDOM.createRoot("));
check("ErrorBoundary รายงาน render error พร้อม componentStack", eb.includes('reportClientError("render", err, { componentStack: info?.componentStack })'));
check("App.jsx ประกาศ window.__amcBuild = BUILD (รู้ว่าเวอร์ชันไหนพัง)", app.includes("window.__amcBuild = BUILD"));

console.log("\nmigration 20260917120000_client_errors.sql:");
check("สร้างตาราง client_errors (if not exists) + เปิด RLS", /create table if not exists public\.client_errors/.test(mig) && /enable row level security/.test(mig));
check("insert ได้เฉพาะแถวของตัวเอง (user_id = auth.uid())", /for insert to authenticated\s+with check \(user_id = auth\.uid\(\)\)/.test(mig));
check("อ่านได้เฉพาะ admin/exec", /for select to authenticated\s+using \(my_role\(\) in \('admin', 'exec'\)\)/.test(mig));

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
