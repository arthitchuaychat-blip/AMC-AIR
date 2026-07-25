// ส่งใบกำกับเข้า FlowAccount: (1) เฉพาะใบที่มี VAT (2) ส่งแล้วส่งซ้ำไม่ได้
//
// เจ้าของสั่ง: "ใบเสร็จ/ใบกำกับที่ส่งเข้า FlowAccount ต้องเป็นรายการ VAT เท่านั้น
//               และเมื่อส่งแล้วต้องส่งไปอีกไม่ได้ กันส่งซ้ำ"
// ของเดิมหลวมทั้งคู่: ปุ่มยังกดส่งซ้ำได้ (แค่เตือน) · RPC เขียนทับเลขเดิม ·
//   FA สำเร็จแต่ประทับเลขพลาดถูกกลืน error → เลขว่าง กดใหม่ = ซ้ำ · เซิร์ฟเวอร์ไม่เช็ก VAT
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rc = strip(fs.readFileSync("src/components/Receipts.jsx", "utf8"));
const api = fs.readFileSync("src/lib/api.js", "utf8");
const srv = fs.readFileSync("api/flowaccount-doc.js", "utf8");
const mig = fs.readFileSync("../supabase/migrations/175_flowaccount_send_once.sql", "utf8");

console.log("\nส่งใบกำกับเข้า FlowAccount — VAT เท่านั้น + กันส่งซ้ำ:");

// ---------- (1) VAT เท่านั้น ----------
const send = rc.slice(rc.indexOf("async function sendToFlow"), rc.indexOf("async function sendToFlow") + 3400);
check("sendToFlow: เช็กว่าใบมี VAT จริง (vat_amt > 0) ก่อนส่ง", /if \(!\(Number\(x\.vat_amt\) > 0\)\) return flash/.test(send),
  "ไม่เช็ก = ใบไม่มี VAT หลุดเข้าไปเป็นใบกำกับภาษี");
check("ปุ่มส่งโผล่เฉพาะใบที่มี VAT จริง (ไม่ใช่ธงในใบเสนอที่อาจโหลดไม่ครบ)",
  /canSendFlow && Number\(x\.vat_amt\) > 0 && x\.status !== "cancelled"/.test(rc),
  "gate ด้วยธงใบเสนอ = ใบเสนอไม่โหลด ปุ่มหาย หรือใบไม่มี VAT ปุ่มโผล่");
check("client ส่ง isVat: true ตายตัว (ใบที่ผ่าน gate = VAT แน่)", /isVat: true, isVatInclusive: false/.test(send));
check("เซิร์ฟเวอร์ปฏิเสธ tax-invoice ที่ยอด VAT คำนวณได้ = 0 (ไม่พึ่งธง isVat ที่ client ตั้งเอง)",
  /input\.docType === "tax-invoice" && !\(vatAmount > 0\)/.test(srv) && /not-vat/.test(srv),
  "ตรวจแค่ธง isVat = dead code เพราะ client ส่ง true เสมอ — ต้องตรวจจากยอด VAT จริง");

// ---------- (2) กันส่งซ้ำ ----------
check("ปุ่ม: ส่งแล้วเป็นป้ายเฉย ๆ ไม่มี onClick ส่งซ้ำ",
  /x\.flowaccount_no\s*\n?\s*\? <span className="fa-sent-badge/.test(rc) && !/flowaccount_no[^]{0,120}onClick=\{\(\) => sendToFlow/.test(rc),
  "ยังมีปุ่มให้กดส่งซ้ำ = สร้างเอกสารซ้ำใน FlowAccount");
check("sendToFlow: บล็อกทันทีถ้ามีเลข FlowAccount แล้ว",
  /if \(x\.flowaccount_no\) return flash\([^]*?ส่งซ้ำไม่ได้/.test(send),
  "กันชั้นเดียวที่ปุ่มไม่พอ — หน้าเก่า/กดเร็วยังหลุด");
check("sendToFlow: จองใบก่อนยิง (claim) — ยิงต่อเฉพาะจองสำเร็จ",
  /claimReceiptFlowAccount\(x\.receipt_no\)/.test(send) && /if \(claim !== "claimed"\)/.test(send),
  "ไม่จองก่อน = สองแท็บส่งพร้อมกัน สร้างซ้ำ");

// ---------- claim/stamp/release ฝั่ง api ----------
const claim = api.slice(api.indexOf("export async function claimReceiptFlowAccount"), api.indexOf("export async function releaseReceiptFlowAccount"));
check("claim ผ่าน RPC atomic เท่านั้น — ไม่ degrade เป็นเช็กแบบไม่ atomic",
  /rpc\("claim_receipt_flowaccount"/.test(claim) && /throw new Error\("ยังส่ง FlowAccount ไม่ได้/.test(claim)
  && !/select\("flowaccount_id"\)[^]*?\? "taken" : "claimed"/.test(claim),
  "degrade เป็น SELECT แล้วถือว่า claimed = สองแท็บอ่าน null พร้อมกัน จองทั้งคู่ = ส่งซ้ำ");
const stamp = api.slice(api.indexOf("export async function saveReceiptFlowAccount"), api.indexOf("export async function deleteReceipt"));
check("ประทับเลข: fallback เขียนตรงแบบเขียนครั้งเดียว (.is flowaccount_id null)",
  /\.eq\("receipt_no", receipt_no\)\.is\("flowaccount_id", null\)/.test(stamp), "ไม่กันทับ = ส่งซ้ำเขียนทับเลขจริง");
check("ประทับเลข: ไม่กลืน error (โยนต่อให้ผู้เรียกรู้)", /if \(e2\) throw e2;/.test(stamp) && !/catch \(_\) \{\}/.test(stamp),
  "กลืน error = FA สร้างแล้วแต่เลขว่าง กดใหม่ = ซ้ำ");

// ---------- FA สำเร็จแต่ประทับเลขพลาด: ห้ามปล่อยจอง + เตือนดัง ----------
const seBlock = send.slice(send.indexOf("catch (se)"), send.indexOf("ส่งเข้า FlowAccount แล้ว ✓"));
check("stamp พลาดหลัง FA สำเร็จ: ไม่ปล่อยจอง + เตือนให้จดเลข อย่าส่งซ้ำ",
  !!seBlock && /อย่ากดส่งซ้ำ/.test(seBlock) && !/releaseReceiptFlowAccount/.test(seBlock),
  "ถ้าปล่อยจองตรงนี้ = กดใหม่สร้างซ้ำ ทั้งที่ FA มีเอกสารแล้ว");
check("FA ล้ม (res.ok=false): ปล่อยจองแล้วบอกไม่สำเร็จ",
  /\} else \{\s*await releaseReceiptFlowAccount\(x\.receipt_no\);[^]*?flash\("FlowAccount ไม่สำเร็จ/.test(send),
  "ไม่ปล่อยจอง = ใบค้าง 10 นาทีถึงส่งใหม่ได้");
check("ยิงไม่ถึง FA (throw): ปล่อยจองให้ลองใหม่ได้",
  /catch \(e\) \{ await releaseReceiptFlowAccount\(x\.receipt_no\); throw e; \}/.test(send),
  "ยิงไม่ถึงแล้วไม่ปล่อยจอง = ใบค้างส่งใหม่ไม่ได้");

// ---------- ใบค้างจอง: คนตัดสิน ไม่ส่งซ้ำอัตโนมัติ ----------
const paBtn = rc.slice(rc.indexOf(": x.flowaccount_at"), rc.indexOf("</button>", rc.indexOf(": x.flowaccount_at")));
check("ปุ่มค้างส่งเรียก resolvePending (ไม่ยิงส่งซ้ำอัตโนมัติ)",
  /onClick=\{\(\) => resolvePending\(x\)\}/.test(paBtn) && !/sendToFlow/.test(paBtn),
  "ปุ่มค้างส่งยิง sendToFlow = ส่งซ้ำ ทั้งที่ FA อาจมีเอกสารแล้ว");
const rp = rc.slice(rc.indexOf("async function resolvePending"), rc.indexOf("async function resolvePending") + 1100);
check("resolvePending: กรอกเลข → บันทึกเลข (ถือว่าส่งแล้ว) · เว้นว่าง → ปลดล็อกส่งใหม่",
  /if \(no && String\(no\)\.trim\(\)\) \{ await saveReceiptFlowAccount\(x\.receipt_no, null, String\(no\)\.trim\(\)\)/.test(rp)
  && /else \{ await releaseReceiptFlowAccount\(x\.receipt_no\)/.test(rp),
  "ต้องให้คนเช็ก FlowAccount แล้วเลือกเอง ไม่ใช่ปล่อยให้ระบบส่งซ้ำ");

// ---------- migration 175 ----------
// ผูกกับตัวฟังก์ชัน claim เท่านั้น — flowaccount_id is null มีในหลายฟังก์ชันของไฟล์นี้ ถ้าเช็กทั้งไฟล์จะหลวม
const claimFn = mig.slice(mig.indexOf("function claim_receipt_flowaccount"), mig.indexOf("drop function"));
check("claim: จองเฉพาะใบที่ยังไม่ส่งและยังไม่ถูกจอง (ไม่มี auto-reopen ตามเวลา)",
  /flowaccount_id is null/.test(claimFn) && /flowaccount_at is null/.test(claimFn) && !/interval '10 minutes'/.test(claimFn),
  "auto-reopen 10 นาที = ใบที่ FA สร้างแล้วแต่ประทับเลขพลาด (id null, at เก่า) จะจองได้อีก → ส่งซ้ำ");
check("set_receipt_flowaccount: เขียนครั้งเดียว (where flowaccount_id is null)",
  /update receipts[^;]*flowaccount_id = nullif[^;]*where receipt_no = p_receipt_no\s*\n\s*and flowaccount_id is null/s.test(mig),
  "ไม่มี guard = ส่งซ้ำเขียนทับเลข FlowAccount เดิม");
check("release: ปล่อยเฉพาะใบที่ยังไม่มีเลขจริง", /update receipts set flowaccount_at = null\s*\n\s*where receipt_no = p_receipt_no and flowaccount_id is null/.test(mig));
check("ทุก RPC gate ด้วย role ที่ส่ง FlowAccount ได้", (mig.match(/my_role\(\) not in \('admin','exec','finance','sales','hr'\)/g) || []).length >= 3,
  "role ต้องตรงกับ UI (canSendFlow) และเซิร์ฟเวอร์ (OFFICE)");
check("drop function ก่อน create (เปลี่ยน return void → boolean)", /drop function if exists set_receipt_flowaccount/.test(mig));

// ---------- เลข migration ต้องไม่ชน ----------
const others = fs.readdirSync("../supabase/migrations").filter((f) => /^175_/.test(f));
check("เลข migration 175 ไม่ชนไฟล์อื่น", others.length === 1, `ชน: ${others.join(", ")}`);

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
