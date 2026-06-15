import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listInvoices, listQuotations, saveInvoice, deleteInvoice, setInvoiceStatus, setInvoiceWht, getCompanies, billedByQuote, listDocLinks } from "../lib/api";
import { fmtBaht2, custCode, round2, matchText, matchPhone } from "../lib/format";
import { UIcon } from "../icons";
import DocSlip from "./DocSlip";
import DocTerms from "./DocTerms";
import DocChips from "./DocChips";
import LineWhtModal from "./LineWhtModal";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";

// snapshot a quote's line items (full amounts) with default หัก ณ ที่จ่าย flag (services only)
const snapshotItems = (q) => (q?.items || []).map((it) => ({ code: it.item_code || null, name: it.name, desc: it.description || "", unit: it.unit, qty: Number(it.qty), price: Number(it.unit_price), amount: round2(Number(it.qty) * Number(it.unit_price)), wht: it.kind === "service" }));
const lineWhtAmt = (items, base, rate) => { const all = (items || []).reduce((a, i) => a + (Number(i.amount) || 0), 0); const fl = (items || []).filter((i) => i.wht).reduce((a, i) => a + (Number(i.amount) || 0), 0); const ratio = all > 0 ? fl / all : 0; return round2((Number(base) || 0) * ratio * (Number(rate) || 0) / 100); };

const fmtBaht = fmtBaht2; // invoices show 2 decimals to avoid rounding leftovers
const STATUS = { unpaid: { th: "ค้างชำระ", cls: "b-amber" }, paid: { th: "ชำระแล้ว", cls: "b-green" }, cancelled: { th: "ยกเลิก", cls: "b-red" } };
function genNo() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `INV-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
const today = () => new Date().toISOString().slice(0, 10);

export default function Invoices({ role, fromQuote, onFromQuoteConsumed, onCreateReceipt, onOpenDoc, focus, onFocusConsumed }) {
  const canEdit = ["admin", "sales", "exec", "finance"].includes(role);
  const [list, setList] = React.useState([]);
  const [quotes, setQuotes] = React.useState([]);
  const [companies, setCompanies] = React.useState({ vat: {}, novat: {} });
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [ed, setEd] = React.useState(null);
  const [printI, setPrintI] = React.useState(null);
  const [view, setView] = React.useState(null);
  const [search, setSearch] = React.useState("");
  const [statusF, setStatusF] = React.useState("all");
  const [docLinks, setDocLinks] = React.useState({ byQuote: {} });

  async function load() {
    setLoading(true);
    try { const [iv, q, co, dl] = await Promise.all([listInvoices(), listQuotations(), getCompanies(), listDocLinks()]); setList(iv); setQuotes(q); setCompanies(co || { vat: {}, novat: {} }); setDocLinks(dl); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  React.useEffect(() => { if (focus) { setEd(null); setSearch(focus); onFocusConsumed && onFocusConsumed(); } }, [focus]);
  const printWin = React.useRef(null);
  React.useEffect(() => { if (!printI) return; const t = setTimeout(() => { writeAndPrint(printWin.current); printWin.current = null; setPrintI(null); }, 120); return () => clearTimeout(t); }, [printI]);
  // open the create form prefilled from a quotation (link from the quotation page)
  React.useEffect(() => { if (!fromQuote || !quotes.length) return; startNew(fromQuote); onFromQuoteConsumed && onFromQuoteConsumed(); }, [fromQuote, quotes]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }

  const billed = React.useMemo(() => billedByQuote(list), [list]);
  const approvedQuotes = quotes.filter((q) => q.status === "approved");
  const quoteByNo = React.useMemo(() => Object.fromEntries(quotes.map((q) => [q.quote_no, q])), [quotes]);

  function startNew(quoteNo = "") {
    const q = quoteNo ? quoteByNo[quoteNo] : null;
    setEd({ invoice_no: genNo(), quote_no: quoteNo, issue_date: today(), due_date: "", basis: "percent", basis_value: 100, note: "",
      wht_rate: Number(q?.wht_rate) || 3,
      terms_payment: q?.terms_payment || "", terms_freebies: q?.terms_freebies || "", terms_warranty: q?.terms_warranty || "" });
  }
  // picking a quote pulls its end-of-document terms forward (หัก ณ ที่จ่าย คำนวณอัตโนมัติสำหรับนิติบุคคล)
  function pickQuote(qno) {
    const q = quoteByNo[qno];
    setEd((e) => ({ ...e, quote_no: qno, wht_rate: Number(q?.wht_rate) || 3, terms_payment: q?.terms_payment || "", terms_freebies: q?.terms_freebies || "", terms_warranty: q?.terms_warranty || "" }));
  }
  // approved quotes that still have a balance to bill (shown in the picker)
  const billableQuotes = approvedQuotes.filter((q) => round2((q.grand || 0) - (billed[q.quote_no] || 0)) > 0.01);
  const setF = (k, v) => setEd((e) => ({ ...e, [k]: v }));
  const selQ = ed?.quote_no ? quoteByNo[ed.quote_no] : null;
  const remaining = selQ ? Math.max(0, round2((selQ.grand || 0) - (billed[selQ.quote_no] || 0))) : 0;
  const newTotal = (() => {
    if (!selQ) return 0;
    const v = Number(ed.basis_value) || 0;
    const t = ed.basis === "percent" ? (selQ.grand || 0) * v / 100 : v;
    return round2(Math.min(t, remaining));
  })();

  // หัก ณ ที่จ่าย เลือกได้ตอนทำใบแจ้งหนี้ — เฉพาะลูกค้านิติบุคคล
  const canWhtInv = selQ?.customerType === "company";
  // ----- breakdown ขั้นเป็นตอนของยอดงวดนี้ (โชว์ให้เห็นชัดในตัวแก้ไข) -----
  const calc = (() => {
    if (!selQ) return null;
    const f = selQ.grand > 0 ? newTotal / selQ.grand : 0;       // สัดส่วนงวดนี้เทียบยอดทั้งใบ
    const baseInst = round2((selQ.afterDisc || 0) * f);          // ฐานก่อน VAT ของงวดนี้
    const vatInst = round2((selQ.vatAmt || 0) * f);             // VAT 7% ของงวดนี้
    const items = snapshotItems(selQ);
    const allAmt = items.reduce((a, i) => a + (Number(i.amount) || 0), 0);
    const svcAmt = items.filter((i) => i.wht).reduce((a, i) => a + (Number(i.amount) || 0), 0);
    const svcRatio = allAmt > 0 ? svcAmt / allAmt : 0;          // สัดส่วนค่าบริการ (ฐานที่ถูกหัก ณ ที่จ่าย)
    const whtOn = canWhtInv && svcAmt > 0;          // นิติบุคคล + มีรายการค่าบริการ → หักอัตโนมัติ
    const whtRate = Number(ed.wht_rate) || 3;
    const whtBase = round2(baseInst * svcRatio);                // ฐานหัก ณ ที่จ่าย งวดนี้ (ค่าบริการ)
    const whtAmt = whtOn ? lineWhtAmt(items, baseInst, whtRate) : 0;
    const svcNames = items.filter((i) => i.wht).map((i) => i.name);   // รายการค่าบริการที่เป็นฐานหัก
    return { f, baseInst, vatInst, svcRatio, svcAmt, allAmt, whtOn, whtRate, whtBase, whtAmt, svcNames, net: round2(newTotal - whtAmt) };
  })();

  async function save() {
    if (!selQ) return flash("เลือกใบเสนอราคาก่อน", true);
    if (newTotal <= 0) return flash("ยอดงวดต้องมากกว่า 0 (อาจวางบิลครบ 100% แล้ว)", true);
    if (newTotal > remaining + 0.01) return flash("ยอดงวดเกินยอดคงเหลือ", true);
    const f = selQ.grand > 0 ? newTotal / selQ.grand : 0;
    const installment = list.filter((x) => x.quote_no === selQ.quote_no && x.status !== "cancelled").length + 1;
    const base = round2((selQ.afterDisc || 0) * f);
    // หัก ณ ที่จ่าย — คำนวณอัตโนมัติสำหรับลูกค้านิติบุคคลที่มีรายการค่าบริการ
    const snap = snapshotItems(selQ);
    const hasSvc = snap.some((it) => it.wht);
    const useWht = canWhtInv && hasSvc;
    const items = snap.map((it) => ({ ...it, wht: useWht && it.wht }));
    const wht_rate = useWht ? (Number(ed.wht_rate) || 3) : 0;
    const inv = {
      invoice_no: ed.invoice_no, quote_no: selQ.quote_no, boq_no: selQ.boq_no || null,
      customer_id: selQ.customer_id || null, site_id: selQ.site_id || null,
      issue_date: ed.issue_date || null, due_date: ed.due_date || null, installment, pct: round2(f * 100),
      base, vat_amt: round2((selQ.vatAmt || 0) * f), total: newTotal, wht_rate, items, wht_amt: useWht ? lineWhtAmt(items, base, wht_rate) : 0,
      note: ed.note, terms_payment: ed.terms_payment, terms_freebies: ed.terms_freebies, terms_warranty: ed.terms_warranty, status: "unpaid",
    };
    try { await saveInvoice(inv); flash(`สร้างใบแจ้งหนี้งวดที่ ${installment} แล้ว`); setEd(null); await load(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  // chain lock: can't edit/delete/cancel an invoice that already has a receipt downstream
  const lockMsg = (x) => x.hasReceipt ? "แก้ไข/ลบ/ยกเลิกใบแจ้งหนี้นี้ไม่ได้ — ออกใบเสร็จจากใบนี้แล้ว\nต้องลบใบเสร็จก่อน" : null;
  async function del(x) { const lk = lockMsg(x); if (lk) return alert(lk); if (!await confirmDialog(`ลบใบแจ้งหนี้ ${x.invoice_no}?`)) return; try { await deleteInvoice(x.invoice_no); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }
  async function cancel(x) { const lk = lockMsg(x); if (lk) return alert(lk); if (!await confirmDialog(`ยกเลิกใบแจ้งหนี้ ${x.invoice_no}? (ยอดจะคืนกลับไปคงเหลือ)`)) return; try { await setInvoiceStatus(x.invoice_no, "cancelled"); flash("ยกเลิกแล้ว"); await load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); } }

  // ---------- EDITOR ----------
  if (ed) {
    return (
      <div className="adm">
        <div className="adm-head"><div><h1 className="page-title">ใบแจ้งหนี้ <span className="page-title-en">Invoice</span></h1>
          <p className="page-sub">อ้างอิงใบเสนอราคา · แบ่งงวดตาม % หรือยอดเงิน จนครบ 100%</p></div></div>
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="fld-row">
            <label className="fld"><span>เลขที่ใบแจ้งหนี้</span><input className="inp" value={ed.invoice_no} onChange={(e) => setF("invoice_no", e.target.value)} /></label>
            <label className="fld"><span>อ้างอิงใบเสนอราคา (อนุมัติแล้ว)</span>
              <Combo className="inp" value={ed.quote_no} onChange={(e) => pickQuote(e.target.value)}>
                <option value="">— เลือกใบเสนอราคา —</option>
                {/* only quotes that still have a balance — fully-billed (100%) ones are hidden */}
                {billableQuotes.map((q) => <option key={q.quote_no} value={q.quote_no}>{q.quote_no} · {q.customerName || "-"} · เหลือ {fmtBaht(round2((q.grand || 0) - (billed[q.quote_no] || 0)))}</option>)}
              </Combo>
            </label>
          </div>

          {selQ && (
            <div className="inv-summary">
              <div><span>ลูกค้า</span><b>{selQ.customerName || "-"} · {custCode(selQ.customer_id)}</b></div>
              <div><span>อ้างอิง</span><b>{selQ.quote_no}{selQ.boq_no ? ` · BOQ ${selQ.boq_no}` : ""}</b></div>
              <div><span>ยอดรวมทั้งสิ้น</span><b>{fmtBaht(selQ.grand)}</b></div>
              <div><span>วางบิลแล้ว</span><b>{fmtBaht(billed[selQ.quote_no] || 0)}</b></div>
              <div className="inv-remain"><span>คงเหลือวางบิลได้</span><b>{fmtBaht(remaining)}</b></div>
            </div>
          )}

          <div className="fld-row">
            <label className="fld"><span>วันที่</span><input className="inp" type="date" value={ed.issue_date} onChange={(e) => setF("issue_date", e.target.value)} /></label>
            <label className="fld"><span>ครบกำหนดชำระ</span><input className="inp" type="date" value={ed.due_date} onChange={(e) => setF("due_date", e.target.value)} /></label>
          </div>

          <div className="fld-row">
            <label className="fld"><span>วางบิลงวดนี้</span>
              <div className="line-add">
                <Combo className="inp" style={{ width: 110, flex: "none" }} value={ed.basis} onChange={(e) => setF("basis", e.target.value)}>
                  <option value="percent">เป็น %</option><option value="amount">เป็นบาท</option>
                </Combo>
                <input className="inp" type="number" min="0" step="0.01" value={ed.basis_value} onChange={(e) => setF("basis_value", Number(e.target.value) || 0)} />
                <button className="btn-ghost sm" onClick={() => setF("basis_value", ed.basis === "percent" ? 100 : remaining)} disabled={!selQ}>ยอดคงเหลือ</button>
              </div>
            </label>
            <div className="fld"><span>ยอดงวดนี้ (รวม VAT)</span><div className="inv-total">{fmtBaht(newTotal)}</div></div>
          </div>

          {canWhtInv && calc && (
            <div className="fld-row">
              <label className="fld"><span>หัก ณ ที่จ่าย <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>(นิติบุคคล · คำนวณอัตโนมัติจากค่าบริการ)</span></span>
                <div className="line-add">
                  <div className="inp" style={{ flex: 1, display: "flex", alignItems: "center", color: calc.whtOn ? "var(--ink)" : "var(--ink-3)" }}>
                    {calc.whtOn ? `หัก ${calc.whtRate}% จากค่าบริการ ${fmtBaht(calc.whtBase)} = ${fmtBaht(calc.whtAmt)}` : "ไม่มีรายการค่าบริการให้หัก"}
                  </div>
                  <div className="inp inp-unit" style={{ width: 110, flex: "none", opacity: calc.whtOn ? 1 : .5 }}>
                    <input type="number" min="0" step="0.1" value={ed.wht_rate} disabled={!calc.whtOn} onChange={(e) => setF("wht_rate", Number(e.target.value) || 0)} /><span className="unit-suf">%</span>
                  </div>
                </div>
              </label>
              <div className="fld" />
            </div>
          )}

          {selQ && calc && newTotal > 0 && (
            <div className="inv-breakdown">
              <div className="ivb-title">ลำดับการคำนวณยอดงวดนี้</div>
              <div className="ivb-row"><span>1) ยอดก่อน VAT ทั้งใบเสนอราคา</span><b>{fmtBaht(selQ.afterDisc || 0)}</b></div>
              <div className="ivb-row"><span>2) VAT 7% ทั้งใบ {selQ.vat ? "" : "(ไม่คิด VAT)"}</span><b>{fmtBaht(selQ.vatAmt || 0)}</b></div>
              <div className="ivb-row ivb-sum"><span>3) ยอดรวมทั้งสิ้นทั้งใบ (1+2)</span><b>{fmtBaht(selQ.grand || 0)}</b></div>
              <div className="ivb-row ivb-muted"><span>– วางบิลไปแล้ว</span><b>{fmtBaht(billed[selQ.quote_no] || 0)}</b></div>
              <div className="ivb-row ivb-muted"><span>= คงเหลือวางบิลได้</span><b>{fmtBaht(remaining)}</b></div>
              <div className="ivb-sep" />
              <div className="ivb-row"><span>4) งวดนี้ {ed.basis === "percent" ? `${Number(ed.basis_value) || 0}% ของยอดรวมทั้งสิ้น` : "ตามยอดที่กรอก"}</span><b>{fmtBaht(newTotal)}</b></div>
              <div className="ivb-row ivb-muted"><span>→ สัดส่วนงวดนี้ = {fmtBaht(newTotal)} ÷ {fmtBaht(selQ.grand || 0)}</span><b>{(calc.f * 100).toFixed(2)}%</b></div>
              <div className="ivb-row"><span>5) ฐานก่อน VAT งวดนี้ = {fmtBaht(selQ.afterDisc || 0)} × {(calc.f * 100).toFixed(2)}%</span><b>{fmtBaht(calc.baseInst)}</b></div>
              <div className="ivb-row"><span>6) VAT 7% งวดนี้</span><b>{fmtBaht(calc.vatInst)}</b></div>
              <div className="ivb-row ivb-sum"><span>7) ยอดงวดนี้รวม VAT (5+6)</span><b>{fmtBaht(newTotal)}</b></div>
              {calc.whtOn ? (<>
                <div className="ivb-sep" />
                {calc.svcNames.length > 0 && <div className="ivb-row ivb-muted"><span>รายการค่าบริการที่นำมาหัก: {calc.svcNames.join(", ")}</span><b /></div>}
                <div className="ivb-row ivb-muted"><span>สัดส่วนค่าบริการ (ฐานที่ถูกหัก) = {fmtBaht(calc.svcAmt)} ÷ {fmtBaht(calc.allAmt)}</span><b>{(calc.svcRatio * 100).toFixed(2)}%</b></div>
                <div className="ivb-row"><span>8) ฐานหัก ณ ที่จ่าย งวดนี้ = {fmtBaht(calc.baseInst)} × {(calc.svcRatio * 100).toFixed(2)}%</span><b>{fmtBaht(calc.whtBase)}</b></div>
                <div className="ivb-row ivb-wht"><span>9) หัก ณ ที่จ่าย {calc.whtRate}% = {fmtBaht(calc.whtBase)} × {calc.whtRate}%</span><b>− {fmtBaht(calc.whtAmt)}</b></div>
                <div className="ivb-row ivb-net"><span>10) ยอดรับสุทธิงวดนี้ (7 − 9)</span><b>{fmtBaht(calc.net)}</b></div>
              </>) : (
                <div className="ivb-row ivb-net"><span>8) ยอดรับสุทธิงวดนี้</span><b>{fmtBaht(newTotal)}</b></div>
              )}
            </div>
          )}

          <DocTerms payment={ed.terms_payment} freebies={ed.terms_freebies} warranty={ed.terms_warranty} onChange={(k, v) => setF(k, v)} />

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn-ghost" onClick={() => setEd(null)}>ยกเลิก</button>
            <button className="btn-primary" style={{ flex: 1 }} disabled={!selQ || newTotal <= 0} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> สร้างใบแจ้งหนี้</button>
          </div>
        </div>
        {toast && <Toast t={toast} />}
      </div>
    );
  }

  // ---------- LIST ----------
  const shown = list.filter((x) => (statusF === "all" || x.status === statusF)
    && (matchText(search, x.invoice_no, x.customerName, x.quote_no, x.createdByName) || matchPhone(search, x.contactPhone)));
  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ใบแจ้งหนี้ <span className="page-title-en">Invoices</span></h1><p className="page-sub">{list.length} ใบ · แบ่งงวดจากใบเสนอราคา</p></div>
        <div className="cat-head-actions">
          <div className="cat-search"><UIcon name="search" size={17} color="var(--ink-3)" />
            <input placeholder="ค้นหาเลขที่ / ลูกค้า / ใบเสนอ" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="cat-search-x" onClick={() => setSearch("")}><UIcon name="x" size={15} /></button>}
          </div>
          {canEdit && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> สร้างใบแจ้งหนี้</button>}
        </div>
      </div>
      <div className="cat-filter">
        {[["all", "ทั้งหมด"], ["unpaid", "ค้างชำระ"], ["paid", "ชำระแล้ว"], ["cancelled", "ยกเลิก"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)}
            style={statusF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
      </div>
      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && shown.length === 0 && <div className="empty">{list.length === 0 ? "ยังไม่มีใบแจ้งหนี้" : "ไม่พบใบแจ้งหนี้"}</div>}
      <div className="job-cards">
        {shown.map((x) => {
          const st = STATUS[x.status] || STATUS.unpaid;
          const q = quoteByNo[x.quote_no];
          const grand = q?.grand || 0; const bl = billed[x.quote_no] || 0;
          return (
            <div className={"card job-card" + (x.status !== "unpaid" ? " closed" : "")} key={x.invoice_no}>
              <div className="job-card-head clickable-card" onClick={() => setView(x)} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setView(x)}>
                <div className="job-card-id"><span className="job-no">{x.invoice_no}</span><span className={"job-badge " + st.cls}>{st.th}</span></div>
                <div className="job-card-meta inv-meta">
                  <span className="inv-period">งวดที่ {x.installment} · {Math.round(x.pct)}%</span>
                  <span className="inv-cust">{x.customerName || "-"}</span>
                  {x.createdByName && <span className="inv-by">👤 {x.createdByName}</span>}
                  <span className="inv-hint">ดูรายการ ›</span>
                </div>
                <div className="job-card-cost"><span>ยอดงวดนี้</span><b>{fmtBaht(x.total)}</b></div>
              </div>
              {grand > 0 && <div className="inv-progress"><div className="inv-bar"><div style={{ width: Math.min(100, bl / grand * 100) + "%" }} /></div><span>วางบิลรวม {fmtBaht(bl)} / {fmtBaht(grand)}{bl >= grand - 0.01 ? " · ครบ 100% ✓" : ""}</span></div>}
              {(() => { const ch = docLinks.byQuote[x.quote_no] || {}; return <DocChips boqNo={x.boq_no} quoteNo={x.quote_no} jobNos={ch.jobNos} invoiceNos={ch.invoiceNos} receiptNos={ch.receiptNos} self={{ type: "invoice", no: x.invoice_no }} onOpen={onOpenDoc} />; })()}
              <div className="job-lines"><div className="job-actions">
                {x.hasReceipt && <span className="job-badge b-green">✓ ออกใบเสร็จแล้ว</span>}
                {canEdit && x.status === "unpaid" && !x.hasReceipt && onCreateReceipt && <button className="btn-primary sm" onClick={() => onCreateReceipt(x.invoice_no)}><UIcon name="clipboard" size={14} color="#fff" /> ออกใบเสร็จ</button>}
                {canEdit && x.quote_no && round2(grand - bl) > 0.01 && <button className="btn-ghost sm" onClick={() => startNew(x.quote_no)}><UIcon name="plus" size={14} /> วางบิลงวดถัดไป</button>}
                <button className="btn-ghost sm" onClick={() => { printWin.current = openPrintWindow(); setPrintI(x); }}><UIcon name="catalog" size={14} /> พิมพ์</button>
                {canEdit && x.status === "unpaid" && <button className="btn-ghost sm" disabled={x.hasReceipt} title={lockMsg(x) || ""} onClick={() => cancel(x)}>ยกเลิก</button>}
                {canEdit && <button className="btn-ghost sm danger" disabled={x.hasReceipt} title={lockMsg(x) || ""} onClick={() => del(x)}><UIcon name="trash" size={14} /></button>}
              </div></div>
            </div>
          );
        })}
      </div>

      {printI && (() => {
        const q = quoteByNo[printI.quote_no]; const co = (q ? q.vat : true) ? companies.vat : companies.novat;
        // ฐานค่าบริการที่นำมาหัก ณ ที่จ่าย ของงวดนี้ (โชว์ให้ลูกค้าเห็นที่มา)
        const whtItems = (printI.items || []).filter((i) => i.wht);
        const allAmtP = (printI.items || []).reduce((a, i) => a + (Number(i.amount) || 0), 0);
        const svcAmtP = whtItems.reduce((a, i) => a + (Number(i.amount) || 0), 0);
        const whtBaseP = allAmtP > 0 ? round2((printI.base || 0) * svcAmtP / allAmtP) : 0;
        const whtNames = whtItems.map((i) => i.name).filter(Boolean);
        return (
        <DocSlip company={co} titleTh="ใบแจ้งหนี้" titleEn="INVOICE" docNo={printI.invoice_no}
          metaRows={[{ label: "วันที่", value: printI.issue_date }, { label: "ครบกำหนด", value: printI.due_date }, { label: "อ้างอิงใบเสนอ", value: printI.quote_no }, { label: "อ้างอิง BOQ", value: printI.boq_no }, { label: "งวดที่", value: `${printI.installment} (${Math.round(printI.pct)}%)` }]}
          projectTitle={printI.title}
          customer={{ name: printI.customerName, code: custCode(printI.customerCode), taxId: printI.customerTaxId, address: printI.siteAddress || printI.customerAddr, contactName: printI.contactName, contactPhone: printI.contactPhone, mapUrl: printI.mapUrl }}
          terms={printI.note || co.default_terms} termsPayment={printI.terms_payment} termsFreebies={printI.terms_freebies} termsWarranty={printI.terms_warranty} bank={co.bank_info} signLabels={["ผู้วางบิล", "ผู้รับวางบิล"]}
          totals={<div className="doc-totals">
            <div><span>รวมเป็นเงิน</span><b>{fmtBaht(q?.subtotal || 0)}</b></div>
            {q?.discount > 0 && <div><span>ส่วนลด</span><b>− {fmtBaht(q.discount)}</b></div>}
            {q?.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht(q.vatAmt)}</b></div> : null}
            <div className="doc-grand"><span>รวมทั้งสิ้น (เต็มสัญญา)</span><b>{fmtBaht(q?.grand || 0)}</b></div>
            <div style={{ marginTop: 4 }}><span>งวดที่ {printI.installment} ({Math.round(printI.pct)}%)</span><b /></div>
            <div className="doc-grand"><span>ยอดชำระงวดนี้</span><b>{fmtBaht(printI.total)}</b></div>
            {printI.wht_amt > 0 && <div className="doc-wht-note"><span>ฐานค่าบริการที่ถูกหัก ณ ที่จ่าย{whtNames.length ? ` (${whtNames.join(", ")})` : ""}</span><b>{fmtBaht(whtBaseP)}</b></div>}
            {printI.wht_amt > 0 && <div><span>หัก ณ ที่จ่าย {Number(printI.wht_rate) || 3}% (ตอนชำระ)</span><b>− {fmtBaht(printI.wht_amt)}</b></div>}
            {printI.wht_amt > 0 && <div className="doc-grand"><span>ยอดรับสุทธิงวดนี้</span><b>{fmtBaht(printI.total - printI.wht_amt)}</b></div>}
          </div>}>
          {(q?.items || []).map((it, i) => (
            <tr key={i}><td>{i + 1}</td><td>{it.item_code || "-"}</td><td>{it.name}{it.description ? <div className="doc-item-desc">{it.description}</div> : null}</td><td className="r">{Number(it.qty)} {it.unit || ""}</td><td className="r">{fmtBaht(it.unit_price)}</td><td className="r">{fmtBaht(Number(it.qty) * Number(it.unit_price))}</td></tr>
          ))}
        </DocSlip>
      ); })()}

      {view && (
        <LineWhtModal
          title={`ใบแจ้งหนี้ ${view.invoice_no}`}
          subtitle={`งวด ${view.installment} (${Math.round(view.pct)}%) · ${view.customerName || "-"}`}
          items={view.items?.length ? view.items : snapshotItems(quoteByNo[view.quote_no])}
          rate={view.wht_rate || 3} docBase={view.base} docTotal={view.total} canEdit={canEdit && !view.hasReceipt}
          onClose={() => setView(null)}
          onSave={async ({ items, rate, whtAmt }) => { await setInvoiceWht(view.invoice_no, items, rate, whtAmt); flash("บันทึกหัก ณ ที่จ่ายแล้ว ✓"); setView(null); await load(); }}
        />
      )}
      {toast && <Toast t={toast} />}
    </div>
  );
}

function Toast({ t }) {
  return <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: t.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center" }}>{t.m}</div>;
}
