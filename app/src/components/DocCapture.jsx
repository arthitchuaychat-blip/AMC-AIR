import React from "react";
import DocSlip from "./DocSlip";
import { listQuotations, listInvoices, listReceipts, listPurchaseOrders, listSuppliers, listMaterialsLite, listAdjustmentNotes, listBillingNotes, getCompanies } from "../lib/api";
import { fmtBaht, fmtBaht2, fmtNum, custCode, fmtDocDate } from "../lib/format";

// Renders a single document (quotation/invoice/receipt) off-screen at A4 size so it can be captured
// to an image/PDF and sent — WITHOUT navigating to the document page. Calls onReady(node) when painted.
//
// ⚠️ กติกาที่อยู่ในเอกสาร (เจ้าของกำหนด) — ต้องเหมือนหน้าพิมพ์เป๊ะ ๆ เพราะเป็นเอกสารใบเดียวกัน:
//   ช่อง 1 "ลูกค้า" = ที่อยู่หลักที่จดทะเบียนไว้ (customerAddr) เสมอ — ใช้ออกเอกสารบัญชี/ภาษี
//   ช่อง 2 "📍 หน้างาน" = ที่อยู่ไซต์งาน (siteAddress) — บอกว่าไปทำงานที่ไหน
//   ห้ามเขียน address: siteAddress || customerAddr เด็ดขาด (เคยเป็นแบบนั้น → ที่อยู่ไซต์ไปโผล่ช่องภาษี)
export default function DocCapture({ type, no, onReady, onError }) {
  const [data, setData] = React.useState(null);
  const ref = React.useRef(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const companies = await getCompanies();
        // ดึงเฉพาะใบที่ต้องใช้ ({ nos: [...] }) แล้วค่อยไล่ขึ้นไปหาใบแม่ — เดิมโหลดเอกสารทั้งบริษัท 3 ชุดเพื่อเอามาใบเดียว
        if (type === "quote") {
          const q = (await listQuotations({ nos: [no] })).find((x) => x.quote_no === no);
          if (!q) throw new Error("ไม่พบใบเสนอราคา " + no);
          alive && setData({ companies, q });
        } else if (type === "invoice") {
          const x = (await listInvoices({ nos: [no] })).find((r) => r.invoice_no === no);
          if (!x) throw new Error("ไม่พบใบแจ้งหนี้ " + no);
          const qs = x.quote_no ? await listQuotations({ nos: [x.quote_no] }) : [];
          alive && setData({ companies, x, q: qs.find((r) => r.quote_no === x.quote_no) });
        } else if (type === "receipt") {
          const x = (await listReceipts({ nos: [no] })).find((r) => r.receipt_no === no);
          if (!x) throw new Error("ไม่พบใบเสร็จ " + no);
          const [iv, qs] = await Promise.all([
            x.invoice_no ? listInvoices({ nos: [x.invoice_no] }) : [],
            x.quote_no ? listQuotations({ nos: [x.quote_no] }) : [],
          ]);
          alive && setData({ companies, x, inv: iv.find((r) => r.invoice_no === x.invoice_no), q: qs.find((r) => r.quote_no === x.quote_no) });
        } else if (type === "po") {
          // ใบสั่งซื้อ — ส่งเข้าแชตซัพพลายเออร์ (โครงเดียวกับหน้าพิมพ์ในเมนูใบสั่งซื้อ)
          const [pos, sups, mats] = await Promise.all([listPurchaseOrders(), listSuppliers().catch(() => []), listMaterialsLite()]);
          const x = pos.find((r) => r.po_no === no); if (!x) throw new Error("ไม่พบใบสั่งซื้อ " + no);
          alive && setData({ companies, x, sup: sups.find((s) => (s.name || "").trim() === (x.supplier || "").trim()) || null, matMap: Object.fromEntries(mats.map((m) => [m.code, m])) });
        } else if (type === "creditnote" || type === "debitnote") {
          const x = (await listAdjustmentNotes()).find((r) => r.note_no === no);
          if (!x) throw new Error("ไม่พบเอกสาร " + no);
          alive && setData({ companies, x });
        } else if (type === "billing") {
          const x = (await listBillingNotes()).find((r) => r.billing_no === no);
          if (!x) throw new Error("ไม่พบใบวางบิล " + no);
          alive && setData({ companies, x });
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
  if (type === "po") return poSlip(d.x, d.sup, d.matMap, d.companies);
  if (type === "creditnote" || type === "debitnote") return noteSlip(d.x, d.companies);
  if (type === "billing") return billingSlip(d.x, d.companies);
  return receiptSlip(d.x, d.q, d.inv, d.companies);
}

// ใบวางบิล / ใบแจ้งหนี้รวม — mirror หน้าพิมพ์ใน BillingNotes.jsx
function billingSlip(x, companies) {
  const has = (c) => c && Object.keys(c).length;
  const co = x.vat ? (has(companies.vat) ? companies.vat : companies.novat || {}) : (has(companies.novat) ? companies.novat : companies.vat || {});
  const live = x.liveInvoices || (x.invoices || []).filter((iv) => iv.status !== "cancelled");
  return (
    <DocSlip company={co} titleTh="ใบวางบิล / ใบแจ้งหนี้รวม" titleEn="BILLING NOTE" docNo={x.billing_no}
      metaRows={[{ label: "วันที่", value: fmtDocDate(x.issue_date || x.created_at) }, { label: "จำนวนใบแจ้งหนี้", value: String(live.length) }]}
      customer={{ name: x.customerName, code: custCode(x.customerCode), taxId: x.customerTaxId, branch: x.customerBranch, address: x.customerAddr, contactName: x.mainContactName, contactPhone: x.mainContactPhone, siteName: x.siteName, siteAddress: x.siteAddress, siteContactName: x.siteContactName, siteContactPhone: x.siteContactPhone, mapUrl: x.mapUrl }}
      terms={x.note} bank={co.bank_info} signLabels={["ผู้วางบิล", "ผู้รับวางบิล"]} signUrl={x.sign_url} signName={x.sign_name}
      totals={<div className="doc-totals">
        {x.wht > 0 ? <>
          <div><span>ยอดวางบิลรวม</span><b>{fmtBaht(x.total)}</b></div>
          <div><span>หัก ณ ที่จ่าย</span><b>− {fmtBaht(x.wht)}</b></div>
          <div className="doc-grand"><span>ยอดสุทธิที่ต้องชำระ</span><b>{fmtBaht(x.net)}</b></div>
        </> : <div className="doc-grand"><span>ยอดวางบิลรวมทั้งสิ้น</span><b>{fmtBaht(x.total)}</b></div>}
      </div>}>
      {live.map((iv, i) => (
        <tr key={iv.invoice_no}><td>{i + 1}</td><td>{iv.invoice_no}</td><td>ใบแจ้งหนี้ · งวดที่ {iv.installment} ({Math.round(iv.pct)}%){iv.issue_date ? ` · ${iv.issue_date}` : ""}</td><td className="r" /><td className="r" /><td className="r">{fmtBaht(iv.total)}</td></tr>
      ))}
    </DocSlip>
  );
}

// ใบลดหนี้ / ใบเพิ่มหนี้ — รายการเป็นของตัวเอง (ที่ลด/เพิ่ม) · ต้องเหมือนหน้าพิมพ์ใน AdjustmentNotes
function noteSlip(x, companies) {
  const isCredit = x.kind !== "debit";
  const verb = isCredit ? "ลด" : "เพิ่ม";
  const co = x.is_vat ? companies.vat : companies.novat;
  const its = x.items || [];
  return (
    <DocSlip company={co} titleTh={isCredit ? "ใบลดหนี้" : "ใบเพิ่มหนี้"} titleEn={isCredit ? "CREDIT NOTE" : "DEBIT NOTE"} docNo={x.note_no}
      metaRows={[{ label: "วันที่", value: fmtDocDate(x.issue_date || x.created_at) }, { label: "อ้างอิงใบเสร็จ", value: x.receipt_no }, { label: "อ้างอิงใบแจ้งหนี้", value: x.invoice_no }, { label: "อ้างอิงใบเสนอ", value: x.quote_no }]}
      projectTitle={`เหตุผลการ${verb}: ${x.reason || "-"}`}
      customer={{ name: x.customerName, code: custCode(x.customerCode), taxId: x.customerTaxId, branch: x.customerBranch, address: x.customerAddr, contactName: x.mainContactName, contactPhone: x.mainContactPhone, siteName: x.siteName, siteAddress: x.siteAddress, siteContactName: x.siteContactName, siteContactPhone: x.siteContactPhone, mapUrl: x.mapUrl }}
      terms={x.note} termsPayment={x.terms_payment} termsFreebies={x.terms_freebies} termsWarranty={x.terms_warranty} bank={co.bank_info}
      signLabels={["ผู้ออกเอกสาร", "ผู้รับเอกสาร / ลูกค้า"]} signUrl={x.sign_url} signName={x.sign_name}
      unitHead="หน่วยละ" amountHead={`ยอด${verb}`}
      totals={<div className="doc-totals">
        <div><span>รวมยอด{verb}ก่อนภาษี</span><b>{fmtBaht2(x.base)}</b></div>
        {x.is_vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht2(x.vat_amt)}</b></div> : null}
        <div className="doc-grand"><span>รวมทั้งสิ้น</span><b>{fmtBaht2(x.total)}</b></div>
        {x.wht_amt > 0 && <div><span>หัก ณ ที่จ่าย {Number(x.wht_rate) || 3}%</span><b>− {fmtBaht2(x.wht_amt)}</b></div>}
        <div className="doc-grand"><span>ยอดสุทธิ ({verb})</span><b>{fmtBaht2(x.net)}</b></div>
      </div>}>
      {its.map((it, i) => (
        <tr key={i}><td>{i + 1}</td><td>{it.code || "-"}</td>
          <td>{it.name}{it.desc ? <div className="doc-item-desc">{it.desc}</div> : null}</td>
          <td className="r">{Number(it.qty)} {it.unit || ""}</td><td className="r">{fmtBaht2(it.price)}</td><td className="r">{fmtBaht2(Number(it.amount) || (Number(it.qty) * Number(it.price)))}</td></tr>
      ))}
    </DocSlip>
  );
}

function poSlip(po, sup, matMap, companies) {
  const co = po.vat ? companies.vat : companies.novat;
  const c0 = sup?.contacts?.[0];
  return (
    <DocSlip company={co} titleTh="ใบสั่งซื้อ" titleEn="PURCHASE ORDER" docNo={po.po_no} partyLabel="ผู้ขาย"
      metaRows={[{ label: "วันที่", value: fmtDocDate(po.issue_date || po.created_at) }, ...(po.quote_no ? [{ label: "อ้างอิงใบเสนอราคา", value: po.quote_no }] : [])]}
      customer={{ name: po.supplier || "-", taxId: sup?.tax_id, address: sup?.address, contactName: c0?.name, contactPhone: c0?.phone }}
      terms={po.note} signLabels={["ผู้สั่งซื้อ", "ผู้อนุมัติ"]}
      totals={<div className="doc-totals">
        <div><span>รวมเป็นเงิน</span><b>{fmtBaht(po.subtotal)}</b></div>
        {po.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht(po.vatAmt)}</b></div> : null}
        <div className="doc-grand"><span>รวมทั้งสิ้น</span><b>{fmtBaht(po.total)}</b></div>
      </div>}>
      {(po.items || []).map((it, i) => { const m = matMap[it.material_code]; return (
        <tr key={i}><td>{i + 1}</td><td>{it.material_code}</td><td>{m?.th || it.material_code}</td><td className="r">{fmtNum(it.qty)} {it.unit || m?.unit || ""}</td><td className="r">{fmtBaht(it.price)}</td><td className="r">{fmtBaht(it.qty * it.price)}</td></tr>
      ); })}
    </DocSlip>
  );
}

function quoteSlip(q, companies) {
  const co = q.vat ? companies.vat : companies.novat;
  return (
    <DocSlip company={co} titleTh="ใบเสนอราคา" titleEn="QUOTATION" docNo={q.quote_no}
      metaRows={[{ label: "วันที่", value: q.issue_date }, { label: "ยืนราคาถึง", value: q.valid_until }, { label: "อ้างอิง BOQ", value: q.boq_no }]}
      projectTitle={q.title}
      customer={{ name: q.customerName, code: custCode(q.customerCode), taxId: q.customerTaxId, address: q.customerAddr, contactName: q.mainContactName, contactPhone: q.mainContactPhone, siteName: q.siteName, siteAddress: q.siteAddress, siteContactName: q.siteContactName, siteContactPhone: q.siteContactPhone, mapUrl: q.map_url }}
      terms={q.note || co.default_terms} termsPayment={q.terms_payment} termsFreebies={q.terms_freebies} termsWarranty={q.terms_warranty} bank={co.bank_info} signLabels={["ผู้เสนอราคา", "ผู้อนุมัติ / ลูกค้า"]}
      discountCol={(q.items || []).some((it) => Number(it.discount) > 0)}
      totals={<div className="doc-totals">
        <div><span>รวมเป็นเงิน</span><b>{fmtBaht(q.subtotal)}</b></div>
        {q.discount > 0 && <div><span>ส่วนลด</span><b>− {fmtBaht(q.discount)}</b></div>}
        {q.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht(q.vatAmt)}</b></div> : null}
        <div className="doc-grand"><span>รวมทั้งสิ้น</span><b>{fmtBaht(q.grand)}</b></div>
        {q.whtOn ? <div><span>หัก ณ ที่จ่าย {Number(q.wht_rate) || 3}%</span><b>− {fmtBaht(q.whtAmt)}</b></div> : null}
        {q.whtOn ? <div className="doc-grand"><span>ยอดชำระสุทธิ</span><b>{fmtBaht(q.netPay)}</b></div> : null}
      </div>}>
      {/* ราคา = price_show (รวมค่าบัตร) − ส่วนลดบรรทัด — สูตรเดียวกับหน้าพิมพ์ ให้บรรทัดบวกลงตัวกับยอดรวม */}
      {(() => { const hasD = (q.items || []).some((x) => Number(x.discount) > 0); return q.items.map((it, i) => (
        <tr key={i}><td>{i + 1}</td><td>{it.item_code || "-"}</td><td>{it.name}{it.description ? <div className="doc-item-desc">{it.description}</div> : null}</td><td className="r">{it.qty} {it.unit || ""}</td><td className="r">{fmtBaht(it.price_show ?? it.unit_price)}</td>{hasD && <td className="r">{Number(it.discount) > 0 ? "− " + fmtBaht(it.discount) : "-"}</td>}<td className="r">{fmtBaht(it.qty * (it.price_show ?? it.unit_price) - (Number(it.discount) || 0))}</td></tr>
      )); })()}
    </DocSlip>
  );
}

function invoiceSlip(x, q, companies) {
  const co = (q ? q.vat : true) ? companies.vat : companies.novat;
  return (
    <DocSlip company={co} titleTh="ใบแจ้งหนี้" titleEn="INVOICE" docNo={x.invoice_no}
      metaRows={[{ label: "วันที่", value: x.issue_date }, { label: "ครบกำหนด", value: x.due_date }, { label: "อ้างอิงใบเสนอ", value: x.quote_no }, { label: "อ้างอิง BOQ", value: x.boq_no }, { label: "งวดที่", value: `${x.installment} (${Math.round(x.pct)}%)` }]}
      projectTitle={x.title}
      customer={{ name: x.customerName, code: custCode(x.customerCode), taxId: x.customerTaxId, address: x.customerAddr, contactName: x.mainContactName, contactPhone: x.mainContactPhone, siteName: x.siteName, siteAddress: x.siteAddress, siteContactName: x.siteContactName, siteContactPhone: x.siteContactPhone, mapUrl: x.mapUrl }}
      terms={x.note || co.default_terms} termsPayment={x.terms_payment} termsFreebies={x.terms_freebies} termsWarranty={x.terms_warranty} bank={co.bank_info} signLabels={["ผู้วางบิล", "ผู้รับวางบิล"]}
      discountCol={(q?.items || []).some((it) => Number(it.discount) > 0)}
      totals={<div className="doc-totals">
        <div><span>รวมเป็นเงิน</span><b>{fmtBaht2(q?.subtotal || 0)}</b></div>
        {q?.discount > 0 && <div><span>ส่วนลด</span><b>− {fmtBaht2(q.discount)}</b></div>}
        {q?.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht2(q.vatAmt)}</b></div> : null}
        <div className="doc-grand"><span>รวมทั้งสิ้น (เต็มสัญญา)</span><b>{fmtBaht2(q?.grand || 0)}</b></div>
        <div style={{ marginTop: 4 }}><span>งวดที่ {x.installment} ({Math.round(x.pct)}%)</span><b /></div>
        <div className="doc-grand"><span>ยอดชำระงวดนี้</span><b>{fmtBaht2(x.total)}</b></div>
        {x.wht_amt > 0 && <div><span>หัก ณ ที่จ่าย (ตอนชำระ)</span><b>− {fmtBaht2(x.wht_amt)}</b></div>}
        {x.wht_amt > 0 && <div className="doc-grand"><span>ยอดรับสุทธิงวดนี้</span><b>{fmtBaht2(x.total - x.wht_amt)}</b></div>}
      </div>}>
      {(() => { const hasD = (q?.items || []).some((x2) => Number(x2.discount) > 0); return (q?.items || []).map((it, i) => (
        <tr key={i}><td>{i + 1}</td><td>{it.item_code || "-"}</td><td>{it.name}{it.description ? <div className="doc-item-desc">{it.description}</div> : null}</td><td className="r">{Number(it.qty)} {it.unit || ""}</td><td className="r">{fmtBaht2(it.price_show ?? it.unit_price)}</td>{hasD && <td className="r">{Number(it.discount) > 0 ? "− " + fmtBaht2(it.discount) : "-"}</td>}<td className="r">{fmtBaht2(Number(it.qty) * Number(it.price_show ?? it.unit_price) - (Number(it.discount) || 0))}</td></tr>
      )); })()}
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
      customer={{ name: x.customerName, code: custCode(x.customerCode), taxId: x.customerTaxId, address: x.customerAddr, contactName: x.mainContactName, contactPhone: x.mainContactPhone, siteName: x.siteName, siteAddress: x.siteAddress, siteContactName: x.siteContactName, siteContactPhone: x.siteContactPhone, mapUrl: x.mapUrl }}
      terms={x.note} termsPayment={x.terms_payment} termsFreebies={x.terms_freebies} termsWarranty={x.terms_warranty} bank={co.bank_info} signLabels={["ผู้รับเงิน", "ผู้จ่ายเงิน"]}
      discountCol={(q?.items || []).some((it) => Number(it.discount) > 0)}
      paymentInfo={paid ? `ได้รับชำระเงินแล้ว · วันที่ ${x.issue_date || "-"} · โดย ${x.payment_method || "-"} · จำนวน ${fmtBaht2(x.net)}` : null}
      totals={<div className="doc-totals">
        <div><span>รวมเป็นเงิน</span><b>{fmtBaht2(q?.subtotal || 0)}</b></div>
        {q?.discount > 0 && <div><span>ส่วนลด</span><b>− {fmtBaht2(q.discount)}</b></div>}
        {q?.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtBaht2(q.vatAmt)}</b></div> : null}
        <div className="doc-grand"><span>รวมทั้งสิ้น (เต็มสัญญา)</span><b>{fmtBaht2(q?.grand || 0)}</b></div>
        <div style={{ marginTop: 4 }}><span>รับชำระตามใบแจ้งหนี้ {x.invoice_no}{inv ? ` · งวดที่ ${inv.installment} (${Math.round(inv.pct)}%)` : ""}</span><b /></div>
        <div className="doc-grand"><span>รวมเป็นเงินงวดนี้</span><b>{fmtBaht2(x.total)}</b></div>
        {x.wht_amt > 0 && <div><span>หัก ณ ที่จ่าย {Number(x.wht_rate) || 3}%</span><b>− {fmtBaht2(x.wht_amt)}</b></div>}
        <div className="doc-grand"><span>รับเงินสุทธิ</span><b>{fmtBaht2(x.net)}</b></div>
      </div>}>
      {(() => { const hasD = (q?.items || []).some((x2) => Number(x2.discount) > 0); return (q?.items || []).map((it, i) => (
        <tr key={i}><td>{i + 1}</td><td>{it.item_code || "-"}</td><td>{it.name}{it.description ? <div className="doc-item-desc">{it.description}</div> : null}</td><td className="r">{Number(it.qty)} {it.unit || ""}</td><td className="r">{fmtBaht2(it.price_show ?? it.unit_price)}</td>{hasD && <td className="r">{Number(it.discount) > 0 ? "− " + fmtBaht2(it.discount) : "-"}</td>}<td className="r">{fmtBaht2(Number(it.qty) * Number(it.price_show ?? it.unit_price) - (Number(it.discount) || 0))}</td></tr>
      )); })()}
    </DocSlip>
  );
}
