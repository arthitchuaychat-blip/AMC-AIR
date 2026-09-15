import React from "react";
import DocSlip from "./DocSlip";
import { whtRate } from "../lib/salesWht";
import { listQuotations, listInvoices, listReceipts, listPurchaseOrders, listSuppliers, listMaterialsLite, listAdjustmentNotes, listBillingNotes, getCompanies } from "../lib/api";
import { fmtBaht, fmtNum, custCode, fmtDocDate, fmtDocAmount, round2 } from "../lib/format";

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
    <DocSlip currencyUnit="บาท" company={co} titleTh="ใบวางบิล / ใบแจ้งหนี้รวม" titleEn="BILLING NOTE" docNo={x.billing_no}
      metaRows={[{ label: "วันที่", value: x.issue_date }, { label: "จำนวนใบแจ้งหนี้", value: String(live.length) }]}
      customer={{ name: x.customerName, code: custCode(x.customerCode), taxId: x.customerTaxId, branch: x.customerBranch, address: x.customerAddr, contactName: x.mainContactName, contactPhone: x.mainContactPhone, siteName: x.siteName, siteAddress: x.siteAddress, siteContactName: x.siteContactName, siteContactPhone: x.siteContactPhone, mapUrl: x.mapUrl }}
      terms={x.note} bank={co.bank_info} signLabels={["ผู้วางบิล", "ผู้รับวางบิล"]} signUrl={x.sign_url} signName={x.sign_name}
      totals={<div className="doc-totals">
        {x.wht > 0 ? <>
          <div><span>ยอดวางบิลรวม</span><b>{fmtDocAmount(x.total)}</b></div>
          <div><span>หัก ณ ที่จ่าย</span><b>− {fmtDocAmount(x.wht)}</b></div>
          <div className="doc-grand"><span>ยอดสุทธิที่ต้องชำระ</span><b>{fmtDocAmount(x.net)}</b></div>
        </> : <div className="doc-grand"><span>ยอดวางบิลรวมทั้งสิ้น</span><b>{fmtDocAmount(x.total)}</b></div>}
      </div>}>
      {live.map((iv, i) => (
        <tr key={iv.invoice_no}><td>{i + 1}</td><td>{iv.invoice_no}</td><td>ใบแจ้งหนี้ · {Number(iv.pct) === 100 ? "เต็มจำนวน (100%)" : `งวดที่ ${iv.installment} (${Math.round(iv.pct)}%)`}{iv.issue_date ? ` · ${iv.issue_date}` : ""}</td><td className="r" /><td className="r" /><td className="r">{fmtDocAmount(iv.total)}</td></tr>
      ))}
    </DocSlip>
  );
}

// ใบลดหนี้ / ใบเพิ่มหนี้ — รายการเป็นของตัวเอง (ที่ลด/เพิ่ม) · ต้องเหมือนหน้าพิมพ์ใน AdjustmentNotes
function noteSlip(x, companies) {
  const K2 = x.kind === "debit" ? { th: "ใบเพิ่มหนี้", en: "DEBIT NOTE", verb: "เพิ่ม" } : { th: "ใบลดหนี้", en: "CREDIT NOTE", verb: "ลด" };
  const co = x.is_vat ? companies.vat : companies.novat;
  const its = x.items || [];
  const allAmt = its.reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const rate = whtRate(x.wht_rate);
  // หัก ณ ที่จ่ายต่อบรรทัด (บรรทัดสุดท้ายรับเศษ)
  const perLineBase = {}, perLineWht = {};
  if (x.wht_amt > 0 && allAmt > 0) {
    const flagged = its.map((s, i) => ({ s, i })).filter((o) => o.s.wht);
    const whtBaseTot = round2((x.base || 0) * flagged.reduce((a, o) => a + (Number(o.s.amount) || 0), 0) / allAmt);
    let accB = 0, accW = 0;
    flagged.forEach((o, k) => {
      const last = k === flagged.length - 1;
      const b = last ? round2(whtBaseTot - accB) : round2((x.base || 0) * (Number(o.s.amount) || 0) / allAmt);
      const w = last ? round2(x.wht_amt - accW) : round2(b * rate / 100);
      if (!last) { accB = round2(accB + b); accW = round2(accW + w); }
      perLineBase[o.i] = b; perLineWht[o.i] = w;
    });
  }
  return (
    <DocSlip currencyUnit="บาท" company={co} titleTh={K2.th} titleEn={K2.en} docNo={x.note_no}
      metaRows={[{ label: "วันที่", value: x.issue_date }, { label: "อ้างอิงใบเสร็จ", value: x.receipt_no }, { label: "อ้างอิงใบแจ้งหนี้", value: x.invoice_no }, { label: "อ้างอิงใบเสนอ", value: x.quote_no }]}
      projectTitle={`เหตุผลการ${K2.verb}: ${x.reason || "-"}`}
      customer={{ name: x.customerName, code: custCode(x.customerCode), taxId: x.customerTaxId, branch: x.customerBranch, address: x.customerAddr, contactName: x.mainContactName, contactPhone: x.mainContactPhone, siteName: x.siteName, siteAddress: x.siteAddress, siteContactName: x.siteContactName, siteContactPhone: x.siteContactPhone, mapUrl: x.mapUrl }}
      terms={x.note} termsPayment={x.terms_payment} termsFreebies={x.terms_freebies} termsWarranty={x.terms_warranty} bank={co.bank_info}
      signLabels={["ผู้ออกเอกสาร", "ผู้รับเอกสาร / ลูกค้า"]} signUrl={x.sign_url} signName={x.sign_name}
      unitHead="หน่วยละ" amountHead={`ยอด${K2.verb}`}
      totals={<div className="doc-totals">
        <div><span>รวมยอด{K2.verb}ก่อนภาษี</span><b>{fmtDocAmount(x.base)}</b></div>
        {x.is_vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtDocAmount(x.vat_amt)}</b></div> : null}
        <div className="doc-grand"><span>รวมทั้งสิ้น</span><b>{fmtDocAmount(x.total)}</b></div>
        {x.wht_amt > 0 && <div><span>หัก ณ ที่จ่าย {rate}%</span><b>− {fmtDocAmount(x.wht_amt)}</b></div>}
        <div className="doc-grand"><span>ยอดสุทธิ ({K2.verb})</span><b>{fmtDocAmount(x.net)}</b></div>
      </div>}>
      {its.map((it, i) => (
        <tr key={i}><td>{i + 1}</td><td>{it.code || "-"}</td>
          <td>{it.name}{it.desc ? <div className="doc-item-desc">{it.desc}</div> : null}
            {perLineWht[i] > 0 && <div className="doc-item-desc" style={{ color: "#b91c1c" }}>↳ หัก ณ ที่จ่าย {rate}% จากยอด {fmtDocAmount(perLineBase[i])} = − {fmtDocAmount(perLineWht[i])}</div>}
          </td>
          <td className="r">{Number(it.qty)} {it.unit || ""}</td><td className="r">{fmtDocAmount(it.price)}</td><td className="r">{fmtDocAmount(Number(it.amount) || (Number(it.qty) * Number(it.price)))}</td></tr>
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
  const co = q.vat ? companies.vat : companies.novat; return (
    <DocSlip currencyUnit="บาท" company={co} titleTh="ใบเสนอราคา" titleEn="QUOTATION" docNo={q.quote_no}
      metaRows={[{ label: "วันที่", value: q.issue_date }, { label: "ยืนราคาถึง", value: q.valid_until }, { label: "อ้างอิง BOQ", value: q.boq_no },
        ...(q.payMethod === "card_full" ? [{ label: "การชำระเงิน", value: "บัตรเครดิต (รูดเต็ม)" }] : q.payMethod === "card_inst10" ? [{ label: "การชำระเงิน", value: "ผ่อนบัตรเครดิต 10 เดือน" }] : [])]}
      projectTitle={q.title}
      customer={{ name: q.customerName, code: custCode(q.customerCode), taxId: q.customerTaxId, branch: q.customerBranch, address: q.customerAddr, contactName: q.mainContactName, contactPhone: q.mainContactPhone, siteName: q.siteName, siteAddress: q.siteAddress, siteContactName: q.siteContactName, siteContactPhone: q.siteContactPhone, mapUrl: q.map_url }}
      terms={q.note || co.default_terms} termsPayment={q.terms_payment} termsFreebies={q.terms_freebies} termsWarranty={q.terms_warranty} bank={co.bank_info}
      signLabels={["ผู้เสนอราคา", "ผู้อนุมัติ / ลูกค้า"]} signUrl={q.sign_url} signName={q.sign_name}
      discountCol={q.items.some((it) => Number(it.discount) > 0)}
      totals={<div className="doc-totals">
        <div><span>รวมเป็นเงิน</span><b>{fmtDocAmount(q.subtotal)}</b></div>
        {q.discount > 0 && <div><span>ส่วนลด</span><b>− {fmtDocAmount(q.discount)}</b></div>}
        {q.discount > 0 && <div><span>ยอดหลังหักส่วนลด</span><b>{fmtDocAmount(q.afterDisc)}</b></div>}
        {q.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtDocAmount(q.vatAmt)}</b></div> : null}
        <div className="doc-grand"><span>รวมทั้งสิ้น</span><b>{fmtDocAmount(q.grand)}</b></div>
        {q.payMethod === "card_inst10" ? <div><span>≈ ผ่อนเดือนละ</span><b>{fmtDocAmount(q.grand / 10)} × 10 เดือน</b></div> : null}
        {q.whtOn ? <div><span>หัก ณ ที่จ่าย {whtRate(q.wht_rate)}%</span><b>− {fmtDocAmount(q.whtAmt)}</b></div> : null}
        {q.whtOn ? <div className="doc-grand"><span>ยอดชำระสุทธิ</span><b>{fmtDocAmount(q.netPay)}</b></div> : null}
      </div>}>
      {(() => { const hasD = q.items.some((x) => Number(x.discount) > 0); return q.items.map((it, i) => (
        <tr key={i}><td>{i + 1}</td><td>{it.item_code || "-"}</td><td>{it.name}{it.description ? <div className="doc-item-desc">{it.description}</div> : null}</td><td className="r">{it.qty} {it.unit || ""}</td><td className="r">{fmtDocAmount(it.price_show ?? it.unit_price)}</td>{hasD && <td className="r">{Number(it.discount) > 0 ? "− " + fmtDocAmount(it.discount) : "-"}</td>}<td className="r">{fmtDocAmount(it.qty * (it.price_show ?? it.unit_price) - (Number(it.discount) || 0))}</td></tr>
      )); })()}
    </DocSlip>
  );
}

function invoiceSlip(x, q, companies) {
  const co = (q ? q.vat : true) ? companies.vat : companies.novat;
    // ฐานค่าบริการที่นำมาหัก ณ ที่จ่าย ของงวดนี้ (โชว์ให้ลูกค้าเห็นที่มา)
    const whtItems = (x.items || []).filter((i) => i.wht);
    const allAmtP = (x.items || []).reduce((a, i) => a + (Number(i.amount) || 0), 0);
    const svcAmtP = whtItems.reduce((a, i) => a + (Number(i.amount) || 0), 0);
    const whtBaseP = allAmtP > 0 ? round2((x.base || 0) * svcAmtP / allAmtP) : 0;
    const fullPayment = Number(x.pct) === 100;
  return (
    <DocSlip currencyUnit="บาท" company={co} titleTh="ใบส่งของ / ใบแจ้งหนี้" titleEn="DELIVERY NOTE / INVOICE" docNo={x.invoice_no} discountCol={(q?.items || []).some((x) => Number(x.discount) > 0)}
      metaRows={[{ label: "วันที่", value: x.issue_date }, { label: "ครบกำหนด", value: x.due_date }, { label: "อ้างอิงใบเสนอ", value: x.quote_no }, { label: "อ้างอิง BOQ", value: x.boq_no }, ...(fullPayment ? [] : [{ label: "งวดที่", value: `${x.installment} (${Math.round(x.pct)}%)` }])]}
      projectTitle={x.title}
      customer={{ name: x.customerName, code: custCode(x.customerCode), taxId: x.customerTaxId, branch: x.customerBranch, address: x.customerAddr, contactName: x.mainContactName, contactPhone: x.mainContactPhone, siteName: x.siteName, siteAddress: x.siteAddress, siteContactName: x.siteContactName, siteContactPhone: x.siteContactPhone, mapUrl: x.mapUrl }}
      terms={x.note || co.default_terms} termsPayment={x.terms_payment} termsFreebies={x.terms_freebies} termsWarranty={x.terms_warranty} bank={co.bank_info} signLabels={["ผู้วางบิล", "ผู้รับวางบิล"]} signUrl={x.sign_url} signName={x.sign_name}
      totals={<div className="doc-totals">
        <div><span>รวมเป็นเงิน</span><b>{fmtDocAmount(q?.subtotal || 0)}</b></div>
        {q?.discount > 0 && <div><span>ส่วนลด</span><b>− {fmtDocAmount(q.discount)}</b></div>}
        {q?.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtDocAmount(q.vatAmt)}</b></div> : null}
        <div className="doc-grand"><span>รวมทั้งสิ้น (เต็มสัญญา)</span><b>{fmtDocAmount(q?.grand || 0)}</b></div>
        {!fullPayment && <div style={{ marginTop: 4 }}><span>งวดที่ {x.installment} ({Math.round(x.pct)}%)</span><b /></div>}
        {/* แสดงมูลค่า+VAT ของ "งวดนี้" ตามที่เรียกเก็บจริง (ม.86/4) — เดิมมีแต่ VAT ของทั้งสัญญาด้านบน */}
        {Number(x.base) > 0 && <div><span>{fullPayment ? "มูลค่าก่อนภาษี" : "มูลค่าก่อนภาษีงวดนี้"}</span><b>{fmtDocAmount(x.base)}</b></div>}
        {Number(x.vat_amt) > 0 && <div><span>{fullPayment ? "ภาษีมูลค่าเพิ่ม 7%" : "ภาษีมูลค่าเพิ่ม 7% งวดนี้"}</span><b>{fmtDocAmount(x.vat_amt)}</b></div>}
        <div className="doc-grand"><span>{fullPayment ? "ยอดชำระ" : "ยอดชำระงวดนี้"}</span><b>{fmtDocAmount(x.total)}</b></div>
        {x.wht_amt > 0 && <div className="doc-wht-note"><span>ฐานค่าบริการที่ถูกหัก ณ ที่จ่าย</span><b>{fmtDocAmount(whtBaseP)}</b></div>}
        {x.wht_amt > 0 && <div><span>หัก ณ ที่จ่าย {whtRate(x.wht_rate)}% (ตอนชำระ)</span><b>− {fmtDocAmount(x.wht_amt)}</b></div>}
        {x.wht_amt > 0 && <div className="doc-grand"><span>{fullPayment ? "ยอดรับสุทธิ" : "ยอดรับสุทธิงวดนี้"}</span><b>{fmtDocAmount(x.total - x.wht_amt)}</b></div>}
      </div>}>
      {/* ราคาบรรทัดพิมพ์ = price_show (รวมค่าบัตรแล้ว) ให้บวกลงตัวกับยอดรวมที่คิดจาก price_show — เหมือนใบเสนอราคา */}
      {(() => {
        const its = q?.items || []; const hasD = its.some((x) => Number(x.discount) > 0);
        const snap = x.items || []; const rate = whtRate(x.wht_rate);
        // หัก ณ ที่จ่ายต่อบรรทัด (เฉพาะรายการค่าบริการที่ติ๊ก) — รวมทุกบรรทัด = ยอดหักรวมพอดี (บรรทัดสุดท้ายรับเศษ)
        const perLineBase = {}, perLineWht = {};
        if (x.wht_amt > 0 && allAmtP > 0) {
          const flagged = snap.map((s, i) => ({ s, i })).filter((o) => o.s.wht);
          const whtBaseTot = round2((x.base || 0) * flagged.reduce((a, o) => a + (Number(o.s.amount) || 0), 0) / allAmtP);
          let accB = 0, accW = 0;
          flagged.forEach((o, k) => {
            const last = k === flagged.length - 1;
            const b = last ? round2(whtBaseTot - accB) : round2((x.base || 0) * (Number(o.s.amount) || 0) / allAmtP);
            const w = last ? round2(x.wht_amt - accW) : round2(b * rate / 100);
            if (!last) { accB = round2(accB + b); accW = round2(accW + w); }
            perLineBase[o.i] = b; perLineWht[o.i] = w;
          });
        }
        return its.map((it, i) => {
          const s = snap[i]; const ok = s && s.name === it.name && perLineWht[i] > 0; // ผูกตามลำดับ + ยืนยันชื่อตรง กันแนบผิดบรรทัด
          return (
            <tr key={i}><td>{i + 1}</td><td>{it.item_code || "-"}</td>
              <td>{it.name}{it.description ? <div className="doc-item-desc">{it.description}</div> : null}
                {ok && <div className="doc-item-desc" style={{ color: "#b91c1c" }}>↳ หัก ณ ที่จ่าย {rate}% จากยอด {fmtDocAmount(perLineBase[i])} = − {fmtDocAmount(perLineWht[i])}</div>}
              </td>
              <td className="r">{Number(it.qty)} {it.unit || ""}</td><td className="r">{fmtDocAmount(it.price_show ?? it.unit_price)}</td>{hasD && <td className="r">{Number(it.discount) > 0 ? "− " + fmtDocAmount(it.discount) : "-"}</td>}<td className="r">{fmtDocAmount(Number(it.qty) * Number(it.price_show ?? it.unit_price) - (Number(it.discount) || 0))}</td></tr>
          );
        });
      })()}
    </DocSlip>
  );
}

function receiptSlip(x, q, inv, companies) {
  const isVat = inv ? (inv.vat_amt > 0) : (x.vat_amt > 0);
    const co = isVat ? companies.vat : companies.novat;
    const baseTitle = isVat ? "ใบเสร็จรับเงิน/ใบกำกับภาษี" : "ใบเสร็จรับเงิน";
    const paid = x.status === "paid";
    const fullPayment = Number(inv?.pct) === 100;
  return (
    <DocSlip currencyUnit="บาท" company={co} titleTh={baseTitle} titleEn={isVat ? "RECEIPT / TAX INVOICE" : "RECEIPT"} docNo={x.receipt_no} discountCol={(q?.items || []).some((x) => Number(x.discount) > 0)}
      metaRows={[{ label: "วันที่", value: x.issue_date }, { label: "อ้างอิงใบแจ้งหนี้", value: x.invoice_no }, { label: "อ้างอิงใบเสนอ", value: x.quote_no }, { label: "อ้างอิง BOQ", value: x.boq_no }, { label: "อ้างอิงใบงาน", value: x.job_no }]}
      projectTitle={x.title}
      customer={{ name: x.customerName, code: custCode(x.customerCode), taxId: x.customerTaxId, branch: x.customerBranch, address: x.customerAddr, contactName: x.mainContactName, contactPhone: x.mainContactPhone, siteName: x.siteName, siteAddress: x.siteAddress, siteContactName: x.siteContactName, siteContactPhone: x.siteContactPhone, mapUrl: x.mapUrl }}
      terms={x.note} termsPayment={x.terms_payment} termsFreebies={x.terms_freebies} termsWarranty={x.terms_warranty} bank={co.bank_info} signLabels={["ผู้รับเงิน", "ผู้จ่ายเงิน"]} signUrl={x.sign_url} signName={x.sign_name}
      paymentInfo={paid ? `ได้รับชำระเงินแล้ว · วันที่ ${x.issue_date || "-"} · โดย ${x.payment_method || "-"} · จำนวน ${fmtDocAmount(x.net)}` : null}
      totals={<div className="doc-totals">
        <div><span>รวมเป็นเงิน</span><b>{fmtDocAmount(q?.subtotal || 0)}</b></div>
        {q?.discount > 0 && <div><span>ส่วนลด</span><b>− {fmtDocAmount(q.discount)}</b></div>}
        {q?.vat ? <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>{fmtDocAmount(q.vatAmt)}</b></div> : null}
        <div className="doc-grand"><span>รวมทั้งสิ้น (เต็มสัญญา)</span><b>{fmtDocAmount(q?.grand || 0)}</b></div>
        <div style={{ marginTop: 4 }}><span>รับชำระตามใบแจ้งหนี้ {x.invoice_no}{inv && !fullPayment ? ` · งวดที่ ${inv.installment} (${Math.round(inv.pct)}%)` : ""}</span><b /></div>
        {/* ใบกำกับภาษีต้องแสดง "มูลค่า + VAT ของยอดที่เรียกเก็บจริง" (ม.86/4) — เดิมโชว์ VAT ของทั้งสัญญา ลูกค้าเครดิตภาษีซื้อผิดยอด */}
        {Number(x.base) > 0 && <div><span>{fullPayment ? "มูลค่าก่อนภาษี" : "มูลค่าก่อนภาษีงวดนี้"}</span><b>{fmtDocAmount(x.base)}</b></div>}
        {Number(x.vat_amt) > 0 && <div><span>{fullPayment ? "ภาษีมูลค่าเพิ่ม 7%" : "ภาษีมูลค่าเพิ่ม 7% งวดนี้"}</span><b>{fmtDocAmount(x.vat_amt)}</b></div>}
        <div className="doc-grand"><span>{fullPayment ? "รวมเป็นเงิน" : "รวมเป็นเงินงวดนี้"}</span><b>{fmtDocAmount(x.total)}</b></div>
        {x.wht_amt > 0 && <div><span>หัก ณ ที่จ่าย {whtRate(x.wht_rate)}%</span><b>− {fmtDocAmount(x.wht_amt)}</b></div>}
        <div className="doc-grand"><span>รับเงินสุทธิ</span><b>{fmtDocAmount(x.net)}</b></div>
      </div>}>
      {/* ราคาบรรทัดพิมพ์ = price_show (รวมค่าบัตรแล้ว) ให้บวกลงตัวกับยอดรวม — เหมือนใบเสนอราคา */}
      {(() => {
        const its = q?.items || []; const hasD = its.some((x) => Number(x.discount) > 0);
        const snap = x.items || []; const rate = whtRate(x.wht_rate);
        const allAmtP = snap.reduce((a, i) => a + (Number(i.amount) || 0), 0);
        // หัก ณ ที่จ่ายต่อบรรทัด (เฉพาะรายการค่าบริการที่ติ๊ก) — รวมทุกบรรทัด = ยอดหักรวมพอดี (บรรทัดสุดท้ายรับเศษ)
        const perLineBase = {}, perLineWht = {};
        if (x.wht_amt > 0 && allAmtP > 0) {
          const flagged = snap.map((s, i) => ({ s, i })).filter((o) => o.s.wht);
          const whtBaseTot = round2((x.base || 0) * flagged.reduce((a, o) => a + (Number(o.s.amount) || 0), 0) / allAmtP);
          let accB = 0, accW = 0;
          flagged.forEach((o, k) => {
            const last = k === flagged.length - 1;
            const b = last ? round2(whtBaseTot - accB) : round2((x.base || 0) * (Number(o.s.amount) || 0) / allAmtP);
            const w = last ? round2(x.wht_amt - accW) : round2(b * rate / 100);
            if (!last) { accB = round2(accB + b); accW = round2(accW + w); }
            perLineBase[o.i] = b; perLineWht[o.i] = w;
          });
        }
        return its.map((it, i) => {
          const s = snap[i]; const ok = s && s.name === it.name && perLineWht[i] > 0;
          return (
            <tr key={i}><td>{i + 1}</td><td>{it.item_code || "-"}</td>
              <td>{it.name}{it.description ? <div className="doc-item-desc">{it.description}</div> : null}
                {ok && <div className="doc-item-desc" style={{ color: "#b91c1c" }}>↳ หัก ณ ที่จ่าย {rate}% จากยอด {fmtDocAmount(perLineBase[i])} = − {fmtDocAmount(perLineWht[i])}</div>}
              </td>
              <td className="r">{Number(it.qty)} {it.unit || ""}</td><td className="r">{fmtDocAmount(it.price_show ?? it.unit_price)}</td>{hasD && <td className="r">{Number(it.discount) > 0 ? "− " + fmtDocAmount(it.discount) : "-"}</td>}<td className="r">{fmtDocAmount(Number(it.qty) * Number(it.price_show ?? it.unit_price) - (Number(it.discount) || 0))}</td></tr>
          );
        });
      })()}
    </DocSlip>
  );
}
