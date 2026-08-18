import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listReceipts, listInvoices, listQuotations, saveReceipt, deleteReceipt, setReceiptStatus, setReceiptWht, getCompanies, listDocLinks, flowaccountSendDoc, saveReceiptFlowAccount, claimReceiptFlowAccount, releaseReceiptFlowAccount, docNoTaken } from "../lib/api";
import { fmtBaht2, custCode, round2, matchText, fmtDocDate } from "../lib/format";
import { can } from "../lib/permissions";
import { UIcon } from "../icons";
import DocSlip from "./DocSlip";
import DocTerms from "./DocTerms";
import DocChips from "./DocChips";
import DocCardHead from "./DocCard";
import NotesEditModal from "./NotesEditModal";
import { useDocPeek } from "./DocPeek";
import { DocNoteField, InternalNoteField, InternalNoteTag, SignToggle } from "./InternalNote";
import { mySignature, defaultSignOn } from "../lib/sign";
import ChatCustomerLink from "./ChatCustomerLink";
import DateRangeBar, { inDateRange, defaultDocRange } from "./DateRangeBar";
import LineWhtModal from "./LineWhtModal";
import FilterBar from "./FilterBar";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";

const fmtBaht = fmtBaht2; // receipts show 2 decimals
// ราคา/ยอด = ราคาแสดงจริง (price_show รวมค่าบัตร) − ส่วนลดบรรทัด · หัก ณ ที่จ่ายติดธงเฉพาะลูกค้านิติบุคคล (บุคคลธรรมดาห้ามหัก)
const snapshotItems = (q) => { const canW = q?.customerType === "company"; return (q?.items || []).map((it) => { const p = Number(it.price_show ?? it.unit_price) || 0; return { code: it.item_code || null, name: it.name, desc: it.description || "", unit: it.unit, qty: Number(it.qty), price: p, discount: Number(it.discount) || 0, amount: round2(Number(it.qty) * p - (Number(it.discount) || 0)), wht: canW && it.kind === "service" }; }); }; // เก็บ discount ให้ DocPeek/โมดัลโชว์ถูก
const lineWhtAmt = (items, base, rate) => { const all = (items || []).reduce((a, i) => a + (Number(i.amount) || 0), 0); const fl = (items || []).filter((i) => i.wht).reduce((a, i) => a + (Number(i.amount) || 0), 0); const ratio = all > 0 ? fl / all : 0; return round2((Number(base) || 0) * ratio * (Number(rate) || 0) / 100); };
const METHODS = ["เงินสด", "โอนเงิน", "เช็ค", "บัตรเครดิต", "Trade Baht"];
// ⚠️ ต้องมีทุกสถานะที่ setReceiptStatus เขียนได้ — สถานะที่ขาดจะตกไป fallback แล้วโชว์ป้ายผิด
const RSTATUS = { pending: { th: "รอชำระเงิน", cls: "b-amber" }, paid: { th: "ชำระเงินแล้ว", cls: "b-green" }, cancelled: { th: "ยกเลิกแล้ว", cls: "b-red" } };
function genNo() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `REC-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
const today = () => new Date().toISOString().slice(0, 10);

export default function Receipts({ role, fromInvoice, onFromInvoiceConsumed, onOpenDoc, focus, onFocusConsumed, onGoChat }) {
  const [peekEl, openPeek] = useDocPeek(onOpenDoc);   // ชิปเชื่อมโยง → พรีวิวแผงขวาก่อน
  const canEdit = can(role, "receipt", "edit");
  const canDelete = role === "admin"; // ลบจริงได้เฉพาะธุรการ
  // ส่งใบกำกับภาษีเข้า FlowAccount — ต้องตรงกับ allowlist ฝั่งเซิร์ฟเวอร์ (api/flowaccount-doc.js)
  const canSendFlow = ["admin", "exec", "finance", "sales", "field_sales", "hr"].includes(role);
  const [list, setList] = React.useState([]);
  const [invoices, setInvoices] = React.useState([]);
  const [quotes, setQuotes] = React.useState([]);
  const [companies, setCompanies] = React.useState({ vat: {}, novat: {} });
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [ed, setEd] = React.useState(null);
  const [printR, setPrintR] = React.useState(null);
  const [view, setView] = React.useState(null);
  const [search, setSearch] = React.useState("");
  const [notesEd, setNotesEd] = React.useState(null);   // แก้หมายเหตุใบที่ออกไปแล้ว (ไม่แตะยอดเงิน)
  const [statusF, setStatusF] = React.useState("all");
  const [vatF, setVatF] = React.useState("all"); // all | vat | novat
  const [byPerson, setByPerson] = React.useState("");   // กรองตามผู้สร้างเอกสาร
  const [dateR, setDateR] = React.useState(defaultDocRange);   // เปิดมาเห็น 6 เดือนล่าสุด · เก่ากว่านั้นกด "ดูทั้งหมด"
  // ใบที่ถูกช่วงวันที่ตัดออก — ต้องบอกจำนวนบนแถบตัวกรอง ห้ามซ่อนเงียบ ๆ
  const dateHidden = React.useMemo(() => (list || []).filter((x) => !inDateRange(x.issue_date, dateR)).length, [list, dateR]);
  // ตัวเลือกผู้สร้างเอกสาร = รายชื่อที่ปรากฏจริงในใบทั้งหมดที่โหลดมา (ไม่ยิง API เพิ่ม)
  const creatorOpts = React.useMemo(() => Array.from(new Set((list || []).map((d) => d.createdByName).filter(Boolean))).sort(), [list]);
  const [faBusy, setFaBusy] = React.useState(null);   // receipt_no being sent to FlowAccount
  const [faRes, setFaRes] = React.useState(null);     // { x, res } result modal
  const [docLinks, setDocLinks] = React.useState({ byQuote: {} });

  async function load() {
    setLoading(true);
    try { const [rc, iv, q, co, dl] = await Promise.all([listReceipts(), listInvoices(), listQuotations(), getCompanies(), listDocLinks()]); setList(rc); setInvoices(iv); setQuotes(q); setCompanies(co || { vat: {}, novat: {} }); setDocLinks(dl); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  // เปิดเจาะจงใบ (มาจากลิงก์/ชิปเชื่อมโยง) → ล้างช่วงวันที่ ไม่งั้นใบเก่ากว่า 6 เดือนจะขึ้นว่าไม่พบ
  React.useEffect(() => { if (focus) { setEd(null); setDateR({ from: "", to: "" }); setSearch(focus); onFocusConsumed && onFocusConsumed(); } }, [focus]);
  const printWin = React.useRef(null);
  React.useEffect(() => { if (!printR) return; const t = setTimeout(() => { writeAndPrint(printWin.current); printWin.current = null; setPrintR(null); }, 120); return () => clearTimeout(t); }, [printR]);
  // open the create form prefilled from an invoice (link from the invoice page)
  React.useEffect(() => { if (!fromInvoice || !invoices.length) return; startNew(); onPickInvoice(fromInvoice); onFromInvoiceConsumed && onFromInvoiceConsumed(); }, [fromInvoice, invoices]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }

  const openInvoices = invoices.filter((x) => x.status === "unpaid" && !x.hasReceipt);
  const invByNo = React.useMemo(() => Object.fromEntries(invoices.map((x) => [x.invoice_no, x])), [invoices]);
  const quoteByNo = React.useMemo(() => Object.fromEntries(quotes.map((q) => [q.quote_no, q])), [quotes]);

  function startNew() { setEd({ receipt_no: genNo(), invoice_no: "", issue_date: today(), payment_method: METHODS[1], status: "paid", items: [], wht_rate: 3, note: "", internal_note: "", sign_on: defaultSignOn(), terms_payment: "", terms_freebies: "", terms_warranty: "" }); }
  // copy the invoice's line items (with WHT flags) + end-of-document terms when an invoice is selected
  function onPickInvoice(invoice_no) {
    const iv = invByNo[invoice_no];
    const items = iv?.items?.length ? iv.items.map((x) => ({ ...x })) : snapshotItems(quoteByNo[iv?.quote_no]);
    setEd((s) => ({ ...s, invoice_no, items, wht_rate: iv?.wht_rate || 3, note: s.note || iv?.note || "", internal_note: s.internal_note || iv?.internal_note || "", terms_payment: iv?.terms_payment || "", terms_freebies: iv?.terms_freebies || "", terms_warranty: iv?.terms_warranty || "" }));
  }
  async function markPaid(x) { try { await setReceiptStatus(x.receipt_no, "paid", x.invoice_no); flash("รับเงินแล้ว ✓"); await load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); } }
  const setF = (k, v) => setEd((e) => ({ ...e, [k]: v }));
  const selInv = ed?.invoice_no ? invByNo[ed.invoice_no] : null;
  const whtRate = Number(ed?.wht_rate) || 3;
  const whtAmt = selInv ? lineWhtAmt(ed.items, selInv.base, whtRate) : 0; // หัก ณ ที่จ่าย รายบรรทัด
  const net = selInv ? round2((Number(selInv.total) || 0) - whtAmt) : 0;

  async function save() {
    if (!selInv) return flash("เลือกใบแจ้งหนี้ก่อน", true);
    const r = {
      receipt_no: ed.receipt_no, invoice_no: selInv.invoice_no, quote_no: selInv.quote_no || null, boq_no: selInv.boq_no || null, job_no: null,
      customer_id: selInv.customer_id || null, site_id: selInv.site_id || null, issue_date: ed.issue_date || null, payment_method: ed.payment_method || null,
      base: selInv.base, vat_amt: selInv.vat_amt, total: selInv.total, wht_amt: whtAmt, net, wht: (ed.items || []).some((i) => i.wht), wht_rate: whtRate, items: ed.items || [], status: ed.status || "paid",
      note: ed.note, internal_note: ed.internal_note, terms_payment: ed.terms_payment, terms_freebies: ed.terms_freebies, terms_warranty: ed.terms_warranty,
      ...(() => { const sig = ed.sign_on ? mySignature() : null; return { sign_url: sig?.url || null, sign_name: sig?.name || null }; })(),
    };
    try {
      // เลขซ้ำ = upsert ทับใบเดิมเงียบ ๆ — เช็คก่อนเสมอ (เลขแก้มือได้)
      if (await docNoTaken("receipts", r.receipt_no)) return flash(`เลขที่ ${r.receipt_no} ถูกใช้แล้ว — เปลี่ยนเลขที่ก่อนบันทึก`, true);
      await saveReceipt(r); flash(r.status === "paid" ? `ออกใบเสร็จ + ปิดใบแจ้งหนี้ ${selInv.invoice_no} แล้ว` : `ออกใบเสร็จ (รอชำระเงิน) แล้ว`); setEd(null); await load();
    }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(x) { const reason = await confirmDialog({ title: `ลบใบเสร็จ ${x.receipt_no}?`, message: "ใบแจ้งหนี้จะกลับเป็นค้างชำระ · ข้อมูลจะถูกเก็บไว้ในประวัติการลบ (กู้คืนได้)", confirmText: "ลบ", prompt: { label: "เหตุผลที่ลบ", placeholder: "เช่น ออกผิด · รับเงินผิดยอด", required: true } }); if (reason === false) return; try { await deleteReceipt(x.receipt_no, x.invoice_no, reason); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }
  async function cancel(x) { const reason = await confirmDialog({ title: `ยกเลิกใบเสร็จ ${x.receipt_no}?`, message: "เก็บประวัติไว้ · ใบแจ้งหนี้กลับเป็นค้างชำระ", confirmText: "ยกเลิกใบนี้", prompt: { label: "เหตุผลที่ยกเลิก", placeholder: "เช่น รับเงินผิดยอด · ออกผิดใบ", required: true } }); if (reason === false) return; try { await setReceiptStatus(x.receipt_no, "cancelled", x.invoice_no, reason); flash("ยกเลิกแล้ว"); await load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); } }
  async function sendToFlow(x) {
    // (1) VAT เท่านั้น — ตัดสินจาก "ยอด VAT บนใบเสร็จจริง" ไม่ใช่ธงในใบเสนอที่อาจโหลดไม่ครบ
    //     ใบกำกับภาษีต้องมี VAT · ฝั่งเซิร์ฟเวอร์ (flowaccount-doc.js) ก็ปฏิเสธ tax-invoice ที่ไม่มี VAT ซ้ำอีกชั้น
    if (!(Number(x.vat_amt) > 0)) return flash("ส่งเข้า FlowAccount ได้เฉพาะใบที่มี VAT (ใบกำกับภาษี) — ใบนี้ไม่มี VAT", true);
    // (2) ส่งแล้วห้ามส่งอีก — บล็อกที่ปุ่มอยู่แล้ว กันชั้นนี้เผื่อหน้าเก่า/กดเร็ว
    if (x.flowaccount_no) return flash(`ใบนี้ส่ง FlowAccount ไปแล้ว (เลขที่ ${x.flowaccount_no}) — ส่งซ้ำไม่ได้`, true);
    if (!await confirmDialog(`ส่งใบกำกับภาษีของ ${x.receipt_no} เข้า FlowAccount?`)) return;
    setFaBusy(x.receipt_no);
    try {
      // (3) จองใบก่อนยิง — กันสองแท็บ/สองคนส่งใบเดียวกันพร้อมกัน (atomic ที่ฐานข้อมูล mig 175)
      const claim = await claimReceiptFlowAccount(x.receipt_no);
      if (claim !== "claimed") { flash("ใบนี้ถูกส่ง/กำลังส่งอยู่แล้ว — รีเฟรชแล้วเช็กเลขที่ FlowAccount ก่อน", true); await load(); setFaBusy(null); return; }
      const q = quoteByNo[x.quote_no];
      // full receipt (≈ whole quote) → detailed line items; partial installment → one summary line for งวดนี้
      const isFull = q && Math.abs((Number(x.total) || 0) - (Number(q.grand) || 0)) < 1;
      let items, discountAmount;
      if (isFull) {
        // ราคาต่อหน่วย = price_show (ตรงกับ grand ที่ใช้เทียบ isFull) · ส่วนลดรายบรรทัดรวมเข้า discountAmount — เดิมทิ้งส่วนลดบรรทัดทำยอดใบกำกับใน FlowAccount เกินจริง
        items = (q?.items || []).map((it) => { const p = Number(it.price_show ?? it.unit_price) || 0; return { sku: it.item_code || "", name: it.name, kind: it.kind, quantity: Number(it.qty) || 1, unitName: it.unit || "หน่วย", pricePerUnit: p, total: round2(Number(it.qty) * p) }; });
        discountAmount = round2((Number(q?.discount) || 0) + (q?.items || []).reduce((a, it) => a + (Number(it.discount) || 0), 0));
      } else {
        const pct = q?.grand ? Math.round((Number(x.total) || 0) / q.grand * 100) : null;
        const base = round2(Number(x.base) || 0);
        items = [{ name: `รับชำระตามใบแจ้งหนี้ ${x.invoice_no || ""}${pct ? ` · งวดนี้ ${pct}%` : ""}`, quantity: 1, unitName: "งวด", pricePerUnit: base, total: base }];
        discountAmount = 0;
      }
      let res;
      try {
        res = await flowaccountSendDoc({
          // ที่อยู่บนใบกำกับภาษี = ที่อยู่หลักที่จดทะเบียนไว้เสมอ (ห้ามใช้ที่อยู่ไซต์งาน — สรรพากรดูที่อยู่จดทะเบียน)
          docType: "tax-invoice", contactName: x.customerName, contactAddress: x.customerAddr,
          contactTaxId: x.customerTaxId, contactCode: custCode(x.customerCode), contactNumber: x.mainContactPhone || x.contactPhone,
          publishedOn: x.issue_date, dueDate: x.issue_date, isVat: true, isVatInclusive: false,
          discountAmount, items,
          remarks: `อ้างอิงใบเสร็จ ${x.receipt_no}` + (x.wht_amt > 0 ? ` · หัก ณ ที่จ่าย ${x.wht_rate || 3}% = ${fmtBaht(x.wht_amt)} · รับสุทธิ ${fmtBaht(x.net)}` : ""),
        });
      } catch (e) { await releaseReceiptFlowAccount(x.receipt_no); throw e; }   // ยิงไม่ถึง FA → ปล่อยจอง ให้ลองใหม่ได้
      setFaRes({ x, res });
      if (res.ok) {
        try { await saveReceiptFlowAccount(x.receipt_no, res.id, res.serial); }
        catch (se) {
          // ⚠️ FA สร้างเอกสารแล้ว แต่บันทึกเลขกลับไม่สำเร็จ — "ห้ามปล่อยจอง" (กันกดใหม่แล้วซ้ำ) และเตือนดัง ๆ
          await load();
          flash(`⚠️ สร้างใน FlowAccount แล้ว (เลขที่ ${res.serial || res.id || "-"}) แต่บันทึกเลขกลับเข้าระบบไม่สำเร็จ — จดเลขนี้ไว้ อย่ากดส่งซ้ำ`, true);
          setFaBusy(null); return;
        }
        await load(); flash(`ส่งเข้า FlowAccount แล้ว ✓${res.serial ? " เลขที่ " + res.serial : ""}`);
      } else {
        await releaseReceiptFlowAccount(x.receipt_no);   // FlowAccount ปฏิเสธ → ปล่อยจอง ให้แก้แล้วส่งใหม่ได้
        flash("FlowAccount ไม่สำเร็จ — ดูรายละเอียดในกล่อง", true);
      }
    } catch (e) { setFaRes({ x, res: { ok: false, msg: e.message || String(e) } }); flash("ผิดพลาด: " + (e.message || e), true); }
    setFaBusy(null);
  }
  // ใบที่ค้างสถานะ "กำลังส่ง" (จองแล้วแต่ยังไม่มีเลขกลับ) — ไม่ให้กดส่งซ้ำอัตโนมัติ (เสี่ยงเอกสารซ้ำ)
  // ให้คนเช็ก FlowAccount ก่อนแล้วเลือกเอง: มีใบแล้ว → กรอกเลขเพื่อบันทึก · ยังไม่มี → เว้นว่างเพื่อปลดล็อกส่งใหม่
  async function resolvePending(x) {
    const no = await confirmDialog({
      title: `ใบ ${x.receipt_no} ค้างสถานะ "กำลังส่ง FlowAccount"`,
      message: "เช็กใน FlowAccount ก่อนว่ามีใบกำกับของใบเสร็จนี้แล้วหรือยัง\n• มีแล้ว → กรอกเลขที่ FlowAccount เพื่อบันทึก (จะถือว่าส่งแล้ว ส่งซ้ำไม่ได้)\n• ยังไม่มี → เว้นช่องว่างไว้ เพื่อปลดล็อกให้ส่งใหม่",
      confirmText: "ยืนยัน",
      prompt: { label: "เลขที่ FlowAccount (ถ้ามีใบแล้ว)", placeholder: "เว้นว่าง = ยังไม่มี ปลดล็อกส่งใหม่", required: false },
    });
    if (no === false) return;   // กดยกเลิก
    try {
      if (no && String(no).trim()) { await saveReceiptFlowAccount(x.receipt_no, null, String(no).trim()); flash("บันทึกเลข FlowAccount แล้ว ✓ (ส่งซ้ำไม่ได้)"); }
      else { await releaseReceiptFlowAccount(x.receipt_no); flash("ปลดล็อกแล้ว — ส่งใหม่ได้"); }
      await load();
    } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }

  // ---------- EDITOR ----------
  if (ed) {
    return (
      <div className="adm">
        <div className="adm-head"><div><h1 className="page-title">ออกใบเสร็จรับเงิน <span className="page-title-en">Receipt</span></h1>
          <p className="page-sub">อ้างอิงใบแจ้งหนี้ · เมื่อรับชำระแล้ว</p></div></div>
        <div className="card" style={{ maxWidth: 680 }}>
          <div className="fld-row">
            <label className="fld"><span>เลขที่ใบเสร็จ</span><input className="inp" value={ed.receipt_no} onChange={(e) => setF("receipt_no", e.target.value)} /></label>
            <label className="fld"><span>อ้างอิงใบแจ้งหนี้ (ค้างชำระ)</span>
              <Combo className="inp" value={ed.invoice_no} onChange={(e) => onPickInvoice(e.target.value)}>
                <option value="">— เลือกใบแจ้งหนี้ —</option>
                {openInvoices.map((x) => <option key={x.invoice_no} value={x.invoice_no}>{x.invoice_no} · งวด {x.installment} · {x.customerName || "-"} ({fmtBaht(x.total)})</option>)}
              </Combo>
            </label>
          </div>

          {selInv && (
            <div className="inv-summary">
              <div><span>ลูกค้า</span><b>{selInv.customerName || "-"} · {custCode(selInv.customer_id)}</b></div>
              <div><span>อ้างอิง</span><b>{selInv.quote_no || "-"}{selInv.boq_no ? ` · BOQ ${selInv.boq_no}` : ""}</b></div>
              <div><span>ยอดงวด (รวม VAT)</span><b>{fmtBaht(selInv.total)}</b></div>
              {whtAmt > 0 && <div><span>หัก ณ ที่จ่าย {whtRate}%</span><b style={{ color: "var(--down)" }}>− {fmtBaht(whtAmt)}</b></div>}
              <div className="inv-remain"><span>ยอดรับสุทธิ</span><b>{fmtBaht(net)}</b></div>
            </div>
          )}

          <div className="fld-row">
            <label className="fld"><span>วันที่</span><input className="inp" type="date" value={ed.issue_date} onChange={(e) => setF("issue_date", e.target.value)} /></label>
            <label className="fld"><span>วิธีชำระ</span>
              <Combo className="inp" value={ed.payment_method} onChange={(e) => setF("payment_method", e.target.value)}>{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</Combo>
            </label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>สถานะการชำระ</span>
              <Combo className="inp" value={ed.status} onChange={(e) => setF("status", e.target.value)}>
                <option value="paid">ชำระเงินแล้ว (ปิดใบแจ้งหนี้)</option>
                <option value="pending">รอชำระเงิน (ออกใบเสร็จก่อน)</option>
              </Combo>
            </label>
            <label className="fld"><span>อัตราหัก ณ ที่จ่าย</span>
              <div className="inp inp-unit" style={{ width: 120 }}>
                <input type="number" min="0" step="0.1" value={ed.wht_rate} onChange={(e) => setF("wht_rate", Number(e.target.value) || 0)} /><span className="unit-suf">%</span>
              </div>
            </label>
          </div>
          {selInv && <p className="page-sub" style={{ margin: "0 0 6px" }}>หัก ณ ที่จ่าย ดึงจากใบแจ้งหนี้ (ค่าบริการ) · ปรับรายบรรทัดได้โดยกดที่ใบเสร็จในรายการหลังออกใบ</p>}
          <DocTerms payment={ed.terms_payment} freebies={ed.terms_freebies} warranty={ed.terms_warranty} onChange={(k, v) => setF(k, v)} />
          <DocNoteField value={ed.note} onChange={(v) => setF("note", v)} />
          <InternalNoteField value={ed.internal_note} onChange={(v) => setF("internal_note", v)} />
          <SignToggle on={ed.sign_on} onChange={(v) => setF("sign_on", v)} />

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn-ghost" onClick={() => setEd(null)}>ยกเลิก</button>
            <button className="btn-primary" style={{ flex: 1 }} disabled={!selInv} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> ออกใบเสร็จ</button>
          </div>
        </div>
        {toast && <Toast t={toast} />}
      </div>
    );
  }

  // ---------- LIST ----------
  const recVat = (x) => !!quoteByNo[x.quote_no]?.vat;
  // base หลังค้นหา+ช่วงวันที่ — ใช้นับจำนวนบนชิปตัวกรอง
  const fl0 = list.filter((x) => inDateRange(x.issue_date, dateR)
    && matchText(search, x.receipt_no, x.customerName, x.quote_no, x.job_no, x.createdByName, x.note, x.internal_note));
  const nStatus = (v) => fl0.filter((x) => v === "all" || x.status === v).length;
  const nVat = (v) => fl0.filter((x) => v === "all" || (v === "vat" ? recVat(x) : !recVat(x))).length;
  const shown = fl0.filter((x) => (statusF === "all" || x.status === statusF)
    && (vatF === "all" || (vatF === "vat" ? recVat(x) : !recVat(x)))
    && (!byPerson || (x.createdByName || "") === byPerson));
  // จำนวนตัวกรองที่ใช้อยู่ (ไม่ใช่ค่าเริ่มต้น) → โชว์บนแถบตัวกรองยุบได้
  const activeCount = (statusF !== "all" ? 1 : 0) + (vatF !== "all" ? 1 : 0)
    + (byPerson ? 1 : 0);   // ไม่นับช่วงวันที่ (มี default 6 เดือนอยู่แล้ว)
  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ใบเสร็จรับเงิน <span className="page-title-en">Receipts</span></h1><p className="page-sub">{list.length} ใบ</p></div>
        <div className="cat-head-actions">
          <div className="cat-search"><UIcon name="search" size={17} color="var(--ink-3)" />
            <input placeholder="ค้นหาเลขที่ / ลูกค้า / ใบเสนอ / ใบงาน / หมายเหตุ" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="cat-search-x" onClick={() => setSearch("")}><UIcon name="x" size={15} /></button>}
          </div>
          {canEdit && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> ออกใบเสร็จ</button>}
        </div>
      </div>
      <FilterBar id="receipts" count={activeCount}>
      <div className="cat-filter">
        {[["all", "ทั้งหมด"], ["pending", "รอชำระเงิน"], ["paid", "ชำระเงินแล้ว"], ["cancelled", "ยกเลิก"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)}
            style={statusF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l} ({nStatus(v)})</button>
        ))}
        <DateRangeBar value={dateR} onChange={setDateR} hidden={dateHidden} />
      </div>
      <div className="cat-filter" style={{ marginTop: -4 }}>
        {[["all", "VAT / ไม่ VAT"], ["vat", "รับ VAT"], ["novat", "ไม่ VAT"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (vatF === v ? " on" : "")} onClick={() => setVatF(v)}
            style={vatF === v ? { background: "#1f74e0", color: "#fff", borderColor: "#1f74e0" } : {}}>{l} ({nVat(v)})</button>
        ))}
        {creatorOpts.length > 0 && (
          <select className="inp" style={{ width: "auto", flex: "none" }} value={byPerson} onChange={(e) => setByPerson(e.target.value)}>
            <option value="">👤 ผู้สร้างทั้งหมด</option>
            {creatorOpts.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>
      </FilterBar>
      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && shown.length === 0 && <div className="empty">{list.length === 0 ? "ยังไม่มีใบเสร็จ" : "ไม่พบใบเสร็จ"}</div>}
      <div className="job-cards">
        {shown.map((x) => {
          const st = RSTATUS[x.status] || RSTATUS.pending;
          return (
          <div className={"card job-card doc2" + (x.status !== "pending" ? " closed" : "")} key={x.receipt_no}>
            <DocCardHead no={x.receipt_no} onClick={() => openPeek("receipt", x.receipt_no)}
              badges={<><span className={"job-badge " + st.cls}>{st.th}</span><span className={"vat-badge " + (quoteByNo[x.quote_no]?.vat ? "vat-on" : "vat-off")}>{quoteByNo[x.quote_no]?.vat ? "VAT" : "NO VAT"}</span>{x.flowaccount_no && <span className="fa-no-badge" title="เลขที่เอกสารใน FlowAccount"><b>FlowAccount</b> {x.flowaccount_no}</span>}</>}
              title={x.title} sub={<span className="dch-more">ดูตัวอย่าง ›</span>} by={x.createdByName}
              date={x.issue_date || x.created_at}
              amountNode={x.wht_amt > 0 ? (
                <div className="rec-amt-bd">
                  <div className="rab-row"><span>ก่อนหัก ณ ที่จ่าย</span><b>{fmtBaht(x.total)}</b></div>
                  <div className="rab-row rab-wht"><span>หัก ณ ที่จ่าย {Number(x.wht_rate) || 3}%</span><b>− {fmtBaht(x.wht_amt)}</b></div>
                  <div className="rab-row rab-net"><span>ยอดรับสุทธิ</span><b>{fmtBaht(x.net)}</b></div>
                </div>
              ) : null}
              amountLabel="ยอดรับสุทธิ" amount={x.net}
              customer={{ name: x.customerName, contactName: x.mainContactName, phone: x.contactPhone || x.mainContactPhone, addr: x.customerAddr, siteAddress: x.siteAddress, mapUrl: x.mapUrl }} />
            {(() => { const ch = docLinks.byQuote[x.quote_no] || {}; return <DocChips jobStatusBy={docLinks.jobStatusBy || {}} boqNo={x.boq_no} quoteNo={x.quote_no} jobNos={ch.jobNos} invoiceNos={ch.invoiceNos} receiptNos={ch.receiptNos} poNos={ch.poNos} creditNos={ch.creditNos} debitNos={ch.debitNos} self={{ type: "receipt", no: x.receipt_no }} onOpen={openPeek} />; })()}
            <InternalNoteTag note={x.internal_note} role={role} />
            <div className="job-lines"><div className="job-actions">
              <ChatCustomerLink role={role} customerId={x.customer_id} onGoChat={onGoChat} />
              {canEdit && x.status === "pending" && <button className="btn-primary sm" onClick={() => markPaid(x)}><UIcon name="check" size={14} color="#fff" strokeWidth={2.4} /> รับเงินแล้ว</button>}
              <button className="btn-ghost sm" onClick={() => setView(x)}><UIcon name="clipboard" size={14} /> รายการ / หัก ณ ที่จ่าย</button>
              {canEdit && x.status !== "cancelled" && <button className="btn-ghost sm" onClick={() => setNotesEd({ kind: "receipt", docNo: x.receipt_no, title: x.title, note: x.note, internalNote: x.internal_note })}><UIcon name="edit" size={14} /> หมายเหตุ</button>}
              <button className="btn-ghost sm" onClick={() => { printWin.current = openPrintWindow(); setPrintR(x); }}><UIcon name="catalog" size={14} /> พิมพ์</button>
              {/* ส่ง FlowAccount ได้เฉพาะใบที่มี VAT จริง (ยอด VAT บนใบ) · ส่งแล้วบล็อกถาวร ไม่มีปุ่มส่งซ้ำ
                  ใบที่เคยกดส่งแต่ยังไม่ได้เลขกลับ (จองค้าง) → ป้ายเตือนให้เช็ก FlowAccount ก่อนส่งใหม่ */}
              {canSendFlow && Number(x.vat_amt) > 0 && x.status !== "cancelled" && (
                x.flowaccount_no
                  ? <span className="fa-sent-badge vat-badge vat-on" title={`ส่ง FlowAccount แล้ว เลขที่ ${x.flowaccount_no} · ส่งซ้ำไม่ได้`}>✓ ส่ง FlowAccount แล้ว</span>
                  : x.flowaccount_at
                    ? <button className="btn-ghost sm" style={{ color: "#b45309" }} disabled={faBusy === x.receipt_no} title="ค้างสถานะกำลังส่ง — เช็กใน FlowAccount ว่ามีเอกสารใบนี้แล้วหรือยัง แล้วบันทึกเลข/ปลดล็อก (ไม่ส่งซ้ำอัตโนมัติ)" onClick={() => resolvePending(x)}>⚠️ ค้างส่ง — จัดการ</button>
                    : <button className="btn-ghost sm" disabled={faBusy === x.receipt_no} title="ส่งใบกำกับภาษีเข้า FlowAccount" onClick={() => sendToFlow(x)}>{faBusy === x.receipt_no ? "กำลังส่ง…" : "↗ FlowAccount"}</button>
              )}
              {canEdit && x.status !== "cancelled" && <button className="btn-ghost sm" onClick={() => cancel(x)}>ยกเลิก</button>}
              {canDelete && <button className="btn-ghost sm danger" title="ลบถาวร (ธุรการ)" onClick={() => del(x)}><UIcon name="trash" size={14} /></button>}
            </div></div>
          </div>
          );
        })}
      </div>

      {printR && (() => {
        const inv = invByNo[printR.invoice_no];
        const isVat = inv ? (inv.vat_amt > 0) : (printR.vat_amt > 0);
        const co = isVat ? companies.vat : companies.novat;
        const baseTitle = isVat ? "ใบเสร็จรับเงิน/ใบกำกับภาษี" : "ใบเสร็จรับเงิน";
        const paid = printR.status === "paid";
        const q = quoteByNo[printR.quote_no];
        return (
        <DocSlip company={co} titleTh={baseTitle} titleEn={isVat ? "RECEIPT / TAX INVOICE" : "RECEIPT"} docNo={printR.receipt_no} discountCol={(q?.items || []).some((x) => Number(x.discount) > 0)}
          metaRows={[{ label: "วันที่", value: printR.issue_date }, { label: "อ้างอิงใบแจ้งหนี้", value: printR.invoice_no }, { label: "อ้างอิงใบเสนอ", value: printR.quote_no }, { label: "อ้างอิง BOQ", value: printR.boq_no }, { label: "อ้างอิงใบงาน", value: printR.job_no }]}
          projectTitle={printR.title}
          customer={{ name: printR.customerName, code: custCode(printR.customerCode), taxId: printR.customerTaxId, branch: printR.customerBranch, address: printR.customerAddr, contactName: printR.mainContactName, contactPhone: printR.mainContactPhone, siteName: printR.siteName, siteAddress: printR.siteAddress, siteContactName: printR.siteContactName, siteContactPhone: printR.siteContactPhone, mapUrl: printR.mapUrl }}
          terms={printR.note} termsPayment={printR.terms_payment} termsFreebies={printR.terms_freebies} termsWarranty={printR.terms_warranty} bank={co.bank_info} signLabels={["ผู้รับเงิน", "ผู้จ่ายเงิน"]} signUrl={printR.sign_url} signName={printR.sign_name}
          paymentInfo={paid ? `ได้รับชำระเงินแล้ว · วันที่ ${printR.issue_date || "-"} · โดย ${printR.payment_method || "-"} · จำนวน ${fmtBaht(printR.net)}` : null}
          totals={<div className="doc-totals">
            <div><span>รวมเป็นเงิน</span><b>{fmtBaht(q?.subtotal || 0)}</b></div>
            {q?.discount > 0 && <div><span>ส่วนลด</span><b>− {fmtBaht(q.discount)}</b></div>}
            {q?.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht(q.vatAmt)}</b></div> : null}
            <div className="doc-grand"><span>รวมทั้งสิ้น (เต็มสัญญา)</span><b>{fmtBaht(q?.grand || 0)}</b></div>
            <div style={{ marginTop: 4 }}><span>รับชำระตามใบแจ้งหนี้ {printR.invoice_no}{inv ? ` · งวดที่ ${inv.installment} (${Math.round(inv.pct)}%)` : ""}</span><b /></div>
            {/* ใบกำกับภาษีต้องแสดง "มูลค่า + VAT ของยอดที่เรียกเก็บจริง" (ม.86/4) — เดิมโชว์ VAT ของทั้งสัญญา ลูกค้าเครดิตภาษีซื้อผิดยอด */}
            {Number(printR.base) > 0 && <div><span>มูลค่าก่อนภาษีงวดนี้</span><b>{fmtBaht(printR.base)}</b></div>}
            {Number(printR.vat_amt) > 0 && <div><span>ภาษีมูลค่าเพิ่ม 7% งวดนี้</span><b>{fmtBaht(printR.vat_amt)}</b></div>}
            <div className="doc-grand"><span>รวมเป็นเงินงวดนี้</span><b>{fmtBaht(printR.total)}</b></div>
            {printR.wht_amt > 0 && <div><span>หัก ณ ที่จ่าย {Number(printR.wht_rate) || 3}%</span><b>− {fmtBaht(printR.wht_amt)}</b></div>}
            <div className="doc-grand"><span>รับเงินสุทธิ</span><b>{fmtBaht(printR.net)}</b></div>
          </div>}>
          {/* ราคาบรรทัดพิมพ์ = price_show (รวมค่าบัตรแล้ว) ให้บวกลงตัวกับยอดรวม — เหมือนใบเสนอราคา */}
          {(() => {
            const its = q?.items || []; const hasD = its.some((x) => Number(x.discount) > 0);
            const snap = printR.items || []; const rate = Number(printR.wht_rate) || 3;
            const allAmtP = snap.reduce((a, i) => a + (Number(i.amount) || 0), 0);
            // หัก ณ ที่จ่ายต่อบรรทัด (เฉพาะรายการค่าบริการที่ติ๊ก) — รวมทุกบรรทัด = ยอดหักรวมพอดี (บรรทัดสุดท้ายรับเศษ)
            const perLineBase = {}, perLineWht = {};
            if (printR.wht_amt > 0 && allAmtP > 0) {
              const flagged = snap.map((s, i) => ({ s, i })).filter((o) => o.s.wht);
              const whtBaseTot = round2((printR.base || 0) * flagged.reduce((a, o) => a + (Number(o.s.amount) || 0), 0) / allAmtP);
              let accB = 0, accW = 0;
              flagged.forEach((o, k) => {
                const last = k === flagged.length - 1;
                const b = last ? round2(whtBaseTot - accB) : round2((printR.base || 0) * (Number(o.s.amount) || 0) / allAmtP);
                const w = last ? round2(printR.wht_amt - accW) : round2(b * rate / 100);
                if (!last) { accB = round2(accB + b); accW = round2(accW + w); }
                perLineBase[o.i] = b; perLineWht[o.i] = w;
              });
            }
            return its.map((it, i) => {
              const s = snap[i]; const ok = s && s.name === it.name && perLineWht[i] > 0;
              return (
                <tr key={i}><td>{i + 1}</td><td>{it.item_code || "-"}</td>
                  <td>{it.name}{it.description ? <div className="doc-item-desc">{it.description}</div> : null}
                    {ok && <div className="doc-item-desc" style={{ color: "#b91c1c" }}>↳ หัก ณ ที่จ่าย {rate}% จากยอด {fmtBaht(perLineBase[i])} = − {fmtBaht(perLineWht[i])}</div>}
                  </td>
                  <td className="r">{Number(it.qty)} {it.unit || ""}</td><td className="r">{fmtBaht(it.price_show ?? it.unit_price)}</td>{hasD && <td className="r">{Number(it.discount) > 0 ? "− " + fmtBaht(it.discount) : "-"}</td>}<td className="r">{fmtBaht(Number(it.qty) * Number(it.price_show ?? it.unit_price) - (Number(it.discount) || 0))}</td></tr>
              );
            });
          })()}
        </DocSlip>
      ); })()}

      {view && (
        <LineWhtModal
          title={`ใบเสร็จ ${view.receipt_no}`}
          subtitle={`${view.customerName || "-"} · อ้างอิง ${view.invoice_no || "-"}`}
          items={view.items?.length ? view.items : snapshotItems(quoteByNo[view.quote_no])}
          rate={view.wht_rate || 3} docBase={view.base} docTotal={view.total} canEdit={canEdit && view.status !== "cancelled"}
          onClose={() => setView(null)}
          onSave={async ({ items, rate, whtAmt, net }) => { await setReceiptWht(view.receipt_no, items, items.some((i) => i.wht), rate, whtAmt, net); flash("บันทึกหัก ณ ที่จ่ายแล้ว ✓"); setView(null); await load(); }}
        />
      )}
      {faRes && (
        <div className="modal-overlay" onClick={() => setFaRes(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
            <div className="modal-head"><div className="modal-title">ส่งเข้า FlowAccount · {faRes.x.receipt_no}</div>
              <button className="modal-x" onClick={() => setFaRes(null)}><UIcon name="x" size={18} /></button></div>
            <div className="modal-body">
              {faRes.res.ok
                ? <div className="fa-result" style={{ background: "#dcf5e8", borderColor: "#b7e6cb", color: "#0a6b3d" }}>✅ สร้างเอกสารใน FlowAccount แล้ว{faRes.res.serial ? ` · เลขที่ ${faRes.res.serial}` : ""}{faRes.res.id ? ` · id ${faRes.res.id}` : ""}</div>
                : <div className="fa-result" style={{ background: "#ffedd5", borderColor: "#fed7aa", color: "#9a3412" }}>❌ ไม่สำเร็จ — {faRes.res.reason || ""} {faRes.res.status ? `(HTTP ${faRes.res.status})` : ""}</div>}
              {!faRes.res.ok && faRes.res.msg && <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, background: "var(--surface-2)", padding: 10, borderRadius: 8, marginTop: 8, maxHeight: 240, overflow: "auto" }}>{faRes.res.msg}</pre>}
            </div>
            <div className="modal-foot"><button className="btn-primary" onClick={() => setFaRes(null)}>ปิด</button></div>
          </div>
        </div>
      )}
      {notesEd && <NotesEditModal {...notesEd} onClose={() => setNotesEd(null)} onSaved={load} flash={flash} />}
      {peekEl}
      {toast && <Toast t={toast} />}
    </div>
  );
}

function Toast({ t }) {
  return <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: t.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center" }}>{t.m}</div>;
}
