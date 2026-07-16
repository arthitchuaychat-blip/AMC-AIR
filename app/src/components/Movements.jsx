import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listMaterials, listMaterialsLite, listTeams, recordTransactions, listRecentTransactions, deleteTransaction, cancelTransactionGroup, updateTransaction, listOpenJobs, listJobOrders, updateMaterialCost, markPoReceived } from "../lib/api";
import { fmtBaht, fmtNum, matchText } from "../lib/format";
import { can } from "../lib/permissions";
import { scheduleLabel } from "../lib/schedule";
import { MaterialThumb, UIcon } from "../icons";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";
import UnitPick, { isDualUnit, unitFactor } from "./UnitPick";
import NumIn from "./NumIn";

const R2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const TYPES = [
  { id: "withdraw", th: "เบิกออก", icon: "withdraw", color: "#2563eb", dir: -1 },
  { id: "return",   th: "รับคืน",  icon: "ret",      color: "#16a34a", dir: +1 },
  { id: "purchase", th: "ซื้อเข้า", icon: "purchase", color: "#7c3aed", dir: +1 },
  { id: "damage",   th: "ตัดเสีย", icon: "damage",   color: "#dc2626", dir: -1 },
];
// display-only rows (recorded by นับสต๊อก, not a manual movement tab) so history renders + doesn't crash on TYPE_BY[type]
const TYPE_BY = Object.fromEntries([...TYPES,
  { id: "adjust_in",  th: "ปรับยอด (เพิ่ม)", icon: "purchase", color: "#0891b2", dir: +1 },
  { id: "adjust_out", th: "ปรับยอด (ลด)",    icon: "damage",   color: "#ea580c", dir: -1 },
].map((t) => [t.id, t]));
const REASONS = ["ชำรุด", "หาย", "หมดอายุ", "ใช้ผิดงาน"];

export default function Movements({ role, myTeam, prefill, onPrefillConsumed, withdrawCtx, onWithdrawCtxConsumed }) {
  // ซื้อเข้า/ตัดเสีย = สิทธิ์ระดับสโตร์ (ต้องมีสิทธิ์แก้ไข movements และไม่ใช่ช่างภาคสนาม)
  const isAdmin = can(role, "movements", "edit") && role !== "tech" && role !== "lead_tech";
  // แก้ไข/ยกเลิกรายการที่บันทึกไปแล้ว — เฉพาะผู้บริหาร/ธุรการ/การเงิน · ธุรการวัสดุ (stock) เห็นได้แต่แก้/ลบไม่ได้
  const canEditPast = ["admin", "exec", "finance"].includes(role);
  const isTech = role === "tech";
  const isLead = role === "lead_tech"; // หัวหน้าช่าง: เบิก/คืนได้ทุกทีม (แต่ไม่ซื้อ/ตัดเสีย)
  // ช่าง + หัวหน้าช่าง ทำได้เฉพาะ เบิกออก/รับคืน — no ซื้อ/ตัดเสีย
  const allowedTypes = (isTech || isLead) ? TYPES.filter((t) => t.id === "withdraw" || t.id === "return") : TYPES;
  const [mats, setMats] = React.useState([]);
  const [teams, setTeams] = React.useState([]);
  const [recent, setRecent] = React.useState([]);
  const [jobs, setJobs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [printData, setPrintData] = React.useState(null);
  const [expanded, setExpanded] = React.useState(() => new Set()); // group keys that are open
  const [editId, setEditId] = React.useState(null);   // transaction id being edited
  const [editQty, setEditQty] = React.useState("");

  const [type, setType] = React.useState("withdraw");
  const [team, setTeam] = React.useState("");
  const [jobNo, setJobNo] = React.useState("");
  const [jobOrders, setJobOrders] = React.useState([]);
  const [reason, setReason] = React.useState(REASONS[0]);
  const [damageMode, setDamageMode] = React.useState("job"); // job | central

  // cart flow (withdraw / purchase / central-damage)
  const [lines, setLines] = React.useState([]);
  const [pickCode, setPickCode] = React.useState("");
  const [pickQty, setPickQty] = React.useState(1);
  const [pickPrice, setPickPrice] = React.useState("");
  const [pickSearch, setPickSearch] = React.useState("");
  const [qtyModal, setQtyModal] = React.useState(null); // material being added (food-menu style)
  const [modalQty, setModalQty] = React.useState(1);
  const [modalPrice, setModalPrice] = React.useState("");
  const [modalUnit, setModalUnit] = React.useState("");  // หน่วยนับที่เลือก (สินค้า 2 หน่วย เช่น เมตร/ม้วน)
  const [receivePo, setReceivePo] = React.useState(null);
  const [prepNo, setPrepNo] = React.useState(null);   // เบิกที่มาจากใบเตรียมวัสดุ → ผูกกลับไว้ (ลบตามกันได้)
  const [txnDate, setTxnDate] = React.useState(() => new Date().toISOString().slice(0, 10));   // วันที่เอกสาร (แก้ไขได้ · เลขอ้างอิงยังรันอัตโนมัติ)
  const [receiveJob, setReceiveJob] = React.useState(null); // งานปลายทางของ PO ที่อ้างใบเสนอราคา → เบิกเข้างานอัตโนมัติหลังรับ
  // picker filters (เหมือนหน้า BOQ): ชนิด + หมวดวัสดุ + ตัวกรองแอร์ (ยี่ห้อ/ประเภท/BTU)
  const [mvKind, setMvKind] = React.useState("all"); // all | ac | material
  const [mvCat, setMvCat] = React.useState("all");
  const [mvBrand, setMvBrand] = React.useState("all");
  const [mvType, setMvType] = React.useState("all");
  const [mvBtu, setMvBtu] = React.useState("all");

  // job flow (return / damage-from-job)
  const [selJob, setSelJob] = React.useState("");
  const [qtyByCode, setQtyByCode] = React.useState({});

  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);
  // job orders assigned to the picked team (active) — for the เบิก job picker, nearest date first
  const teamJobs = React.useMemo(() => jobOrders
    .filter((j) => j.assigned_team === team && j.status !== "cancelled")
    .sort((a, b) => (a.scheduled_at || "").localeCompare(b.scheduled_at || "")), [jobOrders, team]);
  // only stock-tracked items can move; then narrow by the picker filters
  const matCats = React.useMemo(() => {
    const seen = {}; mats.forEach((m) => { if (m.tracked && m.kind === "material" && m.cat) seen[m.cat] = m.catName || m.cat; });
    return Object.entries(seen).sort((a, b) => a[1].localeCompare(b[1], "th"));
  }, [mats]);
  // ตัวเลือกกรองแอร์ (จากสินค้าแอร์ที่นับสต๊อก): ยี่ห้อ / ประเภท / ขนาด BTU
  const mvBrands = React.useMemo(() => [...new Set(mats.filter((m) => m.tracked && m.kind === "ac" && m.brand).map((m) => m.brand))].sort((a, b) => a.localeCompare(b)), [mats]);
  const mvTypes = React.useMemo(() => [...new Set(mats.filter((m) => m.tracked && m.kind === "ac" && m.ac_type).map((m) => m.ac_type))].sort((a, b) => a.localeCompare(b, "th")), [mats]);
  const mvBtus = React.useMemo(() => [...new Set(mats.filter((m) => m.tracked && m.kind === "ac" && m.btu).map((m) => Number(m.btu)))].sort((a, b) => a - b), [mats]);
  const pickList = React.useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    return mats.filter((m) =>
      m.tracked &&
      (mvKind === "all" || m.kind === mvKind) &&
      (mvKind !== "material" || mvCat === "all" || m.cat === mvCat) &&
      (mvKind !== "ac" || ((mvBrand === "all" || m.brand === mvBrand) && (mvType === "all" || m.ac_type === mvType) && (mvBtu === "all" || String(m.btu) === String(mvBtu)))) &&
      (!q || `${m.code} ${m.th || ""} ${m.name || ""} ${m.brand || ""} ${m.ac_type || ""} ${m.btu || ""}`.toLowerCase().includes(q))
    );
  }, [mats, mvKind, mvCat, mvBrand, mvType, mvBtu, pickSearch]);
  const T = TYPE_BY[type];
  // which UI flow is active
  const flow = type === "return" ? "job" : type === "damage" ? (damageMode === "job" ? "job" : "cart") : "cart";

  async function load() {
    setLoading(true);
    // lite list (materials table) is the authoritative item set — matches the catalog/BOQ picker;
    // the material_stock view only supplies current stock numbers, merged in by code.
    const [lite, full, tm, r, j, jord] = await Promise.all([listMaterialsLite(), listMaterials(), listTeams(), listRecentTransactions(60), listOpenJobs(), listJobOrders()]);
    setJobOrders(jord || []);
    const stockByCode = {}; full.forEach((x) => { if (x.code != null) stockByCode[x.code] = x.stock; });
    const m = lite.map((x) => (x.code in stockByCode ? { ...x, stock: stockByCode[x.code] } : x));
    setMats(m); setTeams(tm); setRecent(r); setJobs(j);
    const firstTracked = m.find((x) => x.tracked);
    if (!pickCode && firstTracked) setPickCode(firstTracked.code);
    // ค่าเริ่มต้นทีม — เซ็ตแบบ functional: ถ้าถูกตั้งไว้แล้ว (เช่น เด้งมาจากปุ่มเบิกวัสดุบนใบงาน
    // ที่ผูกทีมมาให้ก่อน load เสร็จ) ห้ามทับ (closure เก่าของ team ตอนสร้าง load() เป็นค่าว่างเสมอ)
    if (tm.length) setTeam((cur) => cur || (isTech && myTeam ? myTeam : tm[0].id));
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  // technicians are locked to their own team
  React.useEffect(() => { if (isTech && myTeam) setTeam(myTeam); }, [isTech, myTeam]);
  React.useEffect(() => { const m = matMap[pickCode]; if (m) setPickPrice(String(m.cost)); }, [pickCode, mats]);
  // when the picker filter narrows the list, keep the selected item valid
  React.useEffect(() => { if (pickList.length && !pickList.some((m) => m.code === pickCode)) setPickCode(pickList[0].code); }, [pickList]);
  // เด้งมาจากใบงาน/ใบเตรียมวัสดุ → ตั้งประเภท (เบิก/รับคืน/ตัดเสีย) + ทีม + งาน ให้เลย
  // เบิก: มี items ติดมาด้วย → เติมตะกร้า (ร่าง) · รับคืน/ตัดเสีย: ใช้โฟลว์ "เลือกงานที่เคยเบิก" (selJob)
  React.useEffect(() => {
    if (!withdrawCtx) return;
    if (withdrawCtx.items?.length && !mats.length) return;   // รอ mats โหลดก่อนค่อยเติมตะกร้า
    const t = withdrawCtx.type || "withdraw";
    setType(t);
    if (withdrawCtx.team) setTeam(withdrawCtx.team);
    if (withdrawCtx.jobNo) {
      if (t === "return" || t === "damage") setSelJob(withdrawCtx.jobNo);
      else setJobNo(withdrawCtx.jobNo);
    }
    if (withdrawCtx.items?.length) setLines(withdrawCtx.items.map((p) => ({ code: p.code, qty: Number(p.qty) || 1, price: undefined, unit: p.unit || matMap[p.code]?.unit || null })));
    setPrepNo(withdrawCtx.prepNo || null);
    onWithdrawCtxConsumed && onWithdrawCtxConsumed();
  }, [withdrawCtx, mats]);
  // prefill the purchase cart when receiving a PO ({ poNo, quoteNo, items:[{code,qty,price,unit}] })
  // สินค้าที่สั่งเป็น "หน่วยซื้อ" (เช่น ม้วน) → แปลงเข้าสต๊อกเป็นหน่วยหลัก: จำนวน ×แฟกเตอร์ · ราคา/หน่วย ÷แฟกเตอร์
  // PO ที่อ้างใบเสนอราคา → จำงานปลายทางไว้ เพื่อบันทึก "เบิกเข้างาน" ต่อท้ายการซื้อเข้าอัตโนมัติ (ต้นทุนจริงเข้างาน)
  React.useEffect(() => {
    if (!prefill || !prefill.items?.length || !mats.length) return;
    setType("purchase");
    setJobNo(prefill.poNo || "");
    setReceivePo(prefill.poNo || null);
    const rj = prefill.quoteNo ? (jobOrders.find((j) => j.quote_no === prefill.quoteNo && j.status !== "cancelled") || null) : null;
    setReceiveJob(rj ? { job_no: rj.job_no, team: rj.assigned_team || null } : null);
    // กันต้นทุนตกหล่นแบบเงียบ: PO อ้างใบเสนอราคาแต่ยังไม่มีใบงาน → เตือนชัด ๆ (ของจะเข้าสต๊อกเฉย ๆ ไม่เข้างาน)
    if (prefill.quoteNo && !rj) flash(`⚠️ ${prefill.quoteNo} ยังไม่มีใบงาน — รับรอบนี้ของจะเข้าสต๊อกอย่างเดียว ต้นทุนยังไม่เข้างาน · สร้างใบงานก่อนแล้วค่อยรับ ถ้าต้องการต้นทุนเข้างานอัตโนมัติ`, true);
    setLines(prefill.items.map((p) => {
      const m = matMap[p.code];
      const f = (p.unit && m?.purchaseUnit && p.unit === m.purchaseUnit && Number(m.purchaseQty) > 1) ? Number(m.purchaseQty) : 1;
      const price = p.price ?? m?.cost ?? 0;
      return { code: p.code, qty: (Number(p.qty) || 1) * f, price: Math.round(((Number(price) || 0) / f) * 100) / 100, unit: m?.unit || null };
    }));
    onPrefillConsumed && onPrefillConsumed();
  }, [prefill, mats, jobOrders]);
  const printWin = React.useRef(null);
  React.useEffect(() => {
    if (!printData) return;
    const t = setTimeout(() => { writeAndPrint(printWin.current); printWin.current = null; setPrintData(null); }, 120);
    return () => clearTimeout(t);
  }, [printData]);

  function flash(msg, bad) { setToast({ msg, bad }); setTimeout(() => setToast(null), 2800); }
  function changeType(t) { setType(t); setLines([]); setSelJob(""); setQtyByCode({}); setJobNo(""); setReceivePo(null); setReceiveJob(null); setPrepNo(null); setTxnDate(new Date().toISOString().slice(0, 10)); }

  // ----- cart helpers -----
  // สินค้า 2 หน่วย: บรรทัดถือ l.unit (เมตร/ม้วน) · สต๊อก/ต้นทุนคิดเป็นหน่วยหลักเสมอ (แปลงด้วย unitFactor)
  const lineUnit = (l, m) => l.unit || m?.unit || "";
  const linesView = lines.map((l) => {
    const m = matMap[l.code];
    const f = unitFactor(m, lineUnit(l, m));
    const baseQty = l.qty * f;                                             // จำนวนในหน่วยหลัก
    const unit = type === "purchase" ? (l.price ?? R2((m?.cost || 0) * f)) : (m?.cost || 0);
    const value = type === "purchase" ? unit * l.qty : unit * baseQty;     // ซื้อ: ราคา/หน่วยที่เลือก · อื่น ๆ: ต้นทุน/หน่วยหลัก
    return { ...l, m, f, baseQty, unit, value };
  });
  const cartTotal = linesView.reduce((a, x) => a + x.value, 0);
  function addLine() {
    if (!pickCode || pickQty < 1) return;
    const price = type === "purchase" ? (Number(pickPrice) || 0) : undefined;
    addItem(pickCode, Number(pickQty), price, matMap[pickCode]?.unit);
    setPickQty(1);
  }
  // add/merge a line directly (merge เฉพาะรหัส+หน่วยเดียวกัน)
  function addItem(code, qty, price, unit) {
    const q = Number(qty) || 0;
    if (!code || q < 1) return;
    const u = unit || matMap[code]?.unit || null;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.code === code && lineUnit(l, matMap[code]) === u);
      if (i >= 0) { const c = [...ls]; c[i] = { ...c[i], qty: c[i].qty + q, price }; return c; }
      return [...ls, { code, qty: q, price, unit: u }];
    });
  }
  function openQty(m) {
    const u = type === "purchase" && isDualUnit(m) ? m.purchaseUnit : m.unit;  // ซื้อ default หน่วยซื้อ (ม้วน) · เบิก/คืน default หน่วยหลัก
    setQtyModal(m); setModalQty(1); setModalUnit(u);
    setModalPrice(String(R2((m.cost ?? 0) * unitFactor(m, u))));
  }
  function changeModalUnit(u) {
    if (!qtyModal) return;
    const ratio = unitFactor(qtyModal, u) / unitFactor(qtyModal, modalUnit);
    setModalUnit(u);
    if (type === "purchase") setModalPrice((p) => String(R2((Number(p) || 0) * ratio)));  // คงราคา/หน่วยหลักเดิม
  }
  function addFromModal() {
    if (!qtyModal) return;
    addItem(qtyModal.code, modalQty, type === "purchase" ? (Number(modalPrice) || 0) : undefined, modalUnit);
    setQtyModal(null);
  }
  const removeLine = (l) => setLines((ls) => ls.filter((x) => !(x.code === l.code && x.unit === l.unit)));
  const cartValid = lines.length > 0 && (type === "purchase" || type === "damage" || team);

  async function submitCart() {
    if (!cartValid || busy) return;
    setBusy(true);
    try {
      // แปลงทุกบรรทัดเข้าหน่วยหลักก่อนบันทึก (สต๊อก/ต้นทุนเก็บเป็นหน่วยหลักเสมอ เช่น 2 ม้วน → 30 เมตร · ราคา/ม้วน ÷15)
      const norm = lines.map((l) => {
        const m = matMap[l.code];
        const f = unitFactor(m, lineUnit(l, m));
        return { code: l.code, qty: l.qty * f, unitCost: type === "purchase" ? R2((Number(l.price) || 0) / f) : (m?.cost || 0) };
      });
      await recordTransactions(norm.map((l) => ({
        type, job_no: jobNo, team: type === "damage" ? null : team,
        material_code: l.code, qty: l.qty,
        unit_cost: l.unitCost, reason, txn_date: txnDate || undefined,
        prep_no: type === "withdraw" ? prepNo : null,   // ผูกกลับใบเตรียมวัสดุ (เฉพาะรายการเบิก)
      })));
      // weighted moving average: recompute each purchased material's unit cost (ทั้งคู่เป็นหน่วยหลักแล้ว)
      // รวมยอดต่อรหัสก่อน เผื่อสินค้าเดียวกันมี 2 บรรทัดคนละหน่วย (เช่น 1 ม้วน + 5 เมตร)
      if (type === "purchase") {
        const byCode = {};
        norm.forEach((l) => { const b = byCode[l.code] || (byCode[l.code] = { qty: 0, val: 0 }); b.qty += l.qty; b.val += l.qty * l.unitCost; });
        for (const [code, b] of Object.entries(byCode)) {
          const m = matMap[code]; if (!m) continue;
          const denom = m.stock + b.qty;
          if (denom > 0) await updateMaterialCost(code, Math.round(((m.stock * m.cost + b.val) / denom) * 100) / 100);
        }
        if (receivePo) {
          await markPoReceived(receivePo);
          // PO อ้างใบเสนอราคา → เบิกออกเข้างานนั้นทันทีด้วย "ราคาซื้อจริง" (ต้นทุนจริงของออเดอร์เข้ากำไรงาน · สต๊อกไม่ค้าง)
          if (receiveJob?.job_no) {
            await recordTransactions(norm.map((l) => ({
              type: "withdraw", job_no: receiveJob.job_no, team: receiveJob.team,
              material_code: l.code, qty: l.qty, unit_cost: l.unitCost, txn_date: txnDate || undefined,
            })));
          }
          setReceivePo(null);
        }
      }
      flash(`${T.th} ${lines.length} รายการ สำเร็จ${receivePo ? (receiveJob?.job_no ? ` · ปิดใบสั่งซื้อ + เบิกเข้างาน ${receiveJob.job_no} แล้ว` : " · ปิดใบสั่งซื้อแล้ว") : ""}`);
      setReceiveJob(null);
      setLines([]); setJobNo("");
      await load();
    } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  // ----- job helpers -----
  const job = jobs.find((j) => j.job_no === selJob);
  const jobValid = job && job.lines.some((l) => Number(qtyByCode[l.code] || 0) > 0);
  async function submitJob() {
    if (!jobValid || busy) return;
    const rows = job.lines
      .map((l) => ({ code: l.code, qty: Number(qtyByCode[l.code] || 0), unitCost: l.unitCost, outstanding: l.outstanding }))
      .filter((l) => l.qty > 0);
    for (const r of rows) if (r.qty > r.outstanding) { flash("จำนวนเกินยอดคงค้าง", true); return; }
    setBusy(true);
    try {
      await recordTransactions(rows.map((r) => ({
        type, job_no: job.job_no, team: job.team, material_code: r.code, qty: r.qty, unit_cost: r.unitCost, reason, txn_date: txnDate || undefined,
      })));
      flash(`${T.th} งาน ${job.job_no} สำเร็จ`);
      setSelJob(""); setQtyByCode({});
      await load();
    } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  async function cancel(r) {
    if (!await confirmDialog(`ยกเลิกรายการนี้? (${TYPE_BY[r.type].th} ${matMap[r.material_code]?.th || r.material_code} ${r.qty}) — สต๊อกจะคืนค่าให้`)) return;
    try { await deleteTransaction(r.id); flash("ยกเลิกรายการแล้ว"); await load(); }
    catch (e) { flash("ยกเลิกไม่สำเร็จ: " + (e.message || e), true); }
  }
  // group the recent ledger by recording batch (ref_no) → one record action = one line,
  // even for the same job. Fallback key for legacy rows without a ref: created-at second.
  const groups = React.useMemo(() => {
    const map = new Map();
    for (const r of recent) {
      const key = r.ref_no || (r.created_at ? `t${String(r.created_at).slice(0, 19)}` : `id${r.id}`);
      let g = map.get(key);
      if (!g) { g = { key, ref_no: r.ref_no, type: r.type, job_no: r.job_no, team: r.team, date: r.txn_date, rows: [] }; map.set(key, g); }
      g.rows.push(r);
    }
    return [...map.values()];
  }, [recent]);
  // ค้นหาในรายการล่าสุด: เลข PO / ใบงาน / เลขเอกสาร (WD/PC/RT) / ทีม / รหัส-ชื่อวัสดุ
  const [refQ, setRefQ] = React.useState("");
  const shownGroups = refQ.trim()
    ? groups.filter((g) => matchText(refQ, g.ref_no, g.job_no, g.team)
        || g.rows.some((r) => matchText(refQ, r.material_code, matMap[r.material_code]?.th)))
    : groups;
  const toggle = (key) => setExpanded((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  function printGroup(g) {
    printWin.current = openPrintWindow();
    setPrintData({
      typeTh: TYPE_BY[g.type].th, ref_no: g.ref_no, job_no: g.job_no, team: g.team, date: g.date,
      lines: g.rows.map((x) => { const m = matMap[x.material_code]; return { th: m?.th || x.material_code, code: x.material_code, qty: x.qty, unit: m?.unit || "", value: Number(x.value || 0), reason: x.reason }; }),
      total: g.rows.reduce((a, x) => a + Number(x.value || 0), 0),
    });
  }
  async function saveEdit(r) {
    const q = Number(editQty) || 0;
    if (q < 1) { flash("จำนวนต้องมากกว่า 0", true); return; }
    if (q === Number(r.qty)) { setEditId(null); return; }
    try { await updateTransaction(r.id, q); setEditId(null); flash("แก้ไขจำนวนแล้ว ✓"); await load(); }
    catch (e) { flash("แก้ไขไม่สำเร็จ: " + (e.message || e), true); }
  }
  // ยกเลิกการรับเข้าทั้งชุด — สต๊อกคืนทุกรายการ · ถ้าชุดอ้างใบ PO → ใบเด้งกลับ "รอรับของ"
  async function cancelGroup(g) {
    const poNo = g.job_no && /^PO-/i.test(g.job_no) ? g.job_no : null;
    const reason = await confirmDialog({
      title: `ยกเลิก${TYPE_BY[g.type].th}ทั้งชุด (${g.rows.length} รายการ)?`,
      message: `สต๊อกจะคืนค่าทุกรายการ${poNo ? ` · ใบสั่งซื้อ ${poNo} จะกลับเป็น "รอรับของ" ให้รับใหม่ได้` : ""}`,
      confirmText: "ยกเลิกทั้งชุด",
      prompt: { label: "เหตุผลที่ยกเลิก", placeholder: "เช่น รับผิดใบ / จำนวนผิด", required: true },
    });
    if (reason === false) return;
    try {
      await cancelTransactionGroup({ ids: g.rows.map((r) => r.id), ref_no: g.ref_no, po_no: poNo }, reason);
      flash(`ยกเลิกทั้งชุดแล้ว${poNo ? ` · ${poNo} กลับเป็นรอรับของ` : ""} ✓`);
      await load();
    } catch (e) { flash("ยกเลิกไม่สำเร็จ: " + (e.message || e), true); }
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">บันทึกธุรกรรม <span className="page-title-en">Stock Movements</span></h1>
          <p className="page-sub">รับคืน/ตัดเสีย อ้างอิงงานที่เบิก → ต้นทุนงานแม่นยำ</p>
        </div>
      </div>

      <div className="damage-layout">
        {/* FORM */}
        <div className="card">
          <div className="seg" style={{ marginBottom: 16, display: "flex" }}>
            {allowedTypes.map((t) => (
              <button key={t.id} className={"seg-btn" + (type === t.id ? " on" : "")} onClick={() => changeType(t.id)}
                style={type === t.id ? { background: t.color, boxShadow: "none" } : {}}>{t.th}</button>
            ))}
          </div>

          {/* damage sub-mode */}
          {type === "damage" && (
            <div className="sub-toggle">
              <button className={damageMode === "job" ? "on" : ""} onClick={() => setDamageMode("job")}>เสียจากงานที่เบิก</button>
              <button className={damageMode === "central" ? "on" : ""} onClick={() => setDamageMode("central")}>เสียในคลัง (ส่วนกลาง)</button>
            </div>
          )}

          {/* ============ JOB FLOW (return / damage-from-job) ============ */}
          {flow === "job" && (
            <>
              <label className="fld"><span>เลือกงานที่เบิกค้าง · Open job</span>
                <Combo className="inp" value={selJob} onChange={(e) => { setSelJob(e.target.value); setQtyByCode({}); }}>
                  <option value="">— เลือกงาน —</option>
                  {jobs.filter((j) => !isTech || j.team === myTeam).map((j) => <option key={j.job_no} value={j.job_no}>{j.job_no} · {j.team || "-"} · ค้าง {j.lines.length} รายการ</option>)}
                </Combo>
              </label>
              {jobs.filter((j) => !isTech || j.team === myTeam).length === 0 && <div className="empty sm">ไม่มีงานที่เบิกค้างอยู่</div>}

              {type === "damage" && job && (
                <label className="fld"><span>สาเหตุ · Reason</span>
                  <Combo className="inp" value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Combo>
                </label>
              )}

              {job && (
                <div className="line-list">
                  {job.lines.map((l) => {
                    const m = matMap[l.code];
                    return (
                      <div className="job-line" key={l.code}>
                        <MaterialThumb mat={m || { color: "#888" }} size={32} radius={8} />
                        <div className="line-info">
                          <div className="line-name">{m?.th || l.code}</div>
                          <div className="line-sub">เบิก {fmtNum(l.withdrawn)} · คงค้าง <b>{fmtNum(l.outstanding)}</b> {m?.unit}</div>
                        </div>
                        <input className="inp job-qty" type="number" min="0" max={l.outstanding}
                          value={qtyByCode[l.code] || ""} placeholder="0"
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(l.outstanding, Number(e.target.value) || 0));
                            setQtyByCode((s) => ({ ...s, [l.code]: v }));
                          }} />
                      </div>
                    );
                  })}
                </div>
              )}

              <label className="fld" style={{ maxWidth: 190, marginBottom: 8 }}><span>วันที่เอกสาร</span>
                <input className="inp" type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
              </label>
              <button className="btn-primary big" disabled={!jobValid || busy} onClick={submitJob}
                style={jobValid ? { background: T.color, boxShadow: "none" } : {}}>
                <UIcon name={T.icon} size={17} color="#fff" /> {busy ? "กำลังบันทึก…" : `ยืนยัน${T.th}`}
              </button>
            </>
          )}

          {/* ============ CART FLOW (withdraw / purchase / central-damage) ============ */}
          {flow === "cart" && (
            <>
              {type !== "purchase" && type !== "damage" && (
                <label className="fld"><span>ทีม · Team</span>
                  <div className="team-pick-row">
                    {(isTech ? teams.filter((t) => t.id === myTeam) : teams).map((t) => (
                      <button key={t.id} className={"team-pick" + (team === t.id ? " on" : "")} onClick={() => { if (!isTech) { setTeam(t.id); setJobNo(""); } }}
                        style={team === t.id ? { background: t.color, borderColor: t.color, color: "#fff", cursor: isTech ? "default" : "pointer" } : {}}>
                        <span style={{ width: 8, height: 8, borderRadius: 9, background: team === t.id ? "#fff" : t.color }} />
                        {t.name.replace("Team ", "")}
                      </button>
                    ))}
                  </div>
                </label>
              )}

              <div className="fld-row">
                {type === "purchase" && (
                  <label className="fld"><span>เลขใบสั่งซื้อ (PO)</span>
                    <input className="inp" value={jobNo} onChange={(e) => setJobNo(e.target.value)} placeholder="เช่น PO-260610-01" />
                    {receivePo && (receiveJob?.job_no
                      ? <span className="jo-dim" style={{ marginTop: 4, color: "#0a6b3d", fontWeight: 600 }}>✅ ยืนยันแล้วระบบจะ “เบิกเข้างาน {receiveJob.job_no}” ให้อัตโนมัติ ด้วยราคาซื้อจริง (PO ผูกใบเสนอราคา)</span>
                      : <span className="jo-dim" style={{ marginTop: 4 }}>รับตามใบสั่งซื้อ {receivePo} · เข้าสต๊อกอย่างเดียว (PO ไม่ได้ผูกใบเสนอราคา หรือยังไม่มีใบงาน)</span>)}
                  </label>
                )}
                {type !== "purchase" && type !== "damage" && (
                  <label className="fld"><span>ใบงานที่เบิกให้ · Job</span>
                    {!team ? <div className="inp" style={{ color: "var(--ink-3)" }}>เลือกทีมก่อน</div>
                      : teamJobs.length ? (
                        <Combo className="inp" value={jobNo} onChange={(e) => setJobNo(e.target.value)}>
                          <option value="">— เลือกใบงานของทีมนี้ —</option>
                          {teamJobs.map((j) => <option key={j.job_no} value={j.job_no}>{j.job_no} · {j.title || j.customerName || "งาน"}{j.scheduled_at ? ` · ${scheduleLabel(j)}` : ""}</option>)}
                        </Combo>
                      ) : (
                        <input className="inp" value={jobNo} onChange={(e) => setJobNo(e.target.value)} placeholder="ทีมนี้ยังไม่มีใบงาน — พิมพ์เลขงานเองได้" />
                      )}
                  </label>
                )}
                {type === "damage" && (
                  <label className="fld"><span>สาเหตุ · Reason</span>
                    <Combo className="inp" value={reason} onChange={(e) => setReason(e.target.value)}>
                      {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </Combo>
                  </label>
                )}
              </div>

              <div className="fld"><span>เพิ่มรายการวัสดุ</span>
                <div className="line-add" style={{ marginBottom: 6, flexWrap: "wrap" }}>
                  <Combo className="inp" style={{ maxWidth: 150 }} value={mvKind} onChange={(e) => { setMvKind(e.target.value); setMvCat("all"); setMvBrand("all"); setMvType("all"); setMvBtu("all"); }}>
                    <option value="all">ทุกชนิด</option><option value="material">วัสดุ</option><option value="ac">เครื่องปรับอากาศ</option>
                  </Combo>
                  {mvKind === "material" && (
                    <Combo className="inp" value={mvCat} onChange={(e) => setMvCat(e.target.value)}>
                      <option value="all">ทุกหมวด</option>{matCats.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </Combo>
                  )}
                  {mvKind === "ac" && (
                    <>
                      <Combo className="inp" value={mvBrand} onChange={(e) => setMvBrand(e.target.value)}>
                        <option value="all">ทุกยี่ห้อ</option>{mvBrands.map((b) => <option key={b} value={b}>{b}</option>)}
                      </Combo>
                      <Combo className="inp" value={mvType} onChange={(e) => setMvType(e.target.value)}>
                        <option value="all">ทุกประเภท</option>{mvTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                      </Combo>
                      <Combo className="inp" value={mvBtu} onChange={(e) => setMvBtu(e.target.value)}>
                        <option value="all">ทุกขนาด BTU</option>{mvBtus.map((b) => <option key={b} value={b}>{fmtNum(b)} BTU</option>)}
                      </Combo>
                    </>
                  )}
                </div>
                <div className="cat-search mv-search" style={{ marginBottom: 8 }}>
                  <UIcon name="search" size={16} color="var(--ink-3)" />
                  <input placeholder="พิมพ์ค้นหา รหัส / ชื่อวัสดุ" value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} />
                  {pickSearch && <button className="cat-search-x" onClick={() => setPickSearch("")}><UIcon name="x" size={14} /></button>}
                </div>
                <div className="mv-grid">
                  {pickList.length === 0 && <div className="empty sm" style={{ gridColumn: "1/-1" }}>ไม่พบวัสดุตามตัวกรอง</div>}
                  {pickList.map((m) => (
                    <button type="button" className="mv-card" key={m.code} onClick={() => openQty(m)} title="กดเพื่อเพิ่มเข้ารายการ">
                      <div className="mv-card-photo"><MaterialThumb mat={m} size={108} radius={12} /></div>
                      <div className="mv-card-info">
                        <div className="mv-card-name">{m.th || m.name}</div>
                        <div className="mv-card-sub">{m.code}</div>
                        <div className="mv-card-stock">เหลือ <b>{fmtNum(m.stock)}</b> {m.unit}</div>
                      </div>
                      <span className="mv-card-add"><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> เพิ่ม</span>
                    </button>
                  ))}
                </div>
                {type === "purchase" && <p className="page-sub" style={{ marginTop: 6 }}>กดวัสดุ → ใส่ราคาที่ซื้อจริง + จำนวน · ระบบคำนวณต้นทุนเฉลี่ยใหม่ให้อัตโนมัติ</p>}
              </div>

              {linesView.length > 0 && (
                <div className="line-list">
                  {linesView.map((l) => (
                    <div className="line-row" key={l.code + "|" + (l.unit || "")}>
                      <MaterialThumb mat={l.m} size={32} radius={8} />
                      <div className="line-info"><div className="line-name">{l.m?.th}</div>
                        <div className="line-sub">{l.qty} {lineUnit(l, l.m)}{l.f > 1 ? ` (= ${fmtNum(l.baseQty)} ${l.m?.unit})` : ""}{type === "purchase" ? ` × ${fmtBaht(l.unit)}` : ""} · {fmtBaht(l.value)}</div></div>
                      <span className="line-dir" style={{ color: T.color }}>{T.dir > 0 ? "+" : "−"}{l.qty} {l.f > 1 ? lineUnit(l, l.m) : ""}</span>
                      <button className="line-x" onClick={() => removeLine(l)}><UIcon name="x" size={14} /></button>
                    </div>
                  ))}
                  <div className="line-total"><span>รวม {lines.length} รายการ</span><b>{fmtBaht(cartTotal)}</b></div>
                </div>
              )}

              <label className="fld" style={{ maxWidth: 190, marginBottom: 8 }}><span>วันที่เอกสาร</span>
                <input className="inp" type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
              </label>
              <button className="btn-primary big" disabled={!cartValid || busy} onClick={submitCart}
                style={cartValid ? { background: T.color, boxShadow: "none" } : {}}>
                <UIcon name={T.icon} size={17} color="#fff" /> {busy ? "กำลังบันทึก…" : `ยืนยัน${T.th} ${lines.length || ""} รายการ`}
              </button>
              {lines.length === 0 && <p className="page-sub" style={{ marginTop: 8 }}>เพิ่มวัสดุอย่างน้อย 1 รายการก่อนยืนยัน</p>}
            </>
          )}
        </div>

        {/* RECENT */}
        <div className="card">
          <div className="sec-head"><div className="sec-title">รายการล่าสุด <span className="sec-sub">{refQ.trim() ? `พบ ${shownGroups.length}/${groups.length} ชุด` : `${recent.length} รายการ`} · กดพิมพ์/ยกเลิกได้</span></div></div>
          <div className="cat-search" style={{ marginBottom: 8 }}>
            <UIcon name="search" size={16} color="var(--ink-3)" />
            <input placeholder="ค้นหาเลข PO / ใบงาน / เลขเอกสาร / วัสดุ" value={refQ} onChange={(e) => setRefQ(e.target.value)} />
            {refQ && <button className="cat-search-x" onClick={() => setRefQ("")}><UIcon name="x" size={14} /></button>}
          </div>
          {loading && <div className="empty sm">กำลังโหลด…</div>}
          {!loading && recent.length === 0 && <div className="empty sm">ยังไม่มีธุรกรรม</div>}
          {!loading && recent.length > 0 && shownGroups.length === 0 && <div className="empty sm">ไม่พบรายการที่ตรงกับ "{refQ}"</div>}
          <div className="ledger">
            {shownGroups.map((g) => {
              const mv = TYPE_BY[g.type];
              const open = expanded.has(g.key);
              const single = g.rows.length === 1;
              const firstM = matMap[g.rows[0].material_code];
              const total = g.rows.reduce((a, x) => a + Number(x.value || 0), 0);
              return (
                <div className={"ledger-group" + (open ? " open" : "")} key={g.key}>
                  <div className="ledger-row" role="button" tabIndex={0} onClick={() => toggle(g.key)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(g.key)}>
                    <span className="ledger-badge" style={{ background: `color-mix(in srgb, ${mv.color} 13%, white)`, color: mv.color }}>
                      <UIcon name={mv.icon} size={14} strokeWidth={2} color={mv.color} />
                    </span>
                    <div className="ledger-info">
                      <div className="ledger-type" style={{ color: mv.color }}>{mv.th} · {single ? (firstM ? firstM.th : g.rows[0].material_code) : `${g.rows.length} รายการ`}</div>
                      <div className="ledger-meta">
                        {g.ref_no ? <><span className="tx-ref">{g.ref_no}</span><span className="dot">·</span></> : null}
                        {g.team ? <>{g.team}<span className="dot">·</span></> : null}
                        {g.job_no ? <><span className="tx-job">{g.job_no}</span><span className="dot">·</span></> : null}
                        {g.date}
                      </div>
                    </div>
                    <div className="ledger-amt">
                      <div className="ledger-qty" style={{ color: mv.color }}>{single ? `${mv.dir > 0 ? "+" : "−"}${fmtNum(g.rows[0].qty)} ${firstM?.unit || ""}` : `${g.rows.length} ชนิด`}</div>
                      <div className="ledger-date">{fmtBaht(total)}</div>
                    </div>
                    <div className="led-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="led-btn" title="พิมพ์" onClick={() => printGroup(g)}><UIcon name="catalog" size={14} /></button>
                      {canEditPast && g.type === "purchase" && <button className="led-btn danger" title={g.job_no && /^PO-/i.test(g.job_no) ? `ยกเลิกรับเข้าทั้งใบ — ${g.job_no} กลับเป็นรอรับของ` : "ยกเลิกทั้งชุด"} onClick={() => cancelGroup(g)}><UIcon name="trash" size={14} /></button>}
                      <button className="led-btn" title={open ? "ย่อ" : "ดูรายการ"} onClick={() => toggle(g.key)}><UIcon name={open ? "chevD" : "chevR"} size={14} /></button>
                    </div>
                  </div>
                  {open && (
                    <div className="ledger-items">
                      {g.rows.map((r) => { const m = matMap[r.material_code]; const editing = editId === r.id; return (
                        <div className="ledger-item" key={r.id}>
                          <div className="li-name">{m ? m.th : r.material_code} <span className="li-code">{r.material_code}</span>{r.reason ? <span className="reason-tag sm">{r.reason}</span> : null}</div>
                          {editing
                            ? <span className="inp inp-unit li-edit"><input type="number" min="1" value={editQty} autoFocus onChange={(e) => setEditQty(e.target.value)} /><span className="unit-suf">{m?.unit || ""}</span></span>
                            : <span className="li-qty" style={{ color: mv.color }}>{mv.dir > 0 ? "+" : "−"}{fmtNum(r.qty)} {m?.unit || ""}</span>}
                          <span className="li-val">{fmtBaht(r.value)}</span>
                          <div className="led-actions">
                            {canEditPast && (editing
                              ? <><button className="led-btn" title="บันทึก" onClick={() => saveEdit(r)}><UIcon name="check" size={14} /></button>
                                   <button className="led-btn" title="ยกเลิกแก้ไข" onClick={() => setEditId(null)}><UIcon name="x" size={14} /></button></>
                              : <>
                                  <button className="led-btn" title="แก้ไขจำนวน" onClick={() => { setEditId(r.id); setEditQty(String(r.qty)); }}><UIcon name="edit" size={14} /></button>
                                  <button className="led-btn danger" title="ยกเลิก" onClick={() => cancel(r)}><UIcon name="trash" size={14} /></button>
                                </>)}
                          </div>
                        </div>
                      ); })}
                      {!single && <div className="ledger-item li-total"><div className="li-name">รวม {g.rows.length} รายการ</div><span className="li-val"><b>{fmtBaht(total)}</b></span><div /></div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* qty picker modal (food-menu style) */}
      {qtyModal && (
        <div className="modal-overlay" onClick={() => setQtyModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <div className="modal-head"><div className="modal-title">เพิ่มรายการ · {T.th}</div>
              <button className="modal-x" onClick={() => setQtyModal(null)}><UIcon name="x" size={18} /></button></div>
            <div className="modal-body">
              <div className="mv-pick-head">
                <MaterialThumb mat={qtyModal} size={64} radius={12} />
                <div><div className="mv-pick-name">{qtyModal.th || qtyModal.name}</div>
                  <div className="mv-pick-sub">{qtyModal.code} · เหลือ <b>{fmtNum(qtyModal.stock)}</b> {qtyModal.unit}</div></div>
              </div>
              {isDualUnit(qtyModal) && (
                <label className="fld"><span>หน่วยนับ</span>
                  <div className="cat-filter" style={{ margin: 0 }}>
                    {[qtyModal.unit, qtyModal.purchaseUnit].map((u) => (
                      <button type="button" key={u} className={"cat-chip" + (modalUnit === u ? " on" : "")} onClick={() => changeModalUnit(u)}
                        style={modalUnit === u ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{u}{u === qtyModal.purchaseUnit ? ` (1 ${u} = ${fmtNum(qtyModal.purchaseQty)} ${qtyModal.unit})` : ""}</button>
                    ))}
                  </div>
                </label>
              )}
              {type === "purchase" && (
                <label className="fld"><span>ราคา/หน่วยที่ซื้อ</span>
                  <div className="inp inp-unit"><span className="unit-pre">฿</span>
                    <input type="number" min="0" step="0.01" value={modalPrice} autoFocus onChange={(e) => setModalPrice(e.target.value)} />
                    <span className="unit-suf">/{modalUnit || qtyModal.unit || "หน่วย"}</span></div>
                </label>
              )}
              <label className="fld"><span>จำนวน</span>
                <div className="mv-qty-step">
                  <button type="button" onClick={() => setModalQty((q) => Math.max(1, (Number(q) || 1) - 1))}><UIcon name="minus" size={18} /></button>
                  <NumIn className="" min="1" value={modalQty} onChange={(n) => setModalQty(Math.max(1, n))} />
                  <span className="mv-qty-unit">{modalUnit || qtyModal.unit || "หน่วย"}</span>
                  <button type="button" onClick={() => setModalQty((q) => (Number(q) || 1) + 1)}><UIcon name="plus" size={18} /></button>
                </div>
              </label>
            </div>
            <div className="modal-foot"><button className="btn-ghost" onClick={() => setQtyModal(null)}>ยกเลิก</button>
              <button className="btn-primary" style={{ background: T.color }} onClick={addFromModal}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่มเข้ารายการ</button></div>
          </div>
        </div>
      )}

      {/* print slip (hidden on screen) */}
      <div className="print-area">
        {printData && (
          <div className="slip">
            <div className="slip-head">
              <div className="slip-brand">
                <img src="/logo.png" alt="" className="slip-logo" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                AMC Management
              </div>
              <div className="slip-title">ใบ{printData.typeTh}</div>
            </div>
            <div className="slip-meta">
              <div>เลขที่อ้างอิง: <b>{printData.ref_no || "-"}</b></div>
              <div>ประเภท: <b>{printData.typeTh}</b></div>
              <div>เลขที่งาน/PO: <b>{printData.job_no || "-"}</b></div>
              <div>ทีม: <b>{printData.team || "-"}</b></div>
              <div>วันที่: <b>{printData.date}</b></div>
            </div>
            <table className="slip-table">
              <thead><tr><th>#</th><th>วัสดุ</th><th>รหัส</th><th className="r">จำนวน</th><th className="r">มูลค่า</th></tr></thead>
              <tbody>
                {printData.lines.map((l, i) => (
                  <tr key={i}><td>{i + 1}</td><td>{l.th}{l.reason ? ` (${l.reason})` : ""}</td><td>{l.code}</td><td className="r">{fmtNum(l.qty)} {l.unit}</td><td className="r">{fmtBaht(l.value)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan="4" className="r">รวมทั้งสิ้น</td><td className="r"><b>{fmtBaht(printData.total)}</b></td></tr></tfoot>
            </table>
            <div className="slip-sign"><div>ผู้เบิก/ผู้รับ ......................</div><div>ผู้อนุมัติ ......................</div></div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600,
          padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center",
        }}>{toast.msg}</div>
      )}
    </div>
  );
}
