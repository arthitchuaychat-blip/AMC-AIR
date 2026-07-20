import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import { listPurchaseOrders, savePurchaseOrder, deletePurchaseOrder, cancelPurchaseOrder, listMaterialsLite, listSuppliers, listApprovedQuotesLite, requestPoPayment, getCompanies, docNoTaken, markPoReceived, lastPurchaseOf, repriceReceivedPo } from "../lib/api";
import { InternalNoteField, InternalNoteTag } from "./InternalNote";
import { fmtBaht, fmtNum, matchText, fmtDocDate } from "../lib/format";
import { can } from "../lib/permissions";
import { MaterialThumb, UIcon } from "../icons";
import DateRangeBar, { inDateRange, defaultDocRange } from "./DateRangeBar";
import ItemPicker from "./ItemPicker";
import ItemBrowser from "./ItemBrowser";
import UnitPick, { unitFactor } from "./UnitPick";
import Combo from "./Combo";
import DocSlip from "./DocSlip";
import DocCardHead from "./DocCard";
import NumIn from "./NumIn";
import { useDocPeek } from "./DocPeek";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";

const STATUS = { open: { th: "รอรับของ", cls: "b-amber" }, received: { th: "รับแล้ว", cls: "b-green" }, cancelled: { th: "ยกเลิก", cls: "b-red" } };
const PO_FILTERS = [{ id: "all", label: "ทั้งหมด" }, { id: "open", label: "รอรับของ" }, { id: "received", label: "รับแล้ว" }, { id: "cancelled", label: "ยกเลิก" }];
// สถานะการจ่ายเงิน (แกนที่ 2 — อิสระจากการรับของ)
const PAY_STATUS = { unpaid: { th: "ยังไม่จ่าย", cls: "b-grey" }, pending: { th: "รออนุมัติจ่าย", cls: "b-amber" }, paid: { th: "จ่ายแล้ว", cls: "b-green" } };
const PAY_FILTERS = [{ id: "all", label: "การจ่าย: ทั้งหมด" }, { id: "unpaid", label: "ยังไม่จ่าย" }, { id: "pending", label: "รออนุมัติจ่าย" }, { id: "paid", label: "จ่ายแล้ว" }];

function genPoNo() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  // ละเอียดถึงวินาที — เดิมแค่นาที 2 คนสร้างพร้อมกันเลขชน แล้ว upsert ทับใบเดิมเงียบ ๆ
  return `PO-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
const todayStr = () => new Date().toISOString().slice(0, 10);
const R2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const VAT_MODES = [["incl", "ราคารวม VAT (ถอด VAT ให้)"], ["excl", "ราคาก่อน VAT (บวก VAT ท้าย)"], ["none", "ไม่มี VAT"]];

// searchable supplier field — suggests names from the Suppliers register (mig 092), still allows free text
function SupplierPicker({ value, onChange }) {
  const [sups, setSups] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { listSuppliers().then((s) => setSups(s.map((x) => x.name).filter(Boolean))).catch(() => {}); }, []);
  const v = (value || "").trim();
  const matches = (v ? sups.filter((n) => matchText(v, n)) : sups).slice(0, 8);
  return (
    <div style={{ position: "relative" }}>
      <input className="inp" value={value} placeholder="พิมพ์ค้นหาชื่อผู้ขาย…"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && matches.length > 0 && (
        <div className="sup-ac">
          {matches.map((n) => (
            <button type="button" key={n} className="sup-ac-item" onMouseDown={() => { onChange(n); setOpen(false); }}>{n}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PurchaseOrders({ role, prefill, onPrefillConsumed, onReceive, focus, onFocusConsumed, onOpenQuote, onOpenJob }) {
  // ชิป "อ้างอิง QT-…" → พรีวิวใบเสนอราคาแผงขวาก่อน · "เปิดหน้าเต็ม" ค่อยเด้งไปเมนูใบเสนอราคา
  const [peekEl, openPeek] = useDocPeek((t, n) => { if (t === "quote" && onOpenQuote) onOpenQuote(n); else if (t === "job" && onOpenJob) onOpenJob(n); });
  const isAdmin = can(role, "po", "edit");
  // กติกาเจ้าของ: ยกเลิก = ฝ่ายขาย/ธุรการวัสดุ (และผู้มีสิทธิ์แก้ PO) · ลบถาวร = ธุรการเท่านั้น (เหมือนเอกสารอื่นทุกใบ)
  const canCancel = isAdmin || role === "sales" || role === "stock";
  const canDelete = role === "admin";
  const [pos, setPos] = React.useState([]);
  const [mats, setMats] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [editing, setEditing] = React.useState(null); // {po_no, supplier, note, vat, quote_no, items:[{code,qty,price}]} or null
  const [q, setQ] = React.useState("");
  const [statusF, setStatusF] = React.useState("all");
  const [payF, setPayF] = React.useState("all");
  const [expanded, setExpanded] = React.useState(() => new Set()); // การ์ดที่กางรายการเต็ม (default ย่อเหลือ 3 บรรทัด)
  const toggleExpand = (poNo) => setExpanded((s) => { const n = new Set(s); n.has(poNo) ? n.delete(poNo) : n.add(poNo); return n; });
  const [dateR, setDateR] = React.useState(defaultDocRange);   // เปิดมาเห็น 6 เดือนล่าสุด · เก่ากว่านั้นกด "ดูทั้งหมด"
  // ใบที่ถูกช่วงวันที่ตัดออก — ต้องบอกจำนวนบนแถบตัวกรอง ห้ามซ่อนเงียบ ๆ
  const dateHidden = React.useMemo(() => (pos || []).filter((x) => !inDateRange(x.issue_date || x.created_at, dateR)).length, [pos, dateR]);
  const [quotes, setQuotes] = React.useState([]);        // ใบเสนอราคาที่อนุมัติแล้ว (ตัวเลือกอ้างอิง)
  const [sups, setSups] = React.useState([]);            // ทะเบียนผู้ขายฉบับเต็ม (ที่อยู่/เลขภาษี สำหรับใบพิมพ์)
  const [companies, setCompanies] = React.useState({ vat: {}, novat: {} });
  const [printPo, setPrintPo] = React.useState(null);
  const printWin = React.useRef(null);
  React.useEffect(() => { if (!printPo) return; const t = setTimeout(() => { writeAndPrint(printWin.current); printWin.current = null; setPrintPo(null); }, 120); return () => clearTimeout(t); }, [printPo]);

  const matMap = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);
  // ประเภทสินค้าของใบ: คอลัมน์ po_type (mig 139) · ใบเก่าที่ยังไม่มี → เดาจากรายการ (มีแอร์ = ac)
  const poTypeOf = (po) => po.po_type || ((po.items || []).some((it) => matMap[it.material_code]?.kind === "ac") ? "ac" : "material");
  const [typeF, setTypeF] = React.useState("all");
  // base หลังค้นหา+วันที่ — ใช้นับจำนวนบนชิปตัวกรอง
  // กรองด้วยวันที่เดียวกับที่การ์ดแสดง (issue_date) ไม่ใช่วันที่สร้างแถว — ใบลงวันที่ย้อนหลังเคยหลุดช่วงที่เลือก
  const fl0 = pos.filter((po) => inDateRange(po.issue_date || po.created_at, dateR)
    && (matchText(q, po.po_no, po.supplier, po.note, po.internal_note, po.quote_no, po.customerName, po.jobNo, po.teamName) || (po.items || []).some((it) => matchText(q, it.material_code, matMap[it.material_code]?.th))));
  const [vatF, setVatF] = React.useState("all");   // งาน VAT / NOVAT (ตามธง vat ของใบ)
  const isVatMatch = (po, v) => v === "all" || (v === "vat" ? !!po.vat : !po.vat);
  const nStatus = (v) => fl0.filter((po) => v === "all" || po.status === v).length;
  const nPay = (v) => fl0.filter((po) => v === "all" || po.paymentStatus === v).length;
  const nType = (v) => fl0.filter((po) => v === "all" || poTypeOf(po) === v).length;
  const nVat = (v) => fl0.filter((po) => isVatMatch(po, v)).length;
  const shown = fl0.filter((po) => (statusF === "all" || po.status === statusF)
    && (payF === "all" || po.paymentStatus === payF)
    && (typeF === "all" || poTypeOf(po) === typeF)
    && isVatMatch(po, vatF));

  async function load() {
    setLoading(true);
    try {
      const [p, m, qt, sp, co] = await Promise.all([
        listPurchaseOrders(), listMaterialsLite(),
        listApprovedQuotesLite().catch(() => []), listSuppliers().catch(() => []), getCompanies().catch(() => null),
      ]);
      setPos(p); setMats(m); setQuotes(qt); setSups(sp); if (co) setCompanies(co);
    }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  // เปิดหน้านี้จากชิปเชื่อมโยงของใบเสนอราคา (#po/PO-xxx) → ค้นหาใบนั้นให้เลย + ล้างตัวกรองที่อาจบังไว้
  React.useEffect(() => { if (focus) { setQ(focus); setStatusF("all"); setPayF("all"); setDateR({ from: "", to: "" }); onFocusConsumed && onFocusConsumed(); } }, [focus]);
  function flash(msg, bad) { setToast({ msg, bad }); setTimeout(() => setToast(null), 2800); }

  // open editor prefilled — 2 ทาง: (1) สั่งซ้ำจากแดชบอร์ด (array ของ {code,qty})
  // (2) สร้างจากใบเสนอราคาที่อนุมัติ ({quoteNo, items}) → ผูก quote ให้เลย ราคา default = ต้นทุน/หน่วยหลัก
  React.useEffect(() => {
    if (!prefill || !mats.length) return;
    const src = Array.isArray(prefill) ? prefill : (prefill.items || []);
    const quoteNo = Array.isArray(prefill) ? "" : (prefill.quoteNo || "");
    if (!src.length && !quoteNo) { onPrefillConsumed && onPrefillConsumed(); return; }
    setEditing({ po_no: genPoNo(), supplier: "", note: "", internal_note: "", vat: true, priceIncl: false, quote_no: quoteNo, prep_no: (Array.isArray(prefill) ? "" : prefill.prepNo) || "", issue_date: todayStr(),
      // ประเภทสินค้า: มากับ prefill (สั่งซื้อแอร์ = "ac") หรือเดาจากรายการ (มีแอร์ → ac) — ผู้ใช้เปลี่ยนได้ก่อนบันทึก
      po_type: (!Array.isArray(prefill) && prefill.poType) || (src.some((p) => matMap[p.code]?.kind === "ac") ? "ac" : "material"),
      // จำนวนจากใบเสนอราคาเป็น "หน่วยหลัก" (เมตร/ชุด) → ตั้งหน่วยบรรทัดเป็นหน่วยหลัก + ราคา = ต้นทุน/หน่วยหลัก
      // (อยากสั่งเป็นม้วน ค่อยสลับหน่วยที่บรรทัด ระบบแปลงราคาให้) · ข้ามรหัสที่ไม่มีในแคตตาล็อก
      // หน่วยจากใบเตรียมวัสดุ (p.unit) มาก่อน — ถ้าเป็นหน่วยซื้อ (ม้วน) ราคา/หน่วย = ต้นทุนต่อหน่วยหลัก × แฟกเตอร์
      items: src.filter((p) => matMap[p.code]).map((p) => { const m = matMap[p.code]; const u = p.unit || m.unit || null; const f = unitFactor(m, u); return { code: p.code, qty: Number(p.qty) || 1, price: Math.round((Number(m.cost) || 0) * f * 100) / 100, unit: u }; }) });
    onPrefillConsumed && onPrefillConsumed();
  }, [prefill, mats]);

  function startNew() { setEditing({ po_no: genPoNo(), supplier: "", note: "", internal_note: "", vat: true, priceIncl: false, quote_no: "", po_type: "", issue_date: todayStr(), items: [] }); }
  function startEdit(po) {
    const incl = !!po.vat && !!po.price_incl;   // stored price is pre-VAT → show gross in the field when incl mode
    setEditing({ _edit: true, _paymentStatus: po.paymentStatus || "unpaid", po_no: po.po_no, status: po.status, supplier: po.supplier || "", note: po.note || "", internal_note: po.internal_note || "", vat: !!po.vat, priceIncl: !!po.price_incl, quote_no: po.quote_no || "", prep_no: po.prep_no || "", po_type: po.po_type || po.poType || "", issue_date: po.issue_date || (po.created_at || "").slice(0, 10),
      items: po.items.map((i) => ({ code: i.material_code, qty: i.qty, price: incl ? R2((Number(i.price) || 0) * 1.07) : (Number(i.price) || 0), unit: i.unit || null })) });
  }

  const setItem = (code, field, val) => setEditing((e) => ({ ...e, items: e.items.map((x) => x.code === code ? { ...x, [field]: val } : x) }));
  const removeItem = (code) => setEditing((e) => ({ ...e, items: e.items.filter((x) => x.code !== code) }));
  // หน่วยซื้อ: 1 purchaseUnit (ม้วน) = purchaseQty หน่วยหลัก (15 เมตร) — ใบสั่งซื้อกรอกเป็นหน่วยซื้อ
  const puFactor = (m) => (m?.purchaseUnit && Number(m.purchaseQty) > 1) ? Number(m.purchaseQty) : 1;
  const lineUnit = (it, m) => it.unit || m?.purchaseUnit || m?.unit || "";
  // add from ItemPicker/ItemBrowser (same UX as sales docs) — price defaults to the material cost
  // per PURCHASE unit (cost × factor); in "รวม VAT" mode the field holds the gross price (× 1.07)
  const addLinePO = (m, _target, qty = 1) => {
    setEditing((e) => {
      const add = Math.max(1, Number(qty) || 1);
      const incl = !!e.vat && !!e.priceIncl;
      const base = (Number(m.cost) || 0) * puFactor(m);
      const unitPrice = incl ? R2(base * 1.07) : R2(base);
      const i = e.items.findIndex((x) => x.code === m.code);
      if (i >= 0) { const items = [...e.items]; items[i] = { ...items[i], qty: items[i].qty + add }; return { ...e, items }; }
      return { ...e, items: [...e.items, { code: m.code, qty: add, price: unitPrice, unit: m.purchaseUnit || m.unit || null }] };
    });
    // hint ราคาซื้อครั้งล่าสุด (ต้นทุนเฉลี่ยที่เติมให้มักเพี้ยนจากราคาหน้าร้านจริง) — โหลดเบื้องหลัง โชว์ใต้บรรทัด
    lastPurchaseOf(m.code).then((lp) => {
      if (!lp) return;
      setEditing((e) => e ? { ...e, items: e.items.map((x) => x.code === m.code && x._last === undefined ? { ...x, _last: lp } : x) } : e);
    }).catch(() => {});
  };
  // เปลี่ยนหน่วยนับของบรรทัด (เมตร ↔ ม้วน) → แปลงราคา/หน่วยตามสัดส่วน (ราคา/หน่วยหลักคงเดิม)
  const changeLineUnit = (code, m, nu) => setEditing((e) => ({ ...e, items: e.items.map((x) => {
    if (x.code !== code) return x;
    const ratio = unitFactor(m, nu) / unitFactor(m, lineUnit(x, m));
    return { ...x, unit: nu, price: R2((Number(x.price) || 0) * ratio) };
  }) }));
  // switch VAT/price mode — keep each line's NET price constant across the switch
  function setVatMode(mode) {
    setEditing((e) => {
      const curIncl = !!e.vat && !!e.priceIncl;
      const newVat = mode !== "none", newIncl = mode === "incl";
      const items = e.items.map((it) => {
        const net = curIncl ? (Number(it.price) || 0) / 1.07 : (Number(it.price) || 0);
        return { ...it, price: R2(newIncl ? net * 1.07 : net) };
      });
      return { ...e, vat: newVat, priceIncl: newIncl, items };
    });
  }

  // per-line entered price is GROSS in "รวม VAT" mode, otherwise NET. Totals always shown as ก่อน VAT → VAT → รวม
  const editIncl = !!editing?.vat && !!editing?.priceIncl;
  const netUnit = (it) => editIncl ? (Number(it.price) || 0) / 1.07 : (Number(it.price) || 0);
  const editSub = editing ? editing.items.reduce((a, x) => a + netUnit(x) * (Number(x.qty) || 0), 0) : 0;
  const editVatAmt = editing?.vat ? editSub * 0.07 : 0;
  const editGrand = editSub + editVatAmt;
  const vatMode = !editing?.vat ? "none" : (editing?.priceIncl ? "incl" : "excl");

  async function save() {
    if (!editing.po_no.trim()) return flash("ใส่เลขใบสั่งซื้อ", true);
    if (!editing.po_type) return flash("เลือก 'ประเภทสินค้า' ก่อนบันทึก — เครื่องปรับอากาศ หรือ วัสดุและอะไหล่", true);
    if (!editing.items.length) return flash("เพิ่มวัสดุอย่างน้อย 1 รายการ", true);
    // กติกาธุรกิจ: สั่งแอร์เมื่อมีออเดอร์เท่านั้น → ใบที่มีแอร์ต้องอ้างใบเสนอราคาที่อนุมัติแล้ว (วัสดุล้วนไม่บังคับ)
    if (editing.items.some((it) => matMap[it.code]?.kind === "ac") && !editing.quote_no)
      return flash("ใบสั่งซื้อที่มีเครื่องปรับอากาศ ต้องอ้างอิงใบเสนอราคาที่อนุมัติแล้ว (สั่งตามออเดอร์เท่านั้น)", true);
    if (editing._edit && !await confirmDialog(`ยืนยันบันทึกการแก้ไขใบสั่งซื้อ ${editing.po_no} ?`)) return;
    // การ์ดใบที่ตั้งเบิกจ่ายแล้ว: ยอดใบเบิกถูก freeze ตอนส่งขอ — แก้รายการแล้วยอดจะไม่ตรงกัน ต้องรู้ตัว
    if (editing._edit && editing._paymentStatus && editing._paymentStatus !== "unpaid"
      && !await confirmDialog("⚠️ ใบนี้ส่งขออนุมัติจ่าย/จ่ายแล้ว — ยอดในใบเบิกจะ \"ไม่\" อัปเดตตามที่แก้\nถ้ายอดเปลี่ยน ให้ยกเลิกใบเบิกเดิมแล้วตั้งเบิกใหม่\n\nยืนยันบันทึกการแก้ไข?")) return;
    let poNo = editing.po_no.trim();
    // ใบใหม่: เช็คเลขซ้ำก่อน (save เป็น upsert — เลขชนแล้วทับใบเดิมเงียบ ๆ) → ชนก็ออกเลขใหม่ให้อัตโนมัติ
    if (!editing._edit && await docNoTaken("purchase_orders", poNo).catch(() => false)) {
      const renum = genPoNo();
      if (renum === poNo || await docNoTaken("purchase_orders", renum).catch(() => false)) return flash(`เลขที่ ${poNo} ถูกใช้แล้ว — เปลี่ยนเลขใบก่อนบันทึก`, true);
      poNo = renum; flash(`เลขที่ใบซ้ำกับใบเดิม — ออกเลขใหม่ให้เป็น ${renum}`);
    }
    const incl = !!editing.vat && !!editing.priceIncl;
    const items = editing.items.map((it) => ({ ...it, price: incl ? (Number(it.price) || 0) / 1.07 : (Number(it.price) || 0) })); // store pre-VAT price
    try {
      await savePurchaseOrder({ po_no: poNo, supplier: editing.supplier, note: editing.note, internal_note: editing.internal_note, vat: editing.vat, price_incl: !!editing.priceIncl, quote_no: editing.quote_no || null, prep_no: editing.prep_no || null, po_type: editing.po_type || null, issue_date: editing.issue_date || null, status: editing.status || "open" }, items);
      // ใบที่รับของเข้าคลังไปแล้ว: แก้ราคาตามบิลซัพฯ ต้องไล่แก้ต้นทุนที่บันทึกไว้ในคลัง/ต้นทุนงานด้วย
      let repriced = 0;
      if (editing._edit && editing.status === "received") repriced = await repriceReceivedPo(poNo, items).catch(() => 0);
      flash(repriced ? `บันทึกใบสั่งซื้อแล้ว · ปรับต้นทุนในคลัง/งานตามราคาใหม่ ${repriced} รายการ` : "บันทึกใบสั่งซื้อแล้ว");
      setEditing(null); await load();
    }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  // ปิดใบเอง (รับของครบนอกระบบ/รับบางส่วนจนครบแล้ว) — ไม่บันทึกของเข้าสต๊อกเพิ่ม
  async function closePoManual(po) {
    if (!await confirmDialog(`ปิดใบ ${po.po_no} เป็น "รับแล้ว" โดยไม่บันทึกของเข้าเพิ่ม?\nใช้เมื่อทยอยรับของครบแล้ว (ของที่รับไปแล้วอยู่ในสต๊อกเรียบร้อย)`)) return;
    try { await markPoReceived(po.po_no); flash(`ปิดใบ ${po.po_no} แล้ว ✓`); await load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  // ส่งขออนุมัติจ่ายเงิน → โผล่ในเมนูเบิกจ่าย (อนุมัติ → จ่าย+เลือกบัญชี → PO ขึ้น "จ่ายแล้ว" อัตโนมัติ)
  async function requestPay(po) {
    if (!await confirmDialog(`ส่งขออนุมัติจ่ายค่าสินค้า ${po.po_no} · ${fmtBaht(po.total)}${po.vat ? " (รวม VAT)" : ""} ?\nคำขอจะไปรออนุมัติในเมนู "เบิกจ่าย"`)) return;
    try { await requestPoPayment(po); flash("ส่งขออนุมัติจ่ายแล้ว — รออนุมัติในเมนูเบิกจ่าย ✓"); await load(); }
    catch (e) { flash("ส่งไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(po) {
    const reason = await confirmDialog({ title: `ลบใบสั่งซื้อ ${po.po_no}?`, message: "ลบถาวร (บันทึกเหตุผลไว้ในประวัติ)", confirmText: "ลบ", prompt: { label: "เหตุผลที่ลบ", placeholder: "เช่น ทำผิด · ซ้ำ", required: true } });
    if (reason === false) return;
    try { await deletePurchaseOrder(po.po_no, reason); flash("ลบใบสั่งซื้อแล้ว"); await load(); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  // ยกเลิกใบสั่งซื้อ: เฉพาะใบที่ยังไม่รับของและยังไม่ผูกการจ่าย — ปลดล็อกให้ยกเลิกใบเสนอราคาต้นทางต่อได้
  async function cancelPo(po) {
    if (po.status !== "open") return alert("ยกเลิกได้เฉพาะใบที่ยังไม่รับของ");
    if (po.paymentStatus && po.paymentStatus !== "unpaid") return alert("ใบนี้ผูกการจ่ายเงินแล้ว — จัดการรายการเบิกจ่ายก่อน");
    const reason = await confirmDialog({ title: `ยกเลิกใบสั่งซื้อ ${po.po_no}?`, message: "เก็บประวัติไว้ ไม่ลบทิ้ง", confirmText: "ยกเลิกใบนี้", prompt: { label: "เหตุผลที่ยกเลิก", placeholder: "เช่น เปลี่ยนร้าน · งานยกเลิก", required: true } });
    if (reason === false) return;
    try { await cancelPurchaseOrder(po.po_no, reason); flash("ยกเลิกใบสั่งซื้อแล้ว"); await load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  function copyPo(po) {
    const text = `ใบสั่งซื้อ ${po.po_no}${po.supplier ? ` · ${po.supplier}` : ""}\n`
      + po.items.map((it, i) => `${i + 1}. ${matMap[it.material_code]?.th || it.material_code} (${it.material_code}) — ${fmtNum(it.qty)} ${it.unit || matMap[it.material_code]?.unit || ""} @ ${fmtBaht(it.price)}`).join("\n")
      + `\nรวม ${po.items.length} รายการ · ${po.vat ? `${fmtBaht(po.subtotal)} + VAT 7% ${fmtBaht(po.vatAmt)} = ${fmtBaht(po.total)}` : fmtBaht(po.total)}`;
    const done = () => flash("คัดลอกใบสั่งซื้อแล้ว — ส่งซัพพลายเออร์ได้เลย");
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => window.prompt("คัดลอก:", text));
    else window.prompt("คัดลอก:", text);
  }

  // ---------- EDITOR ----------
  if (editing) {
    return (
      <div className="adm">
        <div className="adm-head">
          <div><h1 className="page-title">ใบสั่งซื้อ <span className="page-title-en">Purchase Order</span></h1>
            <p className="page-sub">แก้ไขรายการ/จำนวน/ราคาได้ · บันทึกแล้วคัดลอกส่งซัพพลายเออร์</p></div>
        </div>
        <div className="doc-edit-wrap">
        <div className="card" style={{ flex: 1, maxWidth: 860 }}>
          <div className="fld-row">
            <label className="fld"><span>เลขใบสั่งซื้อ · PO No.</span><input className="inp" value={editing.po_no} onChange={(e) => setEditing({ ...editing, po_no: e.target.value })} /></label>
            <label className="fld"><span>วันที่</span><input className="inp" type="date" value={editing.issue_date || ""} onChange={(e) => setEditing({ ...editing, issue_date: e.target.value })} /></label>
            <label className="fld"><span>ซัพพลายเออร์ · Supplier</span><SupplierPicker value={editing.supplier} onChange={(v) => setEditing((e) => ({ ...e, supplier: v }))} /></label>
          </div>
          <div className="fld"><span>ประเภทสินค้า <b style={{ color: "#dc2626" }}>*</b></span>
            <div className="seg" style={{ marginTop: 4 }}>
              {[["ac", "❄️ เครื่องปรับอากาศ"], ["material", "🧰 วัสดุและอะไหล่"]].map(([v, l]) => (
                <button key={v} type="button" className={"seg-btn" + (editing.po_type === v ? " on" : "")} onClick={() => setEditing((e) => ({ ...e, po_type: v }))}>{l}</button>
              ))}
            </div>
          </div>
          <label className="fld"><span>อ้างอิงใบเสนอราคา (อนุมัติแล้ว) <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>— สั่งแอร์ต้องอ้างอิง · วัสดุจะอ้างอิงหรือไม่ก็ได้ · ถ้าอ้างอิง ต้นทุนจะเข้างานนั้นตอนรับของ</span></span>
            <Combo className="inp" value={editing.quote_no} onChange={(e) => setEditing((s) => ({ ...s, quote_no: e.target.value }))}>
              <option value="">— ไม่อ้างอิง (ซื้อเข้าสต๊อกทั่วไป) —</option>
              {editing.quote_no && !quotes.some((x) => x.quote_no === editing.quote_no) && <option value={editing.quote_no}>{editing.quote_no}</option>}
              {quotes.map((x) => <option key={x.quote_no} value={x.quote_no}>{x.label}</option>)}
            </Combo>
          </label>
          <div className="fld-row">
            <label className="fld"><span>หมายเหตุ</span><input className="inp" value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} placeholder="(ไม่บังคับ)" /></label>
            <label className="fld"><span>ราคาที่กรอก / VAT</span>
              <select className="inp" value={vatMode} onChange={(e) => setVatMode(e.target.value)}>
                {VAT_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
          </div>
          <InternalNoteField value={editing.internal_note} onChange={(v) => setEditing({ ...editing, internal_note: v })} />

          <div className="fld"><span>เพิ่มรายการ (ค้นหาสินค้า/วัสดุ)</span>
            <ItemPicker items={mats} placeholder="ค้นหา รหัส / ชื่อสินค้า หรือกดลูกศร…" onPick={addLinePO} />
            <p className="page-sub" style={{ marginTop: 6 }}>เลือกจากช่องค้นหา หรือเลือกจากแคตตาล็อกด้านขวา → ปรับราคาซื้อ/จำนวนในรายการด้านล่างได้</p>
          </div>

          {editIncl && editing.items.length > 0 && (
            <p className="page-sub" style={{ margin: "2px 0 6px" }}>💡 ช่องราคาแรก = <b>ราคารวม VAT</b> (กรอกตามบิล) · ช่องถัดไป = ราคาก่อน VAT (ระบบถอดให้)</p>
          )}
          {editing.items.length > 0 && (
            <div className="line-list">
              {editing.items.map((it) => { const m = matMap[it.code]; const u = lineUnit(it, m); const conv = m?.purchaseUnit && u === m.purchaseUnit && puFactor(m) > 1; return (
                <div className="po-edit-row" key={it.code}>
                  <MaterialThumb mat={m || { color: "#888" }} size={32} radius={8} />
                  <div className="line-info"><div className="line-name">{m?.th || it.code}</div>
                    <div className="line-sub">{conv ? `1 ${m.purchaseUnit} = ${fmtNum(m.purchaseQty)} ${m.unit} · ราคา/${m.purchaseUnit}` : m?.unit}
                      {it._last ? <span style={{ color: "#b45309" }}> · ซื้อล่าสุด ฿{fmtNum(it._last.unit_cost)}/{m?.unit || "หน่วย"}{it._last.txn_date ? ` (${new Date(it._last.txn_date + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" })})` : ""}</span> : null}</div></div>
                  <div className="inp inp-unit po-edit-in"><span className="unit-pre">฿</span><NumIn className="" autoWidth min="0" step="0.01" value={it.price} onChange={(n) => setItem(it.code, "price", n)} /></div>
                  {editIncl && <div className="inp inp-unit po-edit-in" style={{ opacity: 0.7 }} title="ราคาก่อน VAT (คำนวณให้)"><span className="unit-pre">฿</span><input type="number" value={R2(netUnit(it))} disabled /></div>}
                  <div className="inp inp-unit po-edit-in"><NumIn className="" autoWidth min="0" value={it.qty} onChange={(n) => setItem(it.code, "qty", Math.max(0, n))} /><UnitPick m={m} value={u} onChange={(nu) => changeLineUnit(it.code, m, nu)} /></div>
                  <span className="po-edit-val">{fmtBaht((Number(it.qty) || 0) * (Number(it.price) || 0))}</span>
                  <button className="line-x" onClick={() => removeItem(it.code)}><UIcon name="x" size={14} /></button>
                </div>
              ); })}
              {editing.vat ? (
                <>
                  <div className="line-total" style={{ borderBottom: "1px dashed var(--line-2)" }}><span>ยอดก่อน VAT ({editing.items.length} รายการ)</span><b>{fmtBaht(editSub)}</b></div>
                  <div className="line-total" style={{ borderBottom: "1px dashed var(--line-2)", color: "var(--ink-3)" }}><span>VAT 7%</span><b>{fmtBaht(editVatAmt)}</b></div>
                  <div className="line-total"><span>ยอดรวมสุทธิ (รวม VAT)</span><b>{fmtBaht(editGrand)}</b></div>
                </>
              ) : (
                <div className="line-total"><span>รวม {editing.items.length} รายการ (ไม่มี VAT)</span><b>{fmtBaht(editSub)}</b></div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn-ghost" onClick={() => setEditing(null)}>ยกเลิก</button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> บันทึกใบสั่งซื้อ</button>
          </div>
        </div>
        <ItemBrowser mats={mats} onAdd={addLinePO} unitOf={(m) => m.purchaseUnit || m.unit} />
        </div>
        {toast && <Toast toast={toast} />}
      </div>
    );
  }

  // ---------- LIST ----------
  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ใบสั่งซื้อ <span className="page-title-en">Purchase Orders</span></h1>
          <p className="page-sub">{pos.length} ใบ · สร้าง → ส่งซัพพลายเออร์ → รับสินค้าเข้าสต๊อก</p></div>
        {isAdmin && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> สร้างใบสั่งซื้อ</button>}
      </div>

      <div className="cat-filter" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {PO_FILTERS.map((f) => (
            <button key={f.id} className={"cat-chip" + (statusF === f.id ? " on" : "")} onClick={() => setStatusF(f.id)}
              style={statusF === f.id ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{f.label} ({nStatus(f.id)})</button>
          ))}
          <span style={{ color: "var(--line)", alignSelf: "center" }}>|</span>
          {PAY_FILTERS.map((f) => (
            <button key={f.id} className={"cat-chip" + (payF === f.id ? " on" : "")} onClick={() => setPayF(f.id)}
              style={payF === f.id ? { background: "#1d4ed8", color: "#fff", borderColor: "#1d4ed8" } : {}}>{f.label} ({nPay(f.id)})</button>
          ))}
          <span style={{ color: "var(--line)", alignSelf: "center" }}>|</span>
          {[["all", "ทุกประเภท"], ["ac", "❄️ เครื่องปรับอากาศ"], ["material", "🧰 วัสดุและอะไหล่"]].map(([v, l]) => (
            <button key={v} className={"cat-chip" + (typeF === v ? " on" : "")} onClick={() => setTypeF(v)}
              style={typeF === v ? { background: "#0891b2", color: "#fff", borderColor: "#0891b2" } : {}}>{l} ({nType(v)})</button>
          ))}
          <span style={{ color: "var(--line)", alignSelf: "center" }}>|</span>
          {[["all", "ภาษี: ทั้งหมด"], ["vat", "งาน VAT"], ["novat", "งาน NOVAT"]].map(([v, l]) => (
            <button key={v} className={"cat-chip" + (vatF === v ? " on" : "")} onClick={() => setVatF(v)}
              style={vatF === v ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" } : {}}>{l} ({nVat(v)})</button>
          ))}
          <DateRangeBar value={dateR} onChange={setDateR} hidden={dateHidden} />
        </div>
        <div className="cat-search">
          <UIcon name="search" size={17} color="var(--ink-3)" />
          <input placeholder="ค้นหาเลข PO / ร้าน / วัสดุ / หมายเหตุ" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="cat-search-x" onClick={() => setQ("")}><UIcon name="x" size={15} /></button>}
        </div>
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && pos.length === 0 && <div className="empty">ยังไม่มีใบสั่งซื้อ</div>}
      {!loading && pos.length > 0 && shown.length === 0 && <div className="empty">ไม่พบใบสั่งซื้อที่ตรงเงื่อนไข</div>}

      <div className="job-cards">
        {shown.map((po) => {
          const st = STATUS[po.status] || STATUS.open;
          return (
            <div className={"card job-card doc2" + (po.status !== "open" ? " closed" : "")} key={po.po_no}>
              <DocCardHead no={po.po_no} onClick={() => openPeek("po", po.po_no)} partyIcon="🏭"
                badges={<>
                  <span className={"job-badge " + st.cls}>{st.th}</span>
                  <span className={"vat-badge " + (poTypeOf(po) === "ac" ? "vat-on" : "vat-off")}>{poTypeOf(po) === "ac" ? "❄️ เครื่องปรับอากาศ" : "🧰 วัสดุและอะไหล่"}</span>
                  {(() => { const ps = PAY_STATUS[po.paymentStatus] || PAY_STATUS.unpaid; return <span className={"job-badge " + ps.cls}>💳 {ps.th}{po.paymentStatus === "paid" && po.paid_at ? " " + new Date(po.paid_at).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : ""}</span>; })()}
                  {po.quote_no && <button type="button" className="vat-badge vat-on" style={{ cursor: "pointer", border: "1px solid transparent" }} title="ดูใบเสนอราคาที่อ้างอิง (พรีวิวด้านขวา)" onClick={(e) => { e.stopPropagation(); openPeek("quote", po.quote_no); }}>อ้างอิง {po.quote_no} ↗</button>}
                  {po.jobNo && <button type="button" className="vat-badge" style={{ cursor: "pointer", border: "1px solid transparent", background: "#f3e8ff", color: "#7c3aed" }} title="พรีวิวใบงานที่เชื่อมกัน" onClick={(e) => { e.stopPropagation(); openPeek("job", po.jobNo); }}>งาน {po.jobNo} ↗</button>}
                </>}
                title={po.note || `สั่งซื้อสินค้า ${po.items.length} รายการ`}
                sub={(po.customerName || po.teamName) ? `${po.customerName ? "👤 " + po.customerName : ""}${po.teamName ? (po.customerName ? " · " : "") + "🔧 " + po.teamName : ""}` : `${po.items.length} รายการ`}
                date={po.issue_date || po.created_at}
                amountLabel={"มูลค่ารวม" + (po.vat ? " (รวม VAT)" : "")} amount={po.total}
                customer={{ name: po.supplier || "ไม่ระบุร้าน" }} />
              <InternalNoteTag note={po.internal_note} role={role} />
              <div className="job-lines">
                {(expanded.has(po.po_no) ? po.items : po.items.slice(0, 3)).map((it) => { const m = matMap[it.material_code]; return (
                  <div className="po-view-row" key={it.material_code}>
                    <span className="po-view-name">{m?.th || it.material_code}</span>
                    <span className="po-view-q">{fmtNum(it.qty)} {it.unit || m?.unit || ""} × {fmtBaht(it.price)}</span>
                    <span className="po-view-v">{fmtBaht(it.qty * it.price)}</span>
                  </div>
                ); })}
                {po.items.length > 3 && (
                  <button type="button" className="po-toggle" onClick={() => toggleExpand(po.po_no)}>
                    {expanded.has(po.po_no) ? "▲ ย่อรายการ" : `▼ ดูรายการทั้งหมด (${po.items.length} รายการ · ซ่อนอยู่ ${po.items.length - 3})`}
                  </button>
                )}
                <div className="job-actions">
                  <button className="btn-ghost sm" onClick={() => { printWin.current = openPrintWindow(); setPrintPo(po); }}><UIcon name="catalog" size={14} /> พิมพ์</button>
                  <button className="btn-ghost sm" onClick={() => copyPo(po)}><UIcon name="clipboard" size={14} /> คัดลอกส่งซัพพลายเออร์</button>
                  {isAdmin && po.status !== "cancelled" && po.paymentStatus === "unpaid" && po.total > 0 &&
                    <button className="btn-ghost sm" style={{ color: "#1d4ed8", borderColor: "#c7dbff", background: "#eff5ff" }} onClick={() => requestPay(po)}>💳 ส่งขออนุมัติจ่าย</button>}
                  {po.paymentStatus === "pending" && <span className="job-closed-note">รออนุมัติจ่ายในเมนูเบิกจ่าย</span>}
                  {po.status === "open" && isAdmin && <>
                    <button className="btn-ghost sm" onClick={() => startEdit(po)}><UIcon name="edit" size={14} /> แก้ไข</button>
                    <button className="btn-primary" onClick={() => onReceive && onReceive(po)}><UIcon name="purchase" size={15} color="#fff" /> รับสินค้าเข้าสต๊อก{po.quote_no ? " → เข้างาน" : ""}</button>
                    <button className="btn-ghost sm" title="ปิดใบเป็น 'รับแล้ว' โดยไม่บันทึกของเพิ่ม — ใช้เมื่อทยอยรับบางส่วนจนครบแล้ว" onClick={() => closePoManual(po)}>✓ ปิดใบ (รับครบแล้ว)</button>
                  </>}
                  {/* ยกเลิก: ฝ่ายขาย/ธุรการวัสดุ (+ผู้มีสิทธิ์แก้ PO) · ลบถาวร: ธุรการเท่านั้น — ใบที่รับของแล้วต้องยกเลิกการรับก่อน */}
                  {po.status === "open" && canCancel &&
                    <button className="btn-ghost sm" disabled={po.paymentStatus && po.paymentStatus !== "unpaid"} title={po.paymentStatus && po.paymentStatus !== "unpaid" ? "ผูกการจ่ายเงินแล้ว — จัดการรายการเบิกจ่ายก่อน" : "ยกเลิกใบสั่งซื้อ (เก็บประวัติ)"} onClick={() => cancelPo(po)}>ยกเลิก</button>}
                  {po.status !== "received" && canDelete &&
                    <button className="btn-ghost sm danger" disabled={po.paymentStatus && po.paymentStatus !== "unpaid"} title={po.paymentStatus && po.paymentStatus !== "unpaid" ? "ผูกการจ่ายเงินแล้ว — จัดการรายการเบิกจ่ายก่อน" : "ลบถาวร (ธุรการ)"} onClick={() => del(po)}><UIcon name="trash" size={14} /></button>}
                  {/* รับของแล้วแต่บิลซัพฯ มาทีหลัง → ยังแก้ราคาได้จนกว่าจะส่งขออนุมัติจ่าย */}
                  {po.status === "received" && isAdmin && po.paymentStatus === "unpaid" &&
                    <button className="btn-ghost sm" onClick={() => startEdit(po)}><UIcon name="edit" size={14} /> แก้ไขราคา (ตามบิลซัพฯ)</button>}
                  {po.status === "received" && <span className="job-closed-note">รับเข้าสต๊อกแล้ว {po.received_at ? new Date(po.received_at).toLocaleDateString("th-TH") : ""}{po.paymentStatus === "unpaid" && !(po.total > 0) ? " · ใส่ราคาจริงจากบิลก่อน แล้วปุ่มส่งขออนุมัติจ่ายจะขึ้น" : ""}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {printPo && (() => {
        const co = printPo.vat ? companies.vat : companies.novat;
        const sup = sups.find((s) => (s.name || "").trim() === (printPo.supplier || "").trim());
        const c0 = sup?.contacts?.[0];
        return (
          <DocSlip company={co} titleTh="ใบสั่งซื้อ" titleEn="PURCHASE ORDER" docNo={printPo.po_no} partyLabel="ผู้ขาย"
            metaRows={[{ label: "วันที่", value: fmtDocDate(printPo.issue_date || printPo.created_at) }, ...(printPo.quote_no ? [{ label: "อ้างอิงใบเสนอราคา", value: printPo.quote_no }] : [])]}
            customer={{ name: printPo.supplier || "-", taxId: sup?.tax_id, address: sup?.address, contactName: c0?.name, contactPhone: c0?.phone }}
            terms={printPo.note} signLabels={["ผู้สั่งซื้อ", "ผู้อนุมัติ"]}
            totals={<div className="doc-totals">
              <div><span>รวมเป็นเงิน</span><b>{fmtBaht(printPo.subtotal)}</b></div>
              {printPo.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht(printPo.vatAmt)}</b></div> : null}
              <div className="doc-grand"><span>รวมทั้งสิ้น</span><b>{fmtBaht(printPo.total)}</b></div>
            </div>}>
            {printPo.items.map((it, i) => { const m = matMap[it.material_code]; return (
              <tr key={i}><td>{i + 1}</td><td>{it.material_code}</td><td>{m?.th || it.material_code}</td><td className="r">{fmtNum(it.qty)} {it.unit || m?.unit || ""}</td><td className="r">{fmtBaht(it.price)}</td><td className="r">{fmtBaht(it.qty * it.price)}</td></tr>
            ); })}
          </DocSlip>
        );
      })()}
      {peekEl}
      {toast && <Toast toast={toast} />}
    </div>
  );
}

function Toast({ toast }) {
  return (
    <div style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
      background: toast.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600,
      padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center",
    }}>{toast.msg}</div>
  );
}
