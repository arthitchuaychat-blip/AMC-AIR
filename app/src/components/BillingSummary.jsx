import React from "react";
import { listBoqs, listQuotations, listInvoices, listReceipts } from "../lib/api";
import { fmtBaht, inRange } from "../lib/format";
import { UIcon } from "../icons";

// Dashboard money summary (within selected date range): BOQ · quotations · invoiced (AR) · collected + VAT split.
export default function BillingSummary({ onGo, from, to }) {
  const [raw, setRaw] = React.useState(null);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    Promise.all([listBoqs(), listQuotations(), listInvoices(), listReceipts()])
      .then(([boqs, quotes, invoices, receipts]) => { if (alive) setRaw({ boqs, quotes, invoices, receipts }); })
      .catch((e) => { if (alive) setErr(e.message || String(e)); });
    return () => { alive = false; };
  }, []);

  const d = React.useMemo(() => {
    if (!raw) return null;
    const boqs = raw.boqs.filter((b) => inRange(b.created_at, from, to));
    const quotes = raw.quotes.filter((q) => inRange(q.issue_date || q.created_at, from, to));
    const liveInv = raw.invoices.filter((i) => i.status !== "cancelled" && inRange(i.issue_date || i.created_at, from, to));
    const paidRc = raw.receipts.filter((r) => r.status === "paid" && inRange(r.issue_date || r.created_at, from, to));
    const boqTotal = boqs.reduce((a, b) => a + (Number(b.total) || 0), 0);
    const quoteTotal = quotes.reduce((a, q) => a + (Number(q.grand) || 0), 0);
    const invoiceTotal = liveInv.reduce((a, i) => a + (Number(i.total) || 0), 0);
    const collected = paidRc.reduce((a, r) => a + (Number(r.total) || 0), 0);
    const approved = quotes.filter((q) => q.status === "approved");
    const vatA = approved.filter((q) => q.vat), noVatA = approved.filter((q) => !q.vat);
    return {
      boqTotal, boqCount: boqs.length,
      quoteTotal, quoteCount: quotes.length,
      invoiceTotal, invoiceCount: liveInv.length, outstanding: invoiceTotal - collected,
      collected, collectedCount: paidRc.length,
      vatSales: vatA.reduce((a, q) => a + (Number(q.afterDisc) || 0), 0), vatCount: vatA.length,
      noVatSales: noVatA.reduce((a, q) => a + (Number(q.afterDisc) || 0), 0), noVatCount: noVatA.length,
    };
  }, [raw, from, to]);

  if (err) return <div className="empty" style={{ color: "var(--down)" }}>โหลดสรุปยอดไม่สำเร็จ: {err}</div>;
  if (!d) return <div className="empty">กำลังโหลดสรุปยอด…</div>;

  const Card = ({ icon, color, label, value, sub, go, accent }) => (
    <div className={"stat-card" + (go ? " clickable" : "")} onClick={() => go && onGo && onGo(go)}
      role={go ? "button" : undefined} tabIndex={go ? 0 : undefined} onKeyDown={go ? (e) => (e.key === "Enter" || e.key === " ") && onGo && onGo(go) : undefined}>
      <div className="stat-top"><span className="stat-ico" style={{ background: `color-mix(in srgb, ${color} 13%, white)`, color }}><UIcon name={icon} size={18} strokeWidth={1.9} /></span></div>
      <div className="stat-val" style={accent ? { color: accent } : {}}>{fmtBaht(value)}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {go && <div className="stat-more">ดูทั้งหมด <UIcon name="chevR" size={13} strokeWidth={2.2} color="currentColor" /></div>}
    </div>
  );

  return (
    <div className="sales-report" style={{ marginTop: 18 }}>
      <div className="sec-head" style={{ marginBottom: 12 }}><div><div className="sec-title">ยอดเอกสาร & การเงิน</div><div className="sec-sub">BOQ · ใบเสนอราคา · ลูกหนี้ (แจ้งหนี้) · เก็บเงินแล้ว · กดเข้าดูได้</div></div></div>
      <div className="kpi-grid">
        <Card icon="clipboard" color="#0d9488" label="ยอด BOQ (ต้นทุนประเมิน)" value={d.boqTotal} sub={`${d.boqCount} ใบ`} go="boq" />
        <Card icon="clipboard" color="#2563eb" label="ยอดใบเสนอราคา" value={d.quoteTotal} sub={`${d.quoteCount} ใบ`} go="quote" />
        <Card icon="clipboard" color="#f59e0b" label="ยอดแจ้งหนี้ (ลูกหนี้)" value={d.invoiceTotal} sub={`${d.invoiceCount} ใบ · ค้างเก็บ ${fmtBaht(d.outstanding)}`} go="invoice" />
        <Card icon="check" color="#16a34a" label="เก็บเงินแล้ว" value={d.collected} sub={`${d.collectedCount} ใบ`} go="receipt" accent="var(--up)" />
      </div>

      <div className="sec-head" style={{ margin: "16px 0 10px" }}><div><div className="sec-title">ยอดขายแยกตามภาษี</div><div className="sec-sub">จากใบเสนอราคาที่อนุมัติ · ยอดสุทธิก่อน VAT</div></div></div>
      <div className="kpi-grid">
        <Card icon="clipboard" color="#2563eb" label="ยอดขาย — บิล VAT" value={d.vatSales} sub={`${d.vatCount} ใบ`} />
        <Card icon="clipboard" color="#7c3aed" label="ยอดขาย — บิลไม่ VAT" value={d.noVatSales} sub={`${d.noVatCount} ใบ`} />
        <div className="stat-card"><div className="stat-val">{fmtBaht(d.vatSales + d.noVatSales)}</div><div className="stat-label">รวมยอดขาย (อนุมัติ)</div><div className="stat-sub">VAT {d.vatCount} · ไม่ VAT {d.noVatCount} ใบ</div></div>
      </div>
    </div>
  );
}
