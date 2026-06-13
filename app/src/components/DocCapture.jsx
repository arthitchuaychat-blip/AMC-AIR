import React from "react";
import DocSlip from "./DocSlip";
import { listQuotations, listInvoices, listReceipts, getCompanies } from "../lib/api";
import { fmtBaht, fmtBaht2, custCode } from "../lib/format";

// Renders a single document (quotation/invoice/receipt) off-screen at A4 size so it can be captured
// to an image/PDF and sent — WITHOUT navigating to the document page. Calls onReady(node) when painted.
export default function DocCapture({ type, no, onReady, onError }) {
  const [data, setData] = React.useState(null);
  const ref = React.useRef(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const companies = await getCompanies();
        if (type === "quote") {
          const q = (await listQuotations()).find((x) => x.quote_no === no);
          if (!q) throw new Error("ไม่พบใบเสนอราคา " + no);
          alive && setData({ companies, q });
        } else if (type === "invoice") {
          const [iv, qs] = await Promise.all([listInvoices(), listQuotations()]);
          const x = iv.find((r) => r.invoice_no === no); if (!x) throw new Error("ไม่พบใบแจ้งหนี้ " + no);
          alive && setData({ companies, x, q: qs.find((r) => r.quote_no === x.quote_no) });
        } else if (type === "receipt") {
          const [rc, iv, qs] = await Promise.all([listReceipts(), listInvoices(), listQuotations()]);
          const x = rc.find((r) => r.receipt_no === no); if (!x) throw new Error("ไม่พบใบเสร็จ " + no);
          alive && setData({ companies, x, inv: iv.find((r) => r.invoice_no === x.invoice_no), q: qs.find((r) => r.quote_no === x.quote_no) });
        } else throw new Error("ชนิดเอกสารไม่รองรับ");
      } catch (e) { onError && onError(e.message || String(e)); }
    })();
    return () => { alive = false; };
  }, [type, no]);

  React.useEffect(() => {
    if (!data) return;
    let cancel = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 80));
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }
      const node = ref.current; if (!node || cancel) return;
      await Promise.all([...node.querySelectorAll("img")].map((im) => im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; })));
      if (!cancel) onReady && onReady(node);
    })();
    return () => { cancel = true; };
  }, [data]);

  if (!data) return null;
  return <div className="doc-capture-wrap" ref={ref}>{slip(type, data)}</div>;
}

function slip(type, d) {
  if (type === "quote") return quoteSlip(d.q, d.companies);
  if (type === "invoice") return invoiceSlip(d.x, d.q, d.companies);
  return receiptSlip(d.x, d.q, d.inv, d.companies);
}

function quoteSlip(q, companies) {
  const co = q.vat ? companies.vat : companies.novat;
  return (
    <DocSlip company={co} titleTh="ใบเสนอราคา" titleEn="QUOTATION" docNo={q.quote_no}
      metaRows={[{ label: "วันที่", value: q.issue_date }, { label: "ยืนราคาถึง", value: q.valid_until }, { label: "อ้างอิง BOQ", value: q.boq_no }]}
      projectTitle={q.title}
      customer={{ name: q.customerName, code: custCode(q.customerCode), taxId: q.customerTaxId, address: q.siteAddress || q.customerAddr, contactName: q.contactName, contactPhone: q.contactPhone, mapUrl: q.map_url }}
      terms={q.note || co.default_terms} bank={co.bank_info} signLabels={["ผู้เสนอราคา", "ผู้อนุมัติ / ลูกค้า"]}>
      <table className="doc-table">
        <thead><tr><th>#</th><th>รหัส</th><th>รายการ</th><th className="r">จำนวน</th><th className="r">หน่วยละ</th><th className="r">จำนวนเงิน</th></tr></thead>
        <tbody>{q.items.map((it, i) => (
          <tr key={i}><td>{i + 1}</td><td>{it.item_code || "-"}</td><td>{it.name}{it.description ? <div className="doc-item-desc">{it.description}</div> : null}</td><td className="r">{it.qty} {it.unit || ""}</td><td className="r">{fmtBaht(it.unit_price)}</td><td className="r">{fmtBaht(it.qty * it.unit_price)}</td></tr>
        ))}</tbody>
      </table>
      <div className="doc-totals">
        <div><span>รวมเป็นเงิน</span><b>{fmtBaht(q.subtotal)}</b></div>
        {q.discount > 0 && <div><span>ส่วนลด</span><b>− {fmtBaht(q.discount)}</b></div>}
        {q.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht(q.vatAmt)}</b></div> : null}
        <div className="doc-grand"><span>รวมทั้งสิ้น</span><b>{fmtBaht(q.grand)}</b></div>
        {q.wht ? <div><span>หัก ณ ที่จ่าย {Number(q.wht_rate) || 3}%</span><b>− {fmtBaht(q.whtAmt)}</b></div> : null}
        {q.wht ? <div className="doc-grand"><span>ยอดชำระสุทธิ</span><b>{fmtBaht(q.netPay)}</b></div> : null}
      </div>
    </DocSlip>
  );
}

function invoiceSlip(x, q, companies) {
  const co = (q ? q.vat : true) ? companies.vat : companies.novat;
  return (
    <DocSlip company={co} titleTh="ใบแจ้งหนี้" titleEn="INVOICE" docNo={x.invoice_no}
      metaRows={[{ label: "วันที่", value: x.issue_date }, { label: "ครบกำหนด", value: x.due_date }, { label: "อ้างอิงใบเสนอ", value: x.quote_no }, { label: "อ้างอิง BOQ", value: x.boq_no }, { label: "งวดที่", value: `${x.installment} (${Math.round(x.pct)}%)` }]}
      projectTitle={x.title}
      customer={{ name: x.customerName, code: custCode(x.customerCode), taxId: x.customerTaxId, address: x.siteAddress || x.customerAddr, contactName: x.contactName, contactPhone: x.contactPhone, mapUrl: x.mapUrl }}
      terms={x.note || co.default_terms} bank={co.bank_info} signLabels={["ผู้วางบิล", "ผู้รับวางบิล"]}>
      <table className="doc-table">
        <thead><tr><th>#</th><th>รหัส</th><th>รายการ</th><th className="r">จำนวน</th><th className="r">หน่วยละ</th><th className="r">จำนวนเงิน</th></tr></thead>
        <tbody>{(q?.items || []).map((it, i) => (
          <tr key={i}><td>{i + 1}</td><td>{it.item_code || "-"}</td><td>{it.name}{it.description ? <div className="doc-item-desc">{it.description}</div> : null}</td><td className="r">{Number(it.qty)} {it.unit || ""}</td><td className="r">{fmtBaht2(it.unit_price)}</td><td className="r">{fmtBaht2(Number(it.qty) * Number(it.unit_price))}</td></tr>
        ))}</tbody>
      </table>
      <div className="doc-totals">
        <div><span>รวมเป็นเงิน</span><b>{fmtBaht2(q?.subtotal || 0)}</b></div>
        {q?.discount > 0 && <div><span>ส่วนลด</span><b>− {fmtBaht2(q.discount)}</b></div>}
        {q?.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht2(q.vatAmt)}</b></div> : null}
        <div className="doc-grand"><span>รวมทั้งสิ้น (เต็มสัญญา)</span><b>{fmtBaht2(q?.grand || 0)}</b></div>
        <div style={{ marginTop: 4 }}><span>งวดที่ {x.installment} ({Math.round(x.pct)}%)</span><b /></div>
        <div className="doc-grand"><span>ยอดชำระงวดนี้</span><b>{fmtBaht2(x.total)}</b></div>
        {x.wht_amt > 0 && <div><span>หัก ณ ที่จ่าย (ตอนชำระ)</span><b>− {fmtBaht2(x.wht_amt)}</b></div>}
        {x.wht_amt > 0 && <div className="doc-grand"><span>ยอดรับสุทธิงวดนี้</span><b>{fmtBaht2(x.total - x.wht_amt)}</b></div>}
      </div>
    </DocSlip>
  );
}

function receiptSlip(x, q, inv, companies) {
  const isVat = inv ? (inv.vat_amt > 0) : (x.vat_amt > 0);
  const co = isVat ? companies.vat : companies.novat;
  const paid = x.status === "paid";
  return (
    <DocSlip company={co} titleTh={isVat ? "ใบเสร็จรับเงิน/ใบกำกับภาษี" : "ใบเสร็จรับเงิน"} titleEn={isVat ? "RECEIPT / TAX INVOICE" : "RECEIPT"} docNo={x.receipt_no}
      metaRows={[{ label: "วันที่", value: x.issue_date }, { label: "อ้างอิงใบแจ้งหนี้", value: x.invoice_no }, { label: "อ้างอิงใบเสนอ", value: x.quote_no }, { label: "อ้างอิง BOQ", value: x.boq_no }, { label: "อ้างอิงใบงาน", value: x.job_no }]}
      projectTitle={x.title}
      customer={{ name: x.customerName, code: custCode(x.customerCode), taxId: x.customerTaxId, address: x.siteAddress || x.customerAddr, contactName: x.contactName, contactPhone: x.contactPhone, mapUrl: x.mapUrl }}
      terms={x.note} bank={co.bank_info} signLabels={["ผู้รับเงิน", "ผู้จ่ายเงิน"]}
      paymentInfo={paid ? `ได้รับชำระเงินแล้ว · วันที่ ${x.issue_date || "-"} · โดย ${x.payment_method || "-"} · จำนวน ${fmtBaht2(x.net)}` : null}>
      <table className="doc-table">
        <thead><tr><th>#</th><th>รหัส</th><th>รายการ</th><th className="r">จำนวน</th><th className="r">หน่วยละ</th><th className="r">จำนวนเงิน</th></tr></thead>
        <tbody>{(q?.items || []).map((it, i) => (
          <tr key={i}><td>{i + 1}</td><td>{it.item_code || "-"}</td><td>{it.name}{it.description ? <div className="doc-item-desc">{it.description}</div> : null}</td><td className="r">{Number(it.qty)} {it.unit || ""}</td><td className="r">{fmtBaht2(it.unit_price)}</td><td className="r">{fmtBaht2(Number(it.qty) * Number(it.unit_price))}</td></tr>
        ))}</tbody>
      </table>
      <div className="doc-totals">
        <div><span>รวมเป็นเงิน</span><b>{fmtBaht2(q?.subtotal || 0)}</b></div>
        {q?.discount > 0 && <div><span>ส่วนลด</span><b>− {fmtBaht2(q.discount)}</b></div>}
        {q?.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht2(q.vatAmt)}</b></div> : null}
        <div className="doc-grand"><span>รวมทั้งสิ้น (เต็มสัญญา)</span><b>{fmtBaht2(q?.grand || 0)}</b></div>
        <div style={{ marginTop: 4 }}><span>รับชำระตามใบแจ้งหนี้ {x.invoice_no}{inv ? ` · งวดที่ ${inv.installment} (${Math.round(inv.pct)}%)` : ""}</span><b /></div>
        <div className="doc-grand"><span>รวมเป็นเงินงวดนี้</span><b>{fmtBaht2(x.total)}</b></div>
        {x.wht_amt > 0 && <div><span>หัก ณ ที่จ่าย {Number(x.wht_rate) || 3}%</span><b>− {fmtBaht2(x.wht_amt)}</b></div>}
        <div className="doc-grand"><span>รับเงินสุทธิ</span><b>{fmtBaht2(x.net)}</b></div>
      </div>
    </DocSlip>
  );
}
