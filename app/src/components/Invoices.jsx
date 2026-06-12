import React from "react";
import { listInvoices, listQuotations, saveInvoice, deleteInvoice, setInvoiceStatus, getCompanies, billedByQuote } from "../lib/api";
import { fmtBaht, custCode } from "../lib/format";
import { UIcon } from "../icons";
import DocSlip from "./DocSlip";

const STATUS = { unpaid: { th: "ค้างชำระ", cls: "open" }, paid: { th: "ชำระแล้ว", cls: "closed" }, cancelled: { th: "ยกเลิก", cls: "closed" } };
function genNo() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `INV-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }
const today = () => new Date().toISOString().slice(0, 10);

export default function Invoices({ role }) {
  const canEdit = ["admin", "sales", "exec", "finance"].includes(role);
  const [list, setList] = React.useState([]);
  const [quotes, setQuotes] = React.useState([]);
  const [companies, setCompanies] = React.useState({ vat: {}, novat: {} });
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [ed, setEd] = React.useState(null);
  const [printI, setPrintI] = React.useState(null);
  const [search, setSearch] = React.useState("");

  async function load() {
    setLoading(true);
    try { const [iv, q, co] = await Promise.all([listInvoices(), listQuotations(), getCompanies()]); setList(iv); setQuotes(q); setCompanies(co || { vat: {}, novat: {} }); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  React.useEffect(() => { if (!printI) return; const t = setTimeout(() => { window.print(); setPrintI(null); }, 80); return () => clearTimeout(t); }, [printI]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }

  const billed = React.useMemo(() => billedByQuote(list), [list]);
  const approvedQuotes = quotes.filter((q) => q.status === "approved");
  const quoteByNo = React.useMemo(() => Object.fromEntries(quotes.map((q) => [q.quote_no, q])), [quotes]);

  function startNew() {
    setEd({ invoice_no: genNo(), quote_no: "", issue_date: today(), due_date: "", basis: "percent", basis_value: 100, note: "" });
  }
  const setF = (k, v) => setEd((e) => ({ ...e, [k]: v }));
  const selQ = ed?.quote_no ? quoteByNo[ed.quote_no] : null;
  const remaining = selQ ? Math.max(0, (selQ.grand || 0) - (billed[selQ.quote_no] || 0)) : 0;
  const newTotal = (() => {
    if (!selQ) return 0;
    const v = Number(ed.basis_value) || 0;
    const t = ed.basis === "percent" ? (selQ.grand || 0) * v / 100 : v;
    return Math.min(t, remaining + 0.5);
  })();

  async function save() {
    if (!selQ) return flash("เลือกใบเสนอราคาก่อน", true);
    if (newTotal <= 0) return flash("ยอดงวดต้องมากกว่า 0", true);
    if (newTotal > remaining + 0.5) return flash("ยอดงวดเกินยอดคงเหลือ", true);
    const f = selQ.grand > 0 ? newTotal / selQ.grand : 0;
    const installment = list.filter((x) => x.quote_no === selQ.quote_no && x.status !== "cancelled").length + 1;
    const inv = {
      invoice_no: ed.invoice_no, quote_no: selQ.quote_no, boq_no: selQ.boq_no || null,
      customer_id: selQ.customer_id || null, site_id: selQ.site_id || null,
      issue_date: ed.issue_date || null, due_date: ed.due_date || null, installment, pct: f * 100,
      base: (selQ.afterDisc || 0) * f, vat_amt: (selQ.vatAmt || 0) * f, total: newTotal, wht_amt: (selQ.whtAmt || 0) * f,
      note: ed.note, status: "unpaid",
    };
    try { await saveInvoice(inv); flash(`สร้างใบแจ้งหนี้งวดที่ ${installment} แล้ว`); setEd(null); await load(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(x) { if (!window.confirm(`ลบใบแจ้งหนี้ ${x.invoice_no}?`)) return; try { await deleteInvoice(x.invoice_no); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }
  async function cancel(x) { if (!window.confirm(`ยกเลิกใบแจ้งหนี้ ${x.invoice_no}? (ยอดจะคืนกลับไปคงเหลือ)`)) return; try { await setInvoiceStatus(x.invoice_no, "cancelled"); flash("ยกเลิกแล้ว"); await load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); } }

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
              <select className="inp" value={ed.quote_no} onChange={(e) => setF("quote_no", e.target.value)}>
                <option value="">— เลือกใบเสนอราคา —</option>
                {approvedQuotes.map((q) => <option key={q.quote_no} value={q.quote_no}>{q.quote_no} · {q.customerName || "-"} ({fmtBaht(q.grand)})</option>)}
              </select>
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
                <select className="inp" style={{ width: 110, flex: "none" }} value={ed.basis} onChange={(e) => setF("basis", e.target.value)}>
                  <option value="percent">เป็น %</option><option value="amount">เป็นบาท</option>
                </select>
                <input className="inp" type="number" min="0" step="0.01" value={ed.basis_value} onChange={(e) => setF("basis_value", Number(e.target.value) || 0)} />
                <button className="btn-ghost sm" onClick={() => setF("basis_value", ed.basis === "percent" ? 100 : remaining)} disabled={!selQ}>ยอดคงเหลือ</button>
              </div>
            </label>
            <div className="fld"><span>ยอดงวดนี้ (รวม VAT)</span><div className="inv-total">{fmtBaht(newTotal)}</div></div>
          </div>
          <label className="fld"><span>หมายเหตุ</span><input className="inp" value={ed.note} onChange={(e) => setF("note", e.target.value)} placeholder="(ไม่บังคับ)" /></label>

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
  const ql = search.trim().toLowerCase();
  const shown = list.filter((x) => !ql || x.invoice_no.toLowerCase().includes(ql) || (x.customerName || "").toLowerCase().includes(ql) || (x.quote_no || "").toLowerCase().includes(ql) || (x.contactPhone || "").includes(search.trim()));
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
      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && shown.length === 0 && <div className="empty">{list.length === 0 ? "ยังไม่มีใบแจ้งหนี้" : "ไม่พบใบแจ้งหนี้"}</div>}
      <div className="job-cards">
        {shown.map((x) => {
          const st = STATUS[x.status] || STATUS.unpaid;
          const q = quoteByNo[x.quote_no];
          const grand = q?.grand || 0; const bl = billed[x.quote_no] || 0;
          return (
            <div className={"card job-card" + (x.status !== "unpaid" ? " closed" : "")} key={x.invoice_no}>
              <div className="job-card-head" style={{ cursor: "default" }}>
                <div className="job-card-id"><span className="job-no">{x.invoice_no}</span><span className={"job-badge " + st.cls}>{st.th}</span></div>
                <div className="job-card-meta">งวดที่ {x.installment} ({Math.round(x.pct)}%) · {x.customerName || "-"} · อ้างอิง {x.quote_no || "-"}{x.boq_no ? ` · BOQ ${x.boq_no}` : ""}</div>
                <div className="job-card-cost"><span>ยอดงวดนี้</span><b>{fmtBaht(x.total)}</b></div>
              </div>
              {grand > 0 && <div className="inv-progress"><div className="inv-bar"><div style={{ width: Math.min(100, bl / grand * 100) + "%" }} /></div><span>วางบิลรวม {fmtBaht(bl)} / {fmtBaht(grand)}{bl >= grand - 0.5 ? " · ครบ 100% ✓" : ""}</span></div>}
              <div className="job-lines"><div className="job-actions">
                <button className="btn-ghost sm" onClick={() => setPrintI(x)}><UIcon name="catalog" size={14} /> พิมพ์</button>
                {canEdit && x.status === "unpaid" && <button className="btn-ghost sm" onClick={() => cancel(x)}>ยกเลิก</button>}
                {canEdit && <button className="btn-ghost sm danger" onClick={() => del(x)}><UIcon name="trash" size={14} /></button>}
              </div></div>
            </div>
          );
        })}
      </div>

      {printI && (() => { const q = quoteByNo[printI.quote_no]; const co = (q ? q.vat : true) ? companies.vat : companies.novat; return (
        <DocSlip company={co} titleTh="ใบแจ้งหนี้" titleEn="INVOICE" docNo={printI.invoice_no}
          metaRows={[{ label: "วันที่", value: printI.issue_date }, { label: "ครบกำหนด", value: printI.due_date }, { label: "อ้างอิงใบเสนอ", value: printI.quote_no }, { label: "อ้างอิง BOQ", value: printI.boq_no }, { label: "งวดที่", value: `${printI.installment} (${Math.round(printI.pct)}%)` }]}
          customer={{ name: printI.customerName, code: custCode(printI.customerCode), taxId: printI.customerTaxId, address: printI.siteAddress || printI.customerAddr, contactName: printI.contactName, contactPhone: printI.contactPhone }}
          terms={printI.note || co.default_terms} bank={co.bank_info} signLabels={["ผู้วางบิล", "ผู้รับวางบิล"]}>
          <table className="doc-table">
            <thead><tr><th>#</th><th>รายการ</th><th className="r">จำนวนเงิน</th></tr></thead>
            <tbody><tr><td>1</td><td>ตามใบเสนอราคา {printI.quote_no} — งวดที่ {printI.installment} ({Math.round(printI.pct)}%)</td><td className="r">{fmtBaht(printI.base)}</td></tr></tbody>
          </table>
          <div className="doc-totals">
            <div><span>มูลค่า</span><b>{fmtBaht(printI.base)}</b></div>
            {printI.vat_amt > 0 && <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht(printI.vat_amt)}</b></div>}
            <div className="doc-grand"><span>ยอดชำระงวดนี้</span><b>{fmtBaht(printI.total)}</b></div>
            {printI.wht_amt > 0 && <div><span>หัก ณ ที่จ่าย (ตอนชำระ)</span><b>− {fmtBaht(printI.wht_amt)}</b></div>}
            {printI.wht_amt > 0 && <div className="doc-grand"><span>ยอดรับสุทธิ</span><b>{fmtBaht(printI.total - printI.wht_amt)}</b></div>}
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
