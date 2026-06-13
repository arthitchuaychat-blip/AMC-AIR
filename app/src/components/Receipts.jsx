import React from "react";
import { listReceipts, listInvoices, listQuotations, saveReceipt, deleteReceipt, setReceiptStatus, setReceiptWht, getCompanies, listDocLinks } from "../lib/api";
import { fmtBaht2, custCode, round2 } from "../lib/format";
import { UIcon } from "../icons";
import DocSlip from "./DocSlip";
import DocChips from "./DocChips";
import LineWhtModal from "./LineWhtModal";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";

const fmtBaht = fmtBaht2; // receipts show 2 decimals
const snapshotItems = (q) => (q?.items || []).map((it) => ({ code: it.item_code || null, name: it.name, desc: it.description || "", unit: it.unit, qty: Number(it.qty), price: Number(it.unit_price), amount: round2(Number(it.qty) * Number(it.unit_price)), wht: it.kind === "service" }));
const lineWhtAmt = (items, base, rate) => { const all = (items || []).reduce((a, i) => a + (Number(i.amount) || 0), 0); const fl = (items || []).filter((i) => i.wht).reduce((a, i) => a + (Number(i.amount) || 0), 0); const ratio = all > 0 ? fl / all : 0; return round2((Number(base) || 0) * ratio * (Number(rate) || 0) / 100); };
const METHODS = ["เงินสด", "โอนเงิน", "เช็ค", "บัตรเครดิต"];
const RSTATUS = { pending: { th: "รอชำระเงิน", cls: "b-amber" }, paid: { th: "ชำระเงินแล้ว", cls: "b-green" } };
function genNo() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `REC-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
const today = () => new Date().toISOString().slice(0, 10);

export default function Receipts({ role, fromInvoice, onFromInvoiceConsumed, onOpenDoc, focus, onFocusConsumed }) {
  const canEdit = ["admin", "sales", "exec", "finance"].includes(role);
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
  const [statusF, setStatusF] = React.useState("all");
  const [docLinks, setDocLinks] = React.useState({ byQuote: {} });

  async function load() {
    setLoading(true);
    try { const [rc, iv, q, co, dl] = await Promise.all([listReceipts(), listInvoices(), listQuotations(), getCompanies(), listDocLinks()]); setList(rc); setInvoices(iv); setQuotes(q); setCompanies(co || { vat: {}, novat: {} }); setDocLinks(dl); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  React.useEffect(() => { if (focus) { setEd(null); setSearch(focus); onFocusConsumed && onFocusConsumed(); } }, [focus]);
  const printWin = React.useRef(null);
  React.useEffect(() => { if (!printR) return; const t = setTimeout(() => { writeAndPrint(printWin.current); printWin.current = null; setPrintR(null); }, 120); return () => clearTimeout(t); }, [printR]);
  // open the create form prefilled from an invoice (link from the invoice page)
  React.useEffect(() => { if (!fromInvoice || !invoices.length) return; startNew(); onPickInvoice(fromInvoice); onFromInvoiceConsumed && onFromInvoiceConsumed(); }, [fromInvoice, invoices]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }

  const openInvoices = invoices.filter((x) => x.status === "unpaid" && !x.hasReceipt);
  const invByNo = React.useMemo(() => Object.fromEntries(invoices.map((x) => [x.invoice_no, x])), [invoices]);
  const quoteByNo = React.useMemo(() => Object.fromEntries(quotes.map((q) => [q.quote_no, q])), [quotes]);

  function startNew() { setEd({ receipt_no: genNo(), invoice_no: "", issue_date: today(), payment_method: METHODS[1], status: "paid", items: [], wht_rate: 3, note: "" }); }
  // copy the invoice's line items (with WHT flags) when an invoice is selected
  function onPickInvoice(invoice_no) {
    const iv = invByNo[invoice_no];
    const items = iv?.items?.length ? iv.items.map((x) => ({ ...x })) : snapshotItems(quoteByNo[iv?.quote_no]);
    setEd((s) => ({ ...s, invoice_no, items, wht_rate: iv?.wht_rate || 3 }));
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
      note: ed.note,
    };
    try { await saveReceipt(r); flash(r.status === "paid" ? `ออกใบเสร็จ + ปิดใบแจ้งหนี้ ${selInv.invoice_no} แล้ว` : `ออกใบเสร็จ (รอชำระเงิน) แล้ว`); setEd(null); await load(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(x) { if (!window.confirm(`ลบใบเสร็จ ${x.receipt_no}? (ใบแจ้งหนี้จะกลับเป็นค้างชำระ)`)) return; try { await deleteReceipt(x.receipt_no, x.invoice_no); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }

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
              <select className="inp" value={ed.invoice_no} onChange={(e) => onPickInvoice(e.target.value)}>
                <option value="">— เลือกใบแจ้งหนี้ —</option>
                {openInvoices.map((x) => <option key={x.invoice_no} value={x.invoice_no}>{x.invoice_no} · งวด {x.installment} · {x.customerName || "-"} ({fmtBaht(x.total)})</option>)}
              </select>
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
              <select className="inp" value={ed.payment_method} onChange={(e) => setF("payment_method", e.target.value)}>{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
            </label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>สถานะการชำระ</span>
              <select className="inp" value={ed.status} onChange={(e) => setF("status", e.target.value)}>
                <option value="paid">ชำระเงินแล้ว (ปิดใบแจ้งหนี้)</option>
                <option value="pending">รอชำระเงิน (ออกใบเสร็จก่อน)</option>
              </select>
            </label>
            <label className="fld"><span>อัตราหัก ณ ที่จ่าย</span>
              <div className="inp inp-unit" style={{ width: 120 }}>
                <input type="number" min="0" step="0.1" value={ed.wht_rate} onChange={(e) => setF("wht_rate", Number(e.target.value) || 0)} /><span className="unit-suf">%</span>
              </div>
            </label>
          </div>
          {selInv && <p className="page-sub" style={{ margin: "0 0 6px" }}>หัก ณ ที่จ่าย ดึงจากใบแจ้งหนี้ (ค่าบริการ) · ปรับรายบรรทัดได้โดยกดที่ใบเสร็จในรายการหลังออกใบ</p>}
          <label className="fld"><span>หมายเหตุ</span><input className="inp" value={ed.note} onChange={(e) => setF("note", e.target.value)} placeholder="(ไม่บังคับ)" /></label>

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
  const ql = search.trim().toLowerCase();
  const shown = list.filter((x) => (statusF === "all" || x.status === statusF)
    && (!ql || x.receipt_no.toLowerCase().includes(ql) || (x.customerName || "").toLowerCase().includes(ql) || (x.quote_no || "").toLowerCase().includes(ql) || (x.job_no || "").toLowerCase().includes(ql)));
  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ใบเสร็จรับเงิน <span className="page-title-en">Receipts</span></h1><p className="page-sub">{list.length} ใบ</p></div>
        <div className="cat-head-actions">
          <div className="cat-search"><UIcon name="search" size={17} color="var(--ink-3)" />
            <input placeholder="ค้นหาเลขที่ / ลูกค้า / ใบเสนอ / ใบงาน" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="cat-search-x" onClick={() => setSearch("")}><UIcon name="x" size={15} /></button>}
          </div>
          {canEdit && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> ออกใบเสร็จ</button>}
        </div>
      </div>
      <div className="cat-filter">
        {[["all", "ทั้งหมด"], ["pending", "รอชำระเงิน"], ["paid", "ชำระเงินแล้ว"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)}
            style={statusF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
      </div>
      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && shown.length === 0 && <div className="empty">{list.length === 0 ? "ยังไม่มีใบเสร็จ" : "ไม่พบใบเสร็จ"}</div>}
      <div className="job-cards">
        {shown.map((x) => {
          const st = RSTATUS[x.status] || RSTATUS.paid;
          return (
          <div className={"card job-card" + (x.status === "paid" ? " closed" : "")} key={x.receipt_no}>
            <div className="job-card-head clickable-card" onClick={() => setView(x)} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setView(x)}>
              <div className="job-card-id"><span className="job-no">{x.receipt_no}</span><span className={"job-badge " + st.cls}>{st.th}</span></div>
              <div className="job-card-meta inv-meta">
                <span className="inv-cust">{x.customerName || "-"}</span>
                <span className="inv-hint">ดูรายการ ›</span>
              </div>
              <div className="job-card-cost"><span>ยอดรับสุทธิ</span><b>{fmtBaht(x.net)}</b></div>
            </div>
            {(() => { const ch = docLinks.byQuote[x.quote_no] || {}; return <DocChips boqNo={x.boq_no} quoteNo={x.quote_no} jobNos={ch.jobNos} invoiceNos={ch.invoiceNos} receiptNos={ch.receiptNos} self={{ type: "receipt", no: x.receipt_no }} onOpen={onOpenDoc} />; })()}
            <div className="job-lines"><div className="job-actions">
              {canEdit && x.status === "pending" && <button className="btn-primary sm" onClick={() => markPaid(x)}><UIcon name="check" size={14} color="#fff" strokeWidth={2.4} /> รับเงินแล้ว</button>}
              <button className="btn-ghost sm" onClick={() => { printWin.current = openPrintWindow(); setPrintR(x); }}><UIcon name="catalog" size={14} /> พิมพ์</button>
              {canEdit && <button className="btn-ghost sm danger" onClick={() => del(x)}><UIcon name="trash" size={14} /></button>}
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
        <DocSlip company={co} titleTh={baseTitle} titleEn={isVat ? "RECEIPT / TAX INVOICE" : "RECEIPT"} docNo={printR.receipt_no}
          metaRows={[{ label: "วันที่", value: printR.issue_date }, { label: "อ้างอิงใบแจ้งหนี้", value: printR.invoice_no }, { label: "อ้างอิงใบเสนอ", value: printR.quote_no }, { label: "อ้างอิง BOQ", value: printR.boq_no }, { label: "อ้างอิงใบงาน", value: printR.job_no }]}
          projectTitle={printR.title}
          customer={{ name: printR.customerName, code: custCode(printR.customerCode), taxId: printR.customerTaxId, address: printR.siteAddress || printR.customerAddr, contactName: printR.contactName, contactPhone: printR.contactPhone, mapUrl: printR.mapUrl }}
          terms={printR.note} bank={co.bank_info} signLabels={["ผู้รับเงิน", "ผู้จ่ายเงิน"]}
          paymentInfo={paid ? `ได้รับชำระเงินแล้ว · วันที่ ${printR.issue_date || "-"} · โดย ${printR.payment_method || "-"} · จำนวน ${fmtBaht(printR.net)}` : null}>
          <table className="doc-table">
            <thead><tr><th>#</th><th>รหัส</th><th>รายการ</th><th className="r">จำนวน</th><th className="r">หน่วยละ</th><th className="r">จำนวนเงิน</th></tr></thead>
            <tbody>{(q?.items || []).map((it, i) => (
              <tr key={i}><td>{i + 1}</td><td>{it.item_code || "-"}</td><td>{it.name}{it.description ? <div className="doc-item-desc">{it.description}</div> : null}</td><td className="r">{Number(it.qty)} {it.unit || ""}</td><td className="r">{fmtBaht(it.unit_price)}</td><td className="r">{fmtBaht(Number(it.qty) * Number(it.unit_price))}</td></tr>
            ))}</tbody>
          </table>
          <div className="doc-totals">
            <div><span>รวมเป็นเงิน</span><b>{fmtBaht(q?.subtotal || 0)}</b></div>
            {q?.discount > 0 && <div><span>ส่วนลด</span><b>− {fmtBaht(q.discount)}</b></div>}
            {q?.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht(q.vatAmt)}</b></div> : null}
            <div className="doc-grand"><span>รวมทั้งสิ้น (เต็มสัญญา)</span><b>{fmtBaht(q?.grand || 0)}</b></div>
            <div style={{ marginTop: 4 }}><span>รับชำระตามใบแจ้งหนี้ {printR.invoice_no}{inv ? ` · งวดที่ ${inv.installment} (${Math.round(inv.pct)}%)` : ""}</span><b /></div>
            <div className="doc-grand"><span>รวมเป็นเงินงวดนี้</span><b>{fmtBaht(printR.total)}</b></div>
            {printR.wht_amt > 0 && <div><span>หัก ณ ที่จ่าย {Number(printR.wht_rate) || 3}%</span><b>− {fmtBaht(printR.wht_amt)}</b></div>}
            <div className="doc-grand"><span>รับเงินสุทธิ</span><b>{fmtBaht(printR.net)}</b></div>
          </div>
        </DocSlip>
      ); })()}

      {view && (
        <LineWhtModal
          title={`ใบเสร็จ ${view.receipt_no}`}
          subtitle={`${view.customerName || "-"} · อ้างอิง ${view.invoice_no || "-"}`}
          items={view.items?.length ? view.items : snapshotItems(quoteByNo[view.quote_no])}
          rate={view.wht_rate || 3} docBase={view.base} docTotal={view.total} canEdit={canEdit}
          onClose={() => setView(null)}
          onSave={async ({ items, rate, whtAmt, net }) => { await setReceiptWht(view.receipt_no, items, items.some((i) => i.wht), rate, whtAmt, net); flash("บันทึกหัก ณ ที่จ่ายแล้ว ✓"); setView(null); await load(); }}
        />
      )}
      {toast && <Toast t={toast} />}
    </div>
  );
}

function Toast({ t }) {
  return <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: t.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center" }}>{t.m}</div>;
}
