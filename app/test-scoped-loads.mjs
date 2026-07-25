// ทดสอบ listQuotations/listBoqs/listInvoices/listReceipts ที่แก้ใหม่ โดยดึง "โค้ดจริง" ออกจาก api.js
// มารันกับ supabase ปลอมที่บันทึกทุก query — ตรวจว่า
//   (1) เรียกแบบไม่ระบุใบ  → ต้องไม่มีตัวกรอง in/ov เลย (พฤติกรรมเดิมเป๊ะ)
//   (2) เรียกแบบ { nos:[...] } → ทุกตารางต้องถูกกรอง และลูกค้า/ไซต์ต้องกรองตาม id ที่ใบนั้นอ้างถึงเท่านั้น
import fs from "node:fs";
import assert from "node:assert/strict";

const SRC = fs.readFileSync(process.argv[2], "utf8");

function grab(startMarker, endMarker) {
  const i = SRC.indexOf(startMarker);
  assert.ok(i >= 0, "ไม่เจอ " + startMarker);
  const j = SRC.indexOf(endMarker, i);
  assert.ok(j > i, "ไม่เจอจุดจบของ " + startMarker);
  return SRC.slice(i, j);
}

// หมายเหตุ: list* ถูกห่อด้วยแคช (export function listX → เรียก _cached(() => _loadX())) แล้ว
// ตรรกะ query จริงย้ายไปอยู่ใน _loadX — ดึง _loadX มาทดสอบแล้ว alias กลับเป็น listX ตอน return
const helpers = grab("const _scopeNos = (opts) =>", "export function listBoqs");
const fnBoqs = grab("async function _loadBoqs(", "\n// ---------- COMPANY PROFILE");
const fnQuotes = grab("async function _loadQuotations(", "\nexport async function saveQuotation");
const fnInv = grab("async function _loadInvoices(", "\nexport function billedByQuote");
const fnRc = grab("async function _loadReceipts(", "\nexport async function saveReceipt");

// ---- supabase ปลอม: บันทึก table + filters ของทุก query แล้วคืนแถวว่าง (ยกเว้นหัวใบที่ป้อนให้) ----
let calls = [];
let headRows = {};
function makeQuery(table) {
  const rec = { table, filters: [] };
  calls.push(rec);
  const q = {
    select: () => q,
    in: (col, vals) => { rec.filters.push(`${col} in [${vals.join(",")}]`); return q; },
    overlaps: (col, vals) => { rec.filters.push(`${col} ov [${vals.join(",")}]`); return q; },
    or: (expr) => { rec.filters.push(`or(${expr})`); return q; },
    order: () => q,
    range: () => q,
    then: (res) => res({ data: headRows[table] || [], count: (headRows[table] || []).length, error: null }),
    catch: () => q,
  };
  return q;
}
const supabase = { from: (t) => makeQuery(t) };

const _fetchAll = async (build) => {
  const { data, error } = await build(0, 999);
  if (error) throw error;
  return data || [];
};
const _firstContacts = () => ({});
const _creators = async () => ({});
const _gmap = () => null;

const mod = `
${helpers}
const _allRows = (build) => _fetchAll(build).then((rows) => ({ data: rows }));
${fnBoqs}
${fnQuotes}
${fnInv}
${fnRc}
return { listBoqs: _loadBoqs, listQuotations: _loadQuotations, listInvoices: _loadInvoices, listReceipts: _loadReceipts };
`.replace(/export async function/g, "async function");

const { listBoqs, listQuotations, listInvoices, listReceipts } = new Function(
  "supabase", "_fetchAll", "_firstContacts", "_creators", "_gmap", mod
)(supabase, _fetchAll, _firstContacts, _creators, _gmap);

let pass = 0, fail = 0;
const check = (name, fn) => { try { fn(); console.log("  ✓ " + name); pass++; } catch (e) { console.log("  ✗ " + name + "\n      " + e.message); fail++; } };

// ============ (1) โหลดทั้งหมด — ต้องไม่มีตัวกรองเลย ============
console.log("\nโหลดทั้งหมด (พฤติกรรมเดิม):");
for (const [label, fn] of [["listQuotations", listQuotations], ["listBoqs", listBoqs], ["listInvoices", listInvoices], ["listReceipts", listReceipts]]) {
  calls = []; headRows = {};
  await fn();
  const filtered = calls.filter((c) => c.filters.length);
  check(`${label}() ไม่มีตัวกรอง (${calls.length} query)`, () => {
    assert.equal(filtered.length, 0, "มี query ที่ถูกกรอง: " + JSON.stringify(filtered));
    assert.ok(calls.length >= 6, "ควรยิงอย่างน้อย 6 ตาราง ได้ " + calls.length);
  });
}

// ============ (2) เจาะจงใบเดียว — ทุกตารางต้องถูกกรอง ============
console.log("\nเจาะจงใบเดียว { nos:[...] }:");

calls = []; headRows = { quotations: [{ quote_no: "QT-1", customer_id: 7, site_id: 3 }] };
await listQuotations({ nos: ["QT-1"] });
check("listQuotations: ทุก query ถูกกรอง", () => {
  const bare = calls.filter((c) => !c.filters.length);
  assert.equal(bare.length, 0, "query ที่ไม่ถูกกรอง: " + bare.map((c) => c.table).join(", "));
});
check("listQuotations: ลูกค้ากรองด้วย id ของใบนั้น (7) ไม่ใช่ทั้งตาราง", () => {
  const cu = calls.find((c) => c.table === "customers");
  assert.deepEqual(cu.filters, ["id in [7]"]);
});
check("listQuotations: ไซต์กรองด้วย site_id ของใบนั้น (3)", () => {
  assert.deepEqual(calls.find((c) => c.table === "customer_sites").filters, ["id in [3]"]);
});
check("listQuotations: รายการในใบกรองด้วย quote_no", () => {
  assert.deepEqual(calls.find((c) => c.table === "quotation_items").filters, ["quote_no in [QT-1]"]);
});

calls = []; headRows = { boqs: [{ boq_no: "BQ-9", customer_id: 2, site_id: null }] };
await listBoqs({ nos: ["BQ-9"] });
check("listBoqs: ทุก query ถูกกรอง", () => {
  const bare = calls.filter((c) => !c.filters.length);
  assert.equal(bare.length, 0, "query ที่ไม่ถูกกรอง: " + bare.map((c) => c.table).join(", "));
});
check("listBoqs: ใบไม่มี site_id → ไซต์ต้องได้ 0 แถว ไม่ใช่ทั้งตาราง", () => {
  assert.deepEqual(calls.find((c) => c.table === "customer_sites").filters, ["id in [-1]"]);
});

calls = []; headRows = { invoices: [{ invoice_no: "IV-5", customer_id: 4, site_id: 1, quote_no: "QT-1" }] };
await listInvoices({ nos: ["IV-5"] });
check("listInvoices: ทุก query ถูกกรอง", () => {
  const bare = calls.filter((c) => !c.filters.length);
  assert.equal(bare.length, 0, "query ที่ไม่ถูกกรอง: " + bare.map((c) => c.table).join(", "));
});
check("listInvoices: ใบวางบิลใช้ overlaps กับ array (ไม่ใช่ in)", () => {
  assert.deepEqual(calls.find((c) => c.table === "billing_notes").filters, ["invoice_nos ov [IV-5]"]);
});
check("listInvoices: ใบเสนอแม่กรองด้วย quote_no ของใบนั้น", () => {
  assert.deepEqual(calls.find((c) => c.table === "quotations").filters, ["quote_no in [QT-1]"]);
});

calls = []; headRows = { receipts: [{ receipt_no: "RC-2", customer_id: 8, site_id: 5, quote_no: null }] };
await listReceipts({ nos: ["RC-2"] });
check("listReceipts: ทุก query ถูกกรอง", () => {
  const bare = calls.filter((c) => !c.filters.length);
  assert.equal(bare.length, 0, "query ที่ไม่ถูกกรอง: " + bare.map((c) => c.table).join(", "));
});
check("listReceipts: ใบเสร็จไม่ผูกใบเสนอ → ใบงาน/ใบเสนอต้องได้ 0 แถว", () => {
  assert.deepEqual(calls.find((c) => c.table === "job_orders").filters, ["quote_no in [__none__]"]);
  assert.deepEqual(calls.find((c) => c.table === "quotations").filters, ["quote_no in [__none__]"]);
});

// ============ (3) กรองช่วงวันที่ { since } — ที่แดชบอร์ดใช้ ============
console.log("\nกรองช่วงวันที่ { since }:");

calls = []; headRows = { quotations: [{ quote_no: "QT-1", customer_id: 7, site_id: 3, created_by: "u1" }] };
await listQuotations({ since: "2026-07-01" });
check("ใบเสนอ: ต้อง OR 3 คอลัมน์ (อนุมัติในช่วงแต่ออกก่อนช่วง ต้องไม่หาย · ใบเก่า issue_date NULL ต้องไม่หาย)", () => {
  const f = calls.find((c) => c.table === "quotations").filters;
  assert.deepEqual(f, ["or(approved_at.gte.2026-07-01,issue_date.gte.2026-07-01,created_at.gte.2026-07-01)"]);
});
check("ใบเสนอ: ตารางลูกกรองตามเลขใบที่ได้มาจริง ไม่ใช่กรองด้วยวันที่ซ้ำ", () => {
  assert.deepEqual(calls.find((c) => c.table === "quotation_items").filters, ["quote_no in [QT-1]"]);
  assert.deepEqual(calls.find((c) => c.table === "customers").filters, ["id in [7]"]);
  assert.deepEqual(calls.find((c) => c.table === "invoices").filters, ["quote_no in [QT-1]"]);
});

calls = []; headRows = { receipts: [{ receipt_no: "RC-1", customer_id: 2, site_id: null, quote_no: "QT-1" }] };
await listReceipts({ since: "2026-07-01" });
check("ใบเสร็จ: OR issue_date กับ created_at (ใบเก่าที่ยังไม่มี issue_date ต้องไม่หาย)", () => {
  assert.deepEqual(calls.find((c) => c.table === "receipts").filters, ["or(issue_date.gte.2026-07-01,created_at.gte.2026-07-01)"]);
});

check("ไม่มีที่ไหนใช้ .lte(to) กับคอลัมน์ timestamptz (จะตัดงานของวันสุดท้ายทิ้งทั้งวัน)", () => {
  assert.ok(!/\.lte\(\s*["'](approved_at|created_at)/.test(SRC), "เจอ .lte บน timestamptz");
});

calls = []; headRows = {};
await listQuotations({ since: "1 ก.ค." });
check("since รูปแบบผิด → ไม่กรอง (ไม่ใช่ยิง query พังหรือได้ 0 แถว)", () => {
  assert.equal(calls.filter((c) => c.filters.length).length, 0);
});

// ============ (4) แดชบอร์ด: กรองรายพนักงานขายแล้วใบเสร็จต้องไม่หาย ============
// บั๊กที่เอเจนต์ตรวจจับได้: ใบเสร็จเดือนนี้ส่วนใหญ่มาจากใบเสนอที่อนุมัติไปหลายเดือนก่อน (ลูกค้าจ่ายทีหลัง)
// ถ้ากรองใบเสร็จด้วย "ใบเสนอในช่วง" ใบเสร็จพวกนั้นจะถูกทิ้ง การ์ด "รับเงินแล้ว" กลายเป็น 0 บาท
console.log("\nแดชบอร์ด — กรองพนักงานขายแล้วใบเสร็จต้องไม่หาย:");

const DASH = fs.readFileSync(process.argv[3], "utf8");
check("fRcs ต้องไม่ใช้ fq (ใบเสนอในช่วง) เป็นตัวตัดสินว่าใบเสร็จของใคร", () => {
  const i = DASH.indexOf("const fRcs");
  const body = DASH.slice(i, DASH.indexOf("}, [", i));
  assert.ok(!/ok\.has\(r\.quote_no\)/.test(body), "ยังกรองด้วยชุดเลขใบเสนอในช่วงอยู่");
  assert.ok(/attr\[r\.quote_no\]/.test(body), "ต้องดูจากตารางระบุตัวตน (attr) แทน");
});
check("แดชบอร์ดต้องดึงตัวตนของใบเสนอนอกช่วงที่ใบเสร็จอ้างถึงมาเพิ่ม", () => {
  assert.ok(/quoteAttribution\(missing\)/.test(DASH), "ไม่พบการเรียก quoteAttribution");
});
check("เปลี่ยนช่วงวันที่ต้องล้างของเก่า ไม่โชว์ตัวเลขช่วงก่อนใต้ป้ายช่วงใหม่", () => {
  const i = DASH.indexOf("const opt = from ?");
  assert.ok(/setOv\(null\)/.test(DASH.slice(Math.max(0, i - 400), i)), "ไม่พบ setOv(null) ก่อนโหลดชุดใหม่");
});
check("โหลดเอกสารพังต้องขึ้นคำเตือน ไม่กลืน error เงียบ ๆ", () => {
  assert.ok(/setOvErr\(/.test(DASH) && /ovErr &&/.test(DASH), "ไม่พบ state/แบนเนอร์แจ้ง error");
});

calls = []; headRows = { quotations: [{ quote_no: "QT-1", created_by: "u1" }] };
await listQuotations({ nos: ["QT-1"] });   // อุ่นเครื่องให้แน่ใจว่า helper ยังทำงาน
check("quoteAttribution มีอยู่จริงใน api.js และอ่านแค่ 2 ตาราง (ไม่ใช่ 7)", () => {
  const i = SRC.indexOf("export async function quoteAttribution");
  assert.ok(i > 0, "ไม่พบ quoteAttribution");
  const body = SRC.slice(i, SRC.indexOf("\nexport ", i + 10));
  const tables = [...body.matchAll(/supabase\.from\("(\w+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(tables.sort(), ["job_orders", "quotations"]);
  assert.ok(!/quotation_items|customer_sites/.test(body), "ต้องไม่แตะตารางรายการ/ไซต์");
});

// ============ (5) หน้ารายการเอกสาร: ค่าเริ่มต้น 6 เดือน ต้องไม่ทำใบหาย ============
console.log("\nหน้ารายการเอกสาร — ค่าเริ่มต้น 6 เดือนล่าสุด:");

const PAGES = [
  ["Quotation.jsx", "list", true], ["BOQ.jsx", "list", true], ["Invoices.jsx", "list", true],
  ["Receipts.jsx", "list", true], ["BillingNotes.jsx", "list", false], ["PurchaseOrders.jsx", "pos", true],
];
for (const [file, arr, hasFocus] of PAGES) {
  const src = fs.readFileSync("src/components/" + file, "utf8");
  check(`${file}: ตั้งค่าเริ่มต้นเป็น defaultDocRange + ส่งจำนวนที่ซ่อนให้แถบตัวกรอง`, () => {
    assert.ok(/useState\(defaultDocRange\)/.test(src), "ยังไม่ได้ตั้งค่าเริ่มต้น");
    assert.ok(/hidden=\{dateHidden\}/.test(src), "ไม่ได้ส่ง hidden ให้ DateRangeBar (ผู้ใช้จะไม่รู้ว่ามีใบถูกซ่อน)");
  });
  check(`${file}: dateHidden ต้องประกาศหลัง ${arr} (ไม่งั้นหน้าขาวเพราะ TDZ)`, () => {
    const di = src.indexOf(`const [${arr}, set`);
    const hi = src.indexOf("const dateHidden");
    assert.ok(di >= 0 && hi > di, `dateHidden อยู่ก่อน ${arr}`);
  });
  if (hasFocus) {
    check(`${file}: เปิดเจาะจงใบ (focus) ต้องล้างช่วงวันที่ ไม่งั้นใบเก่ากว่า 6 เดือนกดลิงก์ไปแล้วขึ้นว่าไม่พบ`, () => {
      const i = src.indexOf("if (focus)") >= 0 ? src.indexOf("if (focus)") : src.indexOf("if (!focus) return");
      assert.ok(i > 0, "ไม่เจอ effect ของ focus");
      const body = src.slice(i, i + 320);
      assert.ok(/setDateR\(\{ from: "", to: "" \}\)/.test(body), "ไม่ได้ล้างช่วงวันที่ตอนเปิดเจาะจงใบ");
    });
  }
}

// ============ (6) เพดาน 1000 แถว: จุดที่เคยอ่านตารางที่โตได้แบบไม่กัน ============
// Supabase ตัดทุก select ที่ 1000 แถวเงียบ ๆ ไม่มี error — ข้อมูลหายโดยไม่มีอะไรฟ้อง
console.log("\nเพดาน 1000 แถว:");

check("แชต LINE/เฟซบุ๊ก ต้องดึงใหม่→เก่า + limit (เรียงเก่า→ใหม่ = ข้อความใหม่หายทั้งห้อง)", () => {
  for (const fn of ["listLineMessages", "listFbMessages"]) {
    const i = SRC.indexOf(`export async function ${fn}`);
    assert.ok(i > 0, "ไม่เจอ " + fn);
    const body = SRC.slice(i, SRC.indexOf("\n}", i));
    assert.ok(/ascending: false/.test(body), `${fn} ยังเรียงเก่า→ใหม่`);
    assert.ok(/\.limit\(/.test(body), `${fn} ไม่มี limit`);
    assert.ok(/\.reverse\(\)/.test(body), `${fn} ลืมกลับลำดับตอนแสดง`);
  }
});

check("งานของทีม (จอช่าง) ต้องมี limit — ไม่งั้นงานที่กำลังจะถึงหายก่อน", () => {
  const i = SRC.indexOf("export async function listTeamJobOrders");
  const body = SRC.slice(i, i + 1200);
  assert.ok(/ascending: false/.test(body) && /\.limit\(/.test(body), "ยังอ่านประวัติงานทั้งหมดแบบเก่า→ใหม่");
});

check("ตารางที่โตได้ ต้องไม่มี select แบบเปล่า ๆ หลงเหลือ", () => {
  const bad = [
    ['from("customers").select("id,name"),', "ตารางลูกค้าอ่านแบบไม่กันเพดาน"],
    ['from("sub_payouts").select("*").order', "ใบจ่ายช่างซัพอ่านแบบไม่กันเพดาน"],
    ['from("stock_counts").select("*").order', "รอบนับสต๊อกอ่านแบบไม่กันเพดาน"],
    ['from("line_contacts").select("*").order', "รายชื่อแชต LINE อ่านแบบไม่กันเพดาน"],
    ['from("fb_contacts").select("*").order', "รายชื่อแชตเฟซบุ๊กอ่านแบบไม่กันเพดาน"],
    ['from("job_orders").select("job_no,quote_no,customer_id,title,status"),', "ใบงานในหน้าเบิกจ่ายอ่านแบบไม่กันเพดาน"],
  ];
  const hits = bad.filter(([frag]) => SRC.includes(frag)).map(([, why]) => why);
  assert.deepEqual(hits, [], hits.join(" · "));
});

check("ทุก _allRows/_fetchAll ต้องมี .order() (ไม่มี order = แถวซ้ำ/หายระหว่างหน้า)", () => {
  const calls = [...SRC.matchAll(/_(?:allRows|fetchAll)\(\(f, t\) =>([\s\S]{0,400}?)\.range\(f, t\)/g)];
  const noOrder = calls.filter((m) => !/\.order\(/.test(m[1])).map((m) => m[1].slice(0, 90).replace(/\s+/g, " "));
  assert.deepEqual(noOrder, [], "พบ " + noOrder.length + " จุดไม่มี order: " + noOrder.join(" | "));
});

// ============ (7) กันพลาด: ขอเกิน 200 ใบ → กลับไปโหลดเต็ม (URL ยาวเกิน) ============
console.log("\nกันพลาด:");
calls = []; headRows = {};
await listQuotations({ nos: Array.from({ length: 250 }, (_, i) => "Q" + i) });
check("ขอ 250 ใบ → ถอยไปโหลดเต็ม ไม่ยิง URL ยาวเกิน", () => {
  assert.equal(calls.filter((c) => c.filters.length).length, 0);
});
calls = []; headRows = {};
await listQuotations({ nos: [] });
check("nos: [] → โหลดเต็ม (ไม่ใช่ได้ 0 แถวเงียบ ๆ)", () => {
  assert.equal(calls.filter((c) => c.filters.length).length, 0);
});

// sentinel "ไม่ตรงกับใบไหน" ต้องเป็นข้อความที่ Postgres เก็บได้ — เคยเผลอใส่ NUL แล้ว query ระเบิดแทนที่จะคืน 0 แถว
check("ไม่มี NUL byte หลงเหลือในไฟล์ (git จะมองเป็น binary + PostgREST 22021)", () => {
  const n = [...Buffer.from(SRC, "utf8")].filter((b) => b === 0).length;
  assert.equal(n, 0, `เจอ NUL ${n} ตัว`);
});


// ============ (8) จอช่างต้องไม่ได้ข้อมูลราคา ============
// รูที่เอเจนต์ตรวจเจอหลัง v477: select j.* ส่ง labor_lines ซึ่งเก็บ {price, disc, sale} ที่ก็อปมาจากใบเสนอราคา
// และ internal_note ที่ตั้งใจซ่อนจากช่างมาตั้งแต่ mig 055 — ตัวตรวจเดิมมองไม่เห็นเพราะคีย์ชื่อไม่ตรง
console.log("\nจอช่าง — ต้องไม่มีข้อมูลราคา/หลังบ้านหลุด:");

const RPC = fs.readFileSync("../supabase/migrations/166_jobs_for_team.sql", "utf8");

check("RPC ต้องไม่ใช้ j.* / jo.* ในผลลัพธ์ (พ่วงคอลัมน์ต้องห้ามมาด้วย)", () => {
  const body = RPC.slice(RPC.indexOf("select coalesce(json_agg"));
  assert.ok(!/select\s+j\.\*/.test(body), "ยังใช้ select j.* อยู่");
});

check("RPC ต้องไม่ส่ง labor_lines / internal_note / คะแนน-เคลม ถึงช่าง", () => {
  const body = RPC.slice(RPC.indexOf("select coalesce(json_agg"));
  const bad = ["labor_lines", "internal_note", "labor_total", "payout_id", "rating", "is_claim"].filter((c) => new RegExp("j\." + c + "\b").test(body));
  assert.deepEqual(bad, [], "ยังส่ง: " + bad.join(", "));
});

check("ช่างที่ยังไม่ได้ตั้งทีม ต้องไม่เห็นงานทั้งบริษัท", () => {
  const flat = RPC.replace(/\s+/g, " ");
  assert.ok(flat.includes("not (my_role()='tech' and my_team() is null)") || flat.includes("not (my_role() = 'tech' and my_team() is null)"),
    "ไม่มีด่านกันช่างไม่มีทีม");
});

check("เทียบทีมแบบ union (รอบนัดที่ทีมเป็น null ต้องไม่ทำให้งานหาย)", () => {
  const flat = RPC.replace(/\s+/g, " ");
  assert.ok(/or jo\.assigned_team ?= ?s\.team/.test(flat), "ไม่ได้เทียบทีมบนหัวใบ");
  assert.ok(/or exists \(select 1 from job_visits v where v\.job_no ?= ?jo\.job_no and v\.assigned_team ?= ?s\.team\)/.test(flat), "ไม่ได้เทียบทีมของรอบนัด");
});

check("หน้าจอที่ช่างเข้าถึงได้ ต้องเรียกใบงานแบบ fieldOnly", () => {
  const PAGES = ["Movements.jsx", "Schedule.jsx", "Expenses.jsx", "MyJobs.jsx", "JobOrders.jsx"];
  const bad = [];
  for (const f of PAGES) {
    const src = fs.readFileSync("src/components/" + f, "utf8");
    if (!/fieldOnly/.test(src)) { bad.push(f + " (ไม่มีโหมดจอช่างเลย)"); continue; }
    // เรียกแบบไม่มีอาร์กิวเมนต์ยอมได้เฉพาะในสาขาออฟฟิศ — บรรทัดนั้นต้องโหลดลูกค้าด้วย ซึ่งจอช่างไม่โหลด
    for (const [k, line] of src.split("\n").entries()) {
      if (line.includes("listJobOrders()") && !line.includes("listCustomers()")) bad.push(f + ":" + (k + 1));
    }
  }
  assert.deepEqual(bad, [], "ยังเรียกโหมดออฟฟิศ: " + bad.join(", "));
});

check("จอช่างต้องไม่มีชิปที่พาไปเปิดใบเสนอราคา (มีราคาเต็ม)", () => {
  const s = fs.readFileSync("src/components/JobOrders.jsx", "utf8");
  assert.ok(/boqNo=\{fieldOnly \? null : jo\.boq_no\} quoteNo=\{fieldOnly \? null : jo\.quote_no\}/.test(s), "ชิปยังโผล่ในโหมดจอช่าง");
});


console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);