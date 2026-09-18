// สำรองไฟล์แนบ Supabase Storage (bucket photos) แบบ "ดึงเฉพาะไฟล์ที่ยังไม่มี" → Google Drive (K:) โหมด Stream
//
// วิธีใช้ (บนคอมเจ้าของ เดือนละครั้ง): ดับเบิลคลิก scripts\backup-storage.cmd  หรือ  node scripts/backup-storage.mjs
// ต้องเคย `npx supabase login` ไว้แล้ว (ทำครั้งเดียว 18 ก.ย. 2026) — ไม่มี key/รหัสผ่านในไฟล์นี้
//
// ทำอะไร:
//   1. ถามฐานข้อมูล (storage.objects) ว่ามีไฟล์อะไรบ้าง — ผ่าน `supabase db query` (ใช้ token ที่ login ไว้)
//   2. เทียบกับไฟล์ที่มีอยู่แล้วใน DEST → ดึงเฉพาะที่ขาด (ไม่โหลดซ้ำ 26 GB ทุกเดือน)
//   3. ไฟล์ที่ถูกลบบน Supabase แล้ว "ไม่ลบ" ในสำเนา (สำเนาเก็บประวัติ) แค่รายงานจำนวน
//   4. เขียน log ไว้ที่ DEST/_logs/YYYY-MM-DD.txt + เตือนถ้าไดรฟ์ว่างน้อยกว่า 20 GB
//
// บทเรียน 18 ก.ย. 2026: `storage cp -r ss:///bucket/ ./` ใช้ได้ แต่ dst ต้องเป็นพาธ relative (ตัวอักษรไดรฟ์ D: ถูกอ่านเป็น URL scheme)
//   และไม่มีวิธี "ข้ามไฟล์ที่มีแล้ว" ในตัว → เลยต้องเทียบเองด้วย SQL + ดึงทีละไฟล์
import fs from "node:fs";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";

const PROJECT_REF = "tpyrlxhoyghawqvsphfj";           // Inventory Management (ap-southeast-2)
const BUCKET = "photos";                              // bucket เดียวที่มีไฟล์ (hr-documents/sales-wht-evidence/AMC pic./tm_slides ว่าง — เช็กใหม่ทุกครั้งด้านล่าง)
const DEST = process.env.AMC_BACKUP_DEST || "K:/My Drive/amc-backups/storage";   // โฟลเดอร์ใน Google Drive (Stream)
const WORKDIR = process.env.AMC_SUPABASE_WORKDIR || "D:/backups";                // ที่ที่ `supabase link` ไว้ (มี supabase/.temp)
const JOBS = 4;
const MIN_FREE_GB = 20;

const env = { ...process.env, npm_config_cache: process.env.npm_config_cache || "D:\\build-tmp\\npm-cache", TEMP: "D:\\build-tmp", TMP: "D:\\build-tmp" };
// เรียก supabase.exe ตรง ๆ (ไม่ผ่าน cmd.exe) — SQL มี ' ( ) > ที่ shell จะตีความพัง · หาไฟล์จากแคช npx ที่ `npx supabase` เคยดาวน์โหลดไว้
function findSupabaseBin() {
  if (process.env.AMC_SUPABASE_BIN && fs.existsSync(process.env.AMC_SUPABASE_BIN)) return process.env.AMC_SUPABASE_BIN;
  const root = path.join(env.npm_config_cache, "_npx");
  if (fs.existsSync(root)) for (const h of fs.readdirSync(root)) {
    const p = path.join(root, h, "node_modules", "@supabase", "cli-windows-x64", "bin", "supabase.exe");
    if (fs.existsSync(p)) return p;
  }
  return null;
}
const SB_BIN = findSupabaseBin();
if (!SB_BIN) { console.log("✗ ไม่พบ supabase.exe ในแคช npx — รัน `npx supabase --version` ใน PowerShell (ตั้ง $env:npm_config_cache=\"D:\\build-tmp\\npm-cache\" ก่อน) แล้วลองใหม่"); process.exit(1); }
const today = new Date().toISOString().slice(0, 10);
fs.mkdirSync(path.join(DEST, "_logs"), { recursive: true });
const logFile = path.join(DEST, "_logs", `${today}.txt`);
const lines = [];
const log = (s) => { console.log(s); lines.push(s); };
const flush = () => fs.writeFileSync(logFile, lines.join("\n") + "\n");

function sb(args, opts = {}) {
  const r = spawnSync(SB_BIN, [...args, "--workdir", WORKDIR], { encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024, ...opts });   // รายชื่อ 22k ไฟล์ = ~3 MB เกิน default 1 MB
  const clean = (s) => (s || "").split("\n").filter((l) => !l.startsWith("npm ")).join("\n");
  return { status: r.status, out: clean(r.stdout) + clean(r.stderr), stdout: clean(r.stdout) };
}
function query(sql) {
  // JSON อยู่ใน stdout เท่านั้น — stderr มีข้อความสถานะ ("Initialising login role...") ห้ามเอามาปน
  const { stdout, out } = sb(["db", "query", sql, "--linked", "--project-ref", PROJECT_REF, "--output-format", "json"]);
  const i = stdout.indexOf("{"), k = stdout.lastIndexOf("}");
  if (i < 0 || k < i) throw new Error("db query ไม่ได้ผลลัพธ์ JSON:\n" + out.slice(0, 400));
  const j = JSON.parse(stdout.slice(i, k + 1));
  if (j.error) throw new Error("db query error: " + JSON.stringify(j.error));
  return j.rows || [];
}
const walk = (d, base, out) => {
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.add(path.relative(base, p).split(path.sep).join("/"));
  }
  return out;
};
function freeGb(p) {
  try { const s = fs.statfsSync(p); return (s.bavail * s.bsize) / 1073741824; } catch { return null; }
}

log(`=== สำรองไฟล์แนบ ${today} → ${DEST}`);
// 0. เช็กว่าล็อกอิน CLI อยู่
const who = sb(["projects", "list", "--output-format", "json"]);
if (!who.out.includes(PROJECT_REF)) { log("✗ Supabase CLI ยังไม่ได้ login หรือมองไม่เห็น project — รัน `npx supabase login` ก่อน\n" + who.out.slice(0, 300)); flush(); process.exit(1); }

// 1. bucket ไหนมีไฟล์บ้าง — ถ้ามี bucket ใหม่นอกจาก photos ให้เตือน (โค้ดอาจเพิ่ม bucket ทีหลัง)
const buckets = query("select bucket_id, count(*)::int as n, round(coalesce(sum((metadata->>'size')::bigint),0)/1048576.0)::int as mb from storage.objects where name not like '%.emptyFolderPlaceholder' group by bucket_id order by n desc");
buckets.forEach((b) => log(`  bucket ${b.bucket_id}: ${b.n} ไฟล์ · ${b.mb} MB`));
const others = buckets.filter((b) => b.bucket_id !== BUCKET && b.n > 0);
if (others.length) log(`⚠️ มี bucket อื่นที่มีไฟล์แต่สคริปต์นี้ยังไม่สำรอง: ${others.map((b) => b.bucket_id).join(", ")} — แก้ BUCKET ในสคริปต์`);

// 2. รายชื่อไฟล์บนเซิร์ฟเวอร์ vs ในสำเนา
const remote = query(`select name, (metadata->>'size')::bigint as size from storage.objects where bucket_id='${BUCKET}' and name not like '%.emptyFolderPlaceholder' order by name`);
const destBucket = path.join(DEST, BUCKET);
const local = walk(destBucket, destBucket, new Set());
const missing = remote.filter((r) => !local.has(r.name));
const remoteSet = new Set(remote.map((r) => r.name));
const deleted = [...local].filter((n) => !remoteSet.has(n));
const missingMb = Math.round(missing.reduce((a, r) => a + Number(r.size || 0), 0) / 1048576);
log(`  บนเซิร์ฟเวอร์ ${remote.length} ไฟล์ · ในสำเนา ${local.size} ไฟล์ · ต้องดึงเพิ่ม ${missing.length} ไฟล์ (${missingMb} MB) · ถูกลบบนเซิร์ฟเวอร์แล้วแต่ยังเก็บในสำเนา ${deleted.length} ไฟล์`);

// 3. ดึงเฉพาะที่ขาด (ขนานทีละ JOBS ไฟล์) — cp ทีละไฟล์: dst ต้องเป็น relative path จาก cwd = โฟลเดอร์ปลายทาง
let ok = 0, fail = 0; const failed = [];
async function fetchOne(name) {
  const dir = path.join(destBucket, path.dirname(name));
  fs.mkdirSync(dir, { recursive: true });
  return new Promise((res) => {
    const p = spawn(SB_BIN, ["storage", "cp", `ss:///${BUCKET}/${name}`, `./${path.basename(name)}`, "--experimental", "--project-ref", PROJECT_REF, "--workdir", WORKDIR], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => {
      const exists = fs.existsSync(path.join(dir, path.basename(name)));
      if (code === 0 && exists) ok++; else { fail++; failed.push(name + " :: " + out.replace(/\s+/g, " ").slice(0, 160)); }
      res();
    });
  });
}
const queue = [...missing]; let done = 0;
await Promise.all(Array.from({ length: JOBS }, async () => { while (queue.length) { const r = queue.shift(); await fetchOne(r.name); if (++done % 25 === 0) console.log(`  … ${done}/${missing.length}`); } }));
log(`  ดึงสำเร็จ ${ok} · ล้มเหลว ${fail}`);
failed.slice(0, 20).forEach((f) => log("    ✗ " + f));

// 4. ตรวจซ้ำหลังดึง + พื้นที่ว่าง
const after = walk(destBucket, destBucket, new Set());
const still = remote.filter((r) => !after.has(r.name)).length;
log(still === 0 ? `✓ ครบ: สำเนามี ${after.size} ไฟล์ ครอบคลุมทุกไฟล์บนเซิร์ฟเวอร์ (${remote.length})` : `✗ ยังขาด ${still} ไฟล์ — รันซ้ำอีกครั้ง (มักเป็นเน็ตสะดุด)`);
for (const [label, p] of [["ไดรฟ์สำเนา (K:)", DEST], ["ไดรฟ์แคช (D:)", "D:/"]]) {
  const g = freeGb(p);
  if (g != null) log(`  ${label} ว่าง ${g.toFixed(1)} GB${g < MIN_FREE_GB ? "  ⚠️ ต่ำกว่า " + MIN_FREE_GB + " GB — ดู docs/runbooks/backup-restore.md ข้อ 'เมื่อที่เต็ม'" : ""}`);
}
log(`=== จบ ${new Date().toLocaleTimeString("th-TH")} · log: ${logFile}`);
flush();
process.exit(still === 0 && fail === 0 ? 0 : 1);
