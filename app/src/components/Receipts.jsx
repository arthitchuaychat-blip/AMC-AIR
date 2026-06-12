import React from "react";
import { listReceipts, listInvoices, saveReceipt, deleteReceipt, setReceiptStatus, getCompanies } from "../lib/api";
import { fmtBaht2, custCode } from "../lib/format";
import { UIcon } from "../icons";
import DocSlip from "./DocSlip";

const fmtBaht = fmtBaht2; // receipts show 2 decimals
const METHODS = ["เงินสด", "โอนเงิน", "เช็ค", "บัตรเครดิต"];
const RSTATUS = { pending: { th: "รอชำระเงิน", cls: "b-amber" }, paid: { th: "ชำระเงินแล้ว", cls: "b-green" } };
function genNo() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `REC-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
const today = () => new Date().toISOString().slice(0, 10);

export default function Receipts({ role }) {
  const canEdit = ["admin", "sales", "exec", "finance"].includes(role);
  const [list, setList] = React.useState([]);
  const [invoices, setInvoices] = React.useState([]);
  const [companies, setCompanies] = React.useState({ vat: {}, novat: {} });
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [ed, setEd] = React.useState(null);
  const [printR, setPrintR] = React.useState(null);
  const [search, setSearch] = React.useState("");

  async function load() {
    setLoading(true);
    try { const [rc, iv, co] = await Promise.all([listReceipts(), listInvoices(), getCompanies()]); setList(rc); setInvoices(iv); setCompanies(co || { vat: {}, novat: {} }); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  React.useEffect(() => { if (!printR) return; const t = setTimeout(() => { window.print(); setPrintR(null); }, 80); return () => clearTimeout(t); }, [printR]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }

  const openInvoices = invoices.filter((x) => x.status === "unpaid" && !x.hasReceipt);
  const invByNo = React.useMemo(() => Object.fromEntries(invoices.map((x) => [x.invoice_no, x])), [invoices]);

  function startNew() { setEd({ receipt_no: genNo(), invoice_no: "", issue_date: today(), payment_method: METHODS[1], status: "paid", note: "" }); }
  async function markPaid(x) { try { await setReceiptStatus(x.receipt_no, "paid", x.invoice_no); flash("รับเงินแล้ว ✓"); await load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); } }
  const setF = (k, v) => setEd((e) => ({ ...e, [k]: v }));
  const selInv = ed?.invoice_no ? invByNo[ed.invoice_no] : null;
  const net = selInv ? (Number(selInv.total) || 0) - (Number(selInv.wht_amt) || 0) : 0;

  async function save() {
    if (!selInv) return flash("เลือกใบแจ้งหนี้ก่อน", true);
    const r = {
      receipt_no: ed.receipt_no, invoice_no: selInv.invoice_no, quote_no: selInv.quote_no || null, boq_no: selInv.boq_no || null, job_no: null,
      customer_id: selInv.customer_id || null, site_id: selInv.site_id || null, issue_date: ed.issue_date || null, payment_method: ed.payment_method || null,
      base: selInv.base, vat_amt: selInv.vat_amt, total: selInv.total, wht_amt: selInv.wht_amt, net, status: ed.status || "paid",
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
              <select className="inp" value={ed.invoice_no} onChange={(e) => setF("invoice_no", e.target.value)}>
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
              {selInv.wht_amt > 0 && <div><span>หัก ณ ที่จ่าย</span><b style={{ color: "var(--down)" }}>− {fmtBaht(selInv.wht_amt)}</b></div>}
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
            <div className="fld" />
          </div>
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
  const shown = list.filter((x) => !ql || x.receipt_no.toLowerCase().includes(ql) || (x.customerName || "").toLowerCase().includes(ql) || (x.quote_no || "").toLowerCase().includes(ql) || (x.job_no || "").toLowerCase().includes(ql));
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
      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && shown.length === 0 && <div className="empty">{list.length === 0 ? "ยังไม่มีใบเสร็จ" : "ไม่พบใบเสร็จ"}</div>}
      <div className="job-cards">
        {shown.map((x) => {
          const st = RSTATUS[x.status] || RSTATUS.paid;
          return (
          <div className={"card job-card" + (x.status === "paid" ? " closed" : "")} key={x.receipt_no}>
            <div className="job-card-head" style={{ cursor: "default" }}>
              <div className="job-card-id"><span className="job-no">{x.receipt_no}</span><span className={"job-badge " + st.cls}>{st.th}</span></div>
              <div className="job-card-meta">{x.customerName || "-"} · อ้างอิง {x.invoice_no || "-"}{x.quote_no ? ` · ${x.quote_no}` : ""}{x.boq_no ? ` · BOQ ${x.boq_no}` : ""}{x.job_no ? ` · งาน ${x.job_no}` : ""}</div>
              <div className="job-card-cost"><span>ยอดรับสุทธิ</span><b>{fmtBaht(x.net)}</b></div>
            </div>
            <div className="job-lines"><div className="job-actions">
              {canEdit && x.status === "pending" && <button className="btn-primary sm" onClick={() => markPaid(x)}><UIcon name="check" size={14} color="#fff" strokeWidth={2.4} /> รับเงินแล้ว</button>}
              <button className="btn-ghost sm" onClick={() => setPrintR(x)}><UIcon name="catalog" size={14} /> พิมพ์</button>
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
        return (
        <DocSlip company={co} titleTh={baseTitle} titleEn={isVat ? "RECEIPT / TAX INVOICE" : "RECEIPT"} docNo={printR.receipt_no}
          metaRows={[{ label: "วันที่", value: printR.issue_date }, { label: "อ้างอิงใบแจ้งหนี้", value: printR.invoice_no }, { label: "อ้างอิงใบเสนอ", value: printR.quote_no }, { label: "อ้างอิง BOQ", value: printR.boq_no }, { label: "อ้างอิงใบงาน", value: printR.job_no }]}
          customer={{ name: printR.customerName, code: custCode(printR.customerCode), taxId: printR.customerTaxId, address: printR.siteAddress || printR.customerAddr, contactName: printR.contactName, contactPhone: printR.contactPhone }}
          terms={printR.note} bank={co.bank_info} signLabels={["ผู้รับเงิน", "ผู้จ่ายเงิน"]}
          paymentInfo={paid ? `ได้รับชำระเงินแล้ว · วันที่ ${printR.issue_date || "-"} · โดย ${printR.payment_method || "-"} · จำนวน ${fmtBaht(printR.net)}` : null}>
          <table className="doc-table">
            <thead><tr><th>#</th><th>รายการ</th><th className="r">จำนวนเงิน</th></tr></thead>
            <tbody><tr><td>1</td><td>รับชำระตามใบแจ้งหนี้ {printR.invoice_no}{printR.quote_no ? ` (ใบเสนอ ${printR.quote_no})` : ""}</td><td className="r">{fmtBaht(printR.base)}</td></tr></tbody>
          </table>
          <div className="doc-totals">
            <div><span>มูลค่า</span><b>{fmtBaht(printR.base)}</b></div>
            {printR.vat_amt > 0 && <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht(printR.vat_amt)}</b></div>}
            <div className="doc-grand"><span>รวมเป็นเงิน</span><b>{fmtBaht(printR.total)}</b></div>
            {printR.wht_amt > 0 && <div><span>หัก ณ ที่จ่าย</span><b>− {fmtBaht(printR.wht_amt)}</b></div>}
            <div className="doc-grand"><span>รับเงินสุทธิ</span><b>{fmtBaht(printR.net)}</b></div>
          </div>
        </DocSlip>
      ); })()}
      {toast && <Toast t={toast} />}
    </div>
  );
}

function Toast({ t }) {
  return <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: t.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center" }}>{t.m}</div>;
}
