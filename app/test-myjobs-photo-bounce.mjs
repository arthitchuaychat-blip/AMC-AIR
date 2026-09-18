// v855 — ช่าง (มือถือ Android) พิมพ์ข้อความในความเคลื่อนไหวได้ แต่ "เลือกรูปแล้วเด้งออก"
// สาเหตุ: MyJobs โหลดใหม่เมื่อ visibilitychange → visible และระหว่าง loading ถอดรายการงานทั้งหมดออกจากจอ
//   Android เปิดตัวเลือกรูป/กล้องเป็นแอปแยก (หน้าเว็บถูกซ่อน) → เลือกเสร็จกลับมา = โหลดใหม่ทันที → กล่องแนบรูปถูกทำลาย รูปหาย
//   iPhone/คอม ตัวเลือกรูปไม่ซ่อนหน้าเว็บ · พิมพ์ข้อความไม่ได้ออกจากหน้า → จึงไม่เป็น · ไม่มี JS error (client_errors ว่าง) เพราะไม่ใช่โค้ดพัง
import fs from "node:fs";
import assert from "node:assert/strict";
const norm = (s) => s.replace(/\r\n/g, "\n");
const MJ = norm(fs.readFileSync("src/components/MyJobs.jsx", "utf8"));
const TL = norm(fs.readFileSync("src/components/JobTimeline.jsx", "utf8"));
let pass = 0, fail = 0;
const check = (name, fn) => { try { fn(); console.log("  ✓ " + name); pass++; } catch (e) { console.log("  ✗ " + name + "\n      " + (e.message || e)); fail++; } };
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, "ไม่เจอ " + a); const j = src.indexOf(b, i + a.length); assert.ok(j > i, "ไม่เจอจุดจบ " + b); return src.slice(i, j); };

console.log("\nMyJobs — กลับเข้าแอปต้องไม่ถอดการ์ดงานออกจากจอ:");
const load = between(MJ, "async function load(force = false, silent = false) {", "\n  React.useEffect(() => { load();");
check("กลับเข้าแอป (visibilitychange) = โหลดแบบเงียบ load(true, true)", () => {
  assert.ok(MJ.includes('if (document.visibilityState === "visible") load(true, true);'));
  assert.ok(!MJ.includes('if (document.visibilityState === "visible") load(true);'));
});
check("โหลดเงียบ + มีรายการบนจอแล้ว → ไม่ setLoading(true) (ตัวที่ทำให้รายการทั้งหมดถูกถอด)", () => {
  assert.ok(load.includes("const quiet = silent === true && listRef.current.length > 0;"));
  assert.ok(load.includes("if (!quiet) setLoading(true);"));
  assert.ok(!/\n\s*setLoading\(true\); setLoadError\(""\);/.test(load), "ยัง setLoading(true) แบบไม่มีเงื่อนไข");
  assert.ok(MJ.includes("React.useEffect(() => { listRef.current = list; }, [list]);"), "listRef ต้องตามค่า list ล่าสุด (effect visibility ไม่ผูกกับ list)");
});
check("โหลดเงียบพลาด (เน็ตหน้างานสะดุด) → เก็บรายการเดิมไว้ ไม่ล้างจอ/ไม่ขึ้น error", () => {
  assert.ok(load.includes("if (seq === loadSeq.current && !quiet) { setList([]); setLoadError("));
});
check("ครั้งแรก/กดปุ่มรีเฟรชเอง ยังขึ้นกำลังโหลดตามเดิม (silent ต้องส่งมาเป็น true เท่านั้น)", () => {
  assert.ok(MJ.includes("React.useEffect(() => { load(); return () => { loadSeq.current++; }; }, [role, team, allTeams]);"));
  assert.ok(MJ.includes("onClick={() => load(true)}"));
});
check("การ์ดใช้ key=job_no (ข้อมูลเปลี่ยนแต่การ์ดเดิมไม่ถูกสร้างใหม่ → state ในกล่องแนบรูปอยู่ครบ)", () => {
  assert.ok(MJ.includes("key={jo.job_no}>"));
});
check("จำการ์ดที่กางไว้ใน sessionStorage (กันกรณีมือถือ RAM น้อยปิดแท็บทิ้งแล้วโหลดหน้าใหม่)", () => {
  assert.ok(MJ.includes('sessionStorage.getItem("amc_myjobs_expanded")') && MJ.includes('sessionStorage.setItem("amc_myjobs_expanded", JSON.stringify(expanded))'));
});

console.log("\nJobTimeline — ร่างข้อความ+รูปไม่หายแม้กล่องถูกถอด/หน้าโหลดใหม่:");
const comp = between(TL, "function Composer({", "\n  async function onFiles(e)");
check("ร่างแยกต่อใบงาน + ต่อกล่องตอบกลับ · อ่านตอนเปิด · เขียนทุกครั้งที่เปลี่ยน · ว่างแล้วลบทิ้ง", () => {
  assert.ok(comp.includes('const draftKey = "amc_tl_draft:" + (jobNo || "") + ":" + (parentId || "");'));
  assert.ok(comp.includes("React.useState(() => String(readDraft().note || \"\"))"));
  assert.ok(comp.includes("if (note || photos.length) sessionStorage.setItem(draftKey, JSON.stringify({ note, photos })); else sessionStorage.removeItem(draftKey);"));
  assert.ok(comp.includes("}, [note, photos, draftKey]);"));
});
check("ร่างเพี้ยน/ถูกแก้มือ ต้องไม่ทำกล่องพัง (รับเฉพาะ array ของ string) · sessionStorage ใช้ไม่ได้ก็ไม่ล้ม", () => {
  assert.ok(comp.includes('return Array.isArray(p) ? p.filter((u) => typeof u === "string") : [];'));
  assert.ok((comp.match(/try \{/g) || []).length >= 2 && comp.includes("catch { return {}; }"));
});
check("โพสต์สำเร็จล้างข้อความ+รูป (→ effect ลบร่าง) · ปุ่มโพสต์ยังล็อกระหว่างอัปโหลด", () => {
  assert.ok(TL.includes('setNote(""); setPhotos([]); await onPosted();'));
  assert.ok(TL.includes("disabled={busy || uploading || (!note.trim() && photos.length === 0)}"));
});

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
if (fail) process.exit(1);
