import React from "react";
import { listBillingNotes, saveBillingNote, setBillingNoteStatus, deleteBillingNote, listInvoices, listCustomers, getCompanies } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { fmtBaht, custCode } from "../lib/format";
import { can } from "../lib/permissions";
import { UIcon } from "../icons";
import DocSlip from "./DocSlip";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";
import ChatCustomerLink from "./ChatCustomerLink";

const today = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const genNo = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `BN-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };

export default function BillingNotes({ role, onOpenDoc, onCreateReceipt, onGoChat }) {
  const canEdit = can(role, "billing", "edit");
  const canDelete = role === "admin";
  const [list, setList] = React.useState([]);
  const [invoices, setInvoices] = React.useState([]);
  const [custs, setCusts] = React.useState([]);
  const [companies, setCompanies] = React.useState({ vat: {}, novat: {} });
  const [loading, setLoading] = React.useState(true);
  const [ed, setEd] = React.useState(null);     // create modal
  const [openInv, setOpenInv] = React.useState(null); // billing_no whose invoices are expanded
  const [printB, setPrintB] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };
  const printWin = React.useRef(null);

  async function load() {
    setLoading(true);
    try { const [bn, iv, cu, co] = await Promise.all([listBillingNotes(), listInvoices(), listCustomers(), getCompanies()]); setList(bn); setInvoices(iv); setCusts(cu); setCompanies(co || { vat: {}, novat: {} }); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  React.useEffect(() => { if (!printB) return; const t = setTimeout(() => { writeAndPrint(printWin.current); printWin.current = null; setPrintB(null); }, 120); return () => clearTimeout(t); }, [printB]);

  async function cancel(b) { if (!await confirmDialog(`ยกเลิกใบวางบิล ${b.billing_no}? (เก็บประวัติไว้)`)) return; try { await setBillingNoteStatus(b.billing_no, "cancelled"); flash("ยกเลิกแล้ว"); await load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); } }
  async function del(b) { if (!await confirmDialog(`ลบถาวรใบวางบิล ${b.billing_no}? (กู้คืนไม่ได้)`)) return; try { await deleteBillingNote(b.billing_no); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }

  if (loading) return <div className="adm"><div className="empty">กำลังโหลด…</div></div>;

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ใบวางบิล <span className="page-title-en">Billing Notes</span></h1>
          <p className="page-sub">รวมใบแจ้งหนี้ค้างชำระของลูกค้ารายเดียวกัน → ส่งวางบิล → ออกใบเสร็จต่อทีละใบแจ้งหนี้</p></div>
        {canEdit && <button className="btn-primary" onClick={() => setEd({ billing_no: genNo(), customer_id: "", issue_date: today(), note: "", sel: {} })}><UIcon name="plus" size={16} color="#fff" /> สร้างใบวางบิล</button>}
      </div>

      {list.length === 0 && <div className="empty">ยังไม่มีใบวางบิล</div>}
      <div className="job-cards">
        {list.map((b) => (
          <div className={"card job-card" + (b.status === "cancelled" ? " closed" : "")} key={b.billing_no}>
            <div className="job-card-head">
              <div className="job-card-id"><span className="job-no">{b.billing_no}</span>
                {b.status === "cancelled" ? <span className="job-badge b-red">ยกเลิกแล้ว</span> : <span className="job-badge b-blue">วางบิล</span>}</div>
              <div className="job-card-meta inv-meta">
                <span className="inv-cust">{b.customerName || "-"} · {custCode(b.customerCode)}</span>
                <span className="inv-period">{b.invoices.length} ใบแจ้งหนี้{b.missing ? ` · (${b.missing} ใบถูกลบ)` : ""}</span>
                <span className="inv-period">{b.issue_date || ""}</span>
              </div>
              <div className="job-card-cost"><span>ยอดวางบิลรวม</span><b>{fmtBaht(b.total)}</b></div>
            </div>
            <div className="job-lines"><div className="job-actions">
              <ChatCustomerLink role={role} customerId={b.customer_id} onGoChat={onGoChat} />
              <button className="btn-ghost sm" onClick={() => setOpenInv(openInv === b.billing_no ? null : b.billing_no)}><UIcon name="clipboard" size={14} /> {openInv === b.billing_no ? "ซ่อนรายการ" : "ดูใบแจ้งหนี้ / ออกใบเสร็จ"}</button>
              <button className="btn-ghost sm" onClick={() => { printWin.current = openPrintWindow(); setPrintB(b); }}><UIcon name="catalog" size={14} /> พิมพ์</button>
              {canEdit && b.status !== "cancelled" && <button className="btn-ghost sm" onClick={() => cancel(b)}>ยกเลิก</button>}
              {canDelete && <button className="btn-ghost sm danger" title="ลบถาวร (ธุรการ)" onClick={() => del(b)}><UIcon name="trash" size={14} /></button>}
            </div></div>
            {openInv === b.billing_no && (
              <div className="bn-invlist">
                {b.invoices.map((iv) => (
                  <div className="bn-invrow" key={iv.invoice_no}>
                    <button className="sub-job-link" onClick={() => onOpenDoc && onOpenDoc("invoice", iv.invoice_no)}>{iv.invoice_no}</button>
                    <span className="jo-dim">งวดที่ {iv.installment} · {Math.round(iv.pct)}%</span>
                    <span className={"job-badge " + (iv.status === "paid" ? "b-green" : iv.status === "cancelled" ? "b-red" : "b-amber")}>{iv.status === "paid" ? "จ่ายแล้ว" : iv.status === "cancelled" ? "ยกเลิก" : "ค้างชำระ"}</span>
                    <b style={{ flex: 1, textAlign: "right" }}>{fmtBaht(iv.total)}</b>
                    {canEdit && iv.status === "unpaid" && onCreateReceipt && <button className="btn-primary sm" onClick={() => onCreateReceipt(iv.invoice_no)}><UIcon name="clipboard" size={13} color="#fff" /> ออกใบเสร็จ</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {ed && <CreateModal ed={ed} setEd={setEd} custs={custs} invoices={invoices} onSaved={() => { setEd(null); load(); }} flash={flash} />}

      {/* off-screen print area */}
      {printB && (() => {
        const co = companies.novat && Object.keys(companies.novat).length ? companies.novat : (companies.vat || {});
        return (
          <DocSlip company={co} titleTh="ใบวางบิล / ใบแจ้งหนี้รวม" titleEn="BILLING NOTE" docNo={printB.billing_no}
            metaRows={[{ label: "วันที่", value: printB.issue_date }, { label: "จำนวนใบแจ้งหนี้", value: String(printB.invoices.length) }]}
            customer={{ name: printB.customerName, code: custCode(printB.customerCode), taxId: printB.customerTaxId, address: printB.siteAddress || printB.customerAddr, contactName: printB.contactName, contactPhone: printB.contactPhone, mapUrl: printB.mapUrl }}
            terms={printB.note} bank={co.bank_info} signLabels={["ผู้วางบิล", "ผู้รับวางบิล"]}
            totals={<div className="doc-totals"><div className="doc-grand"><span>ยอดวางบิลรวมทั้งสิ้น</span><b>{fmtBaht(printB.total)}</b></div></div>}>
            {printB.invoices.map((iv, i) => (
              <tr key={iv.invoice_no}><td>{i + 1}</td><td>{iv.invoice_no}</td><td>ใบแจ้งหนี้ · งวดที่ {iv.installment} ({Math.round(iv.pct)}%){iv.issue_date ? ` · ${iv.issue_date}` : ""}</td><td className="r" /><td className="r" /><td className="r">{fmtBaht(iv.total)}</td></tr>
            ))}
          </DocSlip>
        );
      })()}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

function CreateModal({ ed, setEd, custs, invoices, onSaved, flash }) {
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setEd((e) => ({ ...e, [k]: v }));
  // unpaid invoices for the chosen customer (and not already cancelled)
  const custInv = ed.customer_id ? invoices.filter((x) => String(x.customer_id) === String(ed.customer_id) && x.status === "unpaid") : [];
  const chosen = custInv.filter((x) => ed.sel[x.invoice_no]);
  const total = chosen.reduce((a, x) => a + (Number(x.total) || 0), 0);
  async function save() {
    if (!ed.customer_id) return flash("เลือกลูกค้าก่อน", true);
    if (!chosen.length) return flash("เลือกใบแจ้งหนี้อย่างน้อย 1 ใบ", true);
    setBusy(true);
    try { await saveBillingNote({ billing_no: ed.billing_no, customer_id: ed.customer_id, site_id: chosen[0]?.site_id || null, issue_date: ed.issue_date, note: ed.note, invoice_nos: chosen.map((x) => x.invoice_no), status: "open" }); flash("สร้างใบวางบิลแล้ว ✓"); onSaved(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={() => setEd(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <div className="modal-head"><div className="modal-title">สร้างใบวางบิล · {ed.billing_no}</div>
          <button className="modal-x" onClick={() => setEd(null)}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="fld-row">
            <label className="fld"><span>ลูกค้า</span>
              <select className="inp" value={ed.customer_id} onChange={(e) => setEd((s) => ({ ...s, customer_id: e.target.value, sel: {} }))}>
                <option value="">— เลือกลูกค้า —</option>{custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <label className="fld"><span>วันที่วางบิล</span><input className="inp" type="date" value={ed.issue_date} onChange={(e) => set("issue_date", e.target.value)} /></label>
          </div>
          {ed.customer_id && (
            <div className="fld"><span>ใบแจ้งหนี้ค้างชำระ ({chosen.length}/{custInv.length} เลือก · รวม {fmtBaht(total)})</span>
              <div className="bn-picklist">
                {custInv.length === 0 && <div className="empty sm">ลูกค้ารายนี้ไม่มีใบแจ้งหนี้ค้างชำระ</div>}
                {custInv.map((x) => (
                  <label className="bn-pickrow" key={x.invoice_no}>
                    <input type="checkbox" checked={!!ed.sel[x.invoice_no]} onChange={(e) => setEd((s) => ({ ...s, sel: { ...s.sel, [x.invoice_no]: e.target.checked } }))} />
                    <span className="sub-pay-no">{x.invoice_no}</span>
                    <span className="jo-dim" style={{ flex: 1 }}>งวดที่ {x.installment} · {Math.round(x.pct)}%</span>
                    <b>{fmtBaht(x.total)}</b>
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="fld"><span>หมายเหตุ (ไม่บังคับ)</span><input className="inp" value={ed.note} onChange={(e) => set("note", e.target.value)} placeholder="เช่น กำหนดชำระภายใน 7 วัน" /></label>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={() => setEd(null)}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy || !chosen.length} onClick={save}>สร้างใบวางบิล</button></div>
      </div>
    </div>
  );
}
