import React from "react";
import { listBoqs, listQuotations, listInvoices, listReceipts, listPurchaseOrders, listMaterialsLite, listJobOrders, listBillingNotes } from "../lib/api";
import { fmtBaht, fmtNum, fmtDocDate } from "../lib/format";
import { JOB_STATUSES, jobTypeDef } from "../lib/schedule";
import { UIcon } from "../icons";

// แผงพรีวิวเอกสารด้านขวา — เปิดจากชิป "เชื่อมโยง" บนใบงาน: ดูสรุปเร็ว ๆ โดยไม่หลุดจากหน้าเดิม
// อยากแก้/พิมพ์ค่อยกด "เปิดหน้าเต็ม" (พฤติกรรมเดิม = เปิดแท็บใหม่ของเมนูนั้น)
const META = {
  boq: { th: "ใบประมาณการ (BOQ)", color: "#475569" },
  quote: { th: "ใบเสนอราคา", color: "#1f74e0" },
  invoice: { th: "ใบส่งของ/ใบแจ้งหนี้", color: "#0e7490" },
  receipt: { th: "ใบเสร็จรับเงิน", color: "#16a34a" },
  billing: { th: "ใบวางบิล", color: "#b45309" },
  po: { th: "ใบสั่งซื้อ", color: "#7c3aed" },
  job: { th: "ใบงาน", color: "#ea8a04" },
};
const JOB_ST = Object.fromEntries(JOB_STATUSES.map(([v, l]) => [v, l]));
const ST_TH = {
  draft: "ร่าง", sent: "ส่งแล้ว", approved: "อนุมัติ", rejected: "ปฏิเสธ", expired: "หมดอายุ", cancelled: "ยกเลิก",
  unpaid: "ค้างชำระ", paid: "ชำระแล้ว", pending: "รอชำระ", open: "รอรับของ", received: "รับของแล้ว",
};

export default function DocPeek({ type, no, onClose, onOpenFull }) {
  const [doc, setDoc] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);
  const M = META[type] || META.quote;

  React.useEffect(() => {
    let alive = true;
    setDoc(null); setErr(null); setLoading(true);
    (async () => {
      try {
        let d = null;
        // { nos: [no] } = ให้ Supabase กรองมาให้ใบเดียว — เดิมโหลดเอกสารทั้งบริษัทมาแล้ว .find() ทิ้งเกือบหมด
        if (type === "boq") d = (await listBoqs({ nos: [no] })).find((x) => x.boq_no === no);
        else if (type === "quote") d = (await listQuotations({ nos: [no] })).find((x) => x.quote_no === no);
        else if (type === "invoice") d = (await listInvoices({ nos: [no] })).find((x) => x.invoice_no === no);
        else if (type === "receipt") d = (await listReceipts({ nos: [no] })).find((x) => x.receipt_no === no);
        else if (type === "po") {
          const [l, mats] = await Promise.all([listPurchaseOrders(), listMaterialsLite().catch(() => [])]);
          d = l.find((x) => x.po_no === no);
          if (d) { const mm = Object.fromEntries(mats.map((m) => [m.code, m])); d = { ...d, _poLines: d.items.map((it) => ({ name: mm[it.material_code]?.th || it.material_code, qty: it.qty, unit: it.unit || mm[it.material_code]?.unit || "", price: it.price })) }; }
        }
        else if (type === "billing") d = (await listBillingNotes()).find((x) => x.billing_no === no);
        else if (type === "job") d = (await listJobOrders()).find((x) => x.job_no === no);
        if (alive) { setDoc(d || null); setLoading(false); }
      } catch (e) { if (alive) { setErr(e.message || String(e)); setLoading(false); } }
    })();
    return () => { alive = false; };
  }, [type, no]);

  // ทำบรรทัดรายการให้เป็นรูปเดียวกันทุกชนิดเอกสาร
  const lines = React.useMemo(() => {
    if (!doc || type === "job") return [];   // ใบงานไม่มีบรรทัดราคา — โชว์รายละเอียดงานแทน
    const arr = type === "po" ? (doc._poLines || []) : (doc.items || []);
    return arr.map((it) => {
      const qty = Number(it.qty) || 0;
      const price = Number(it.price_show ?? it.unit_price ?? it.price ?? it.unit_cost) || 0;   // price_show = ราคาตามวิธีชำระ (ใบเสนอราคาแบบบัตร)
      const disc = Number(it.discount) || 0;   // ส่วนลดรายรายการ (mig 142)
      // snapshot ของใบส่งของ/ใบเสร็จเก็บ amount สุทธิ (หักส่วนลดแล้ว) — ใช้ค่านั้นก่อน ค่อย fallback คำนวณเอง
      return { name: it.name || it.item_code || it.material_code || "-", qty, unit: it.unit || "", price, amount: it.amount != null ? (Number(it.amount) || 0) : qty * price - disc, disc, free: it.section === "free" };
    });
  }, [doc, type]);

  const stKey = doc?.status;
  const payTh = type === "po" && doc ? ({ unpaid: "ยังไม่จ่าย", pending: "รออนุมัติจ่าย", paid: "จ่ายแล้ว" }[doc.paymentStatus] || null) : null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="drawer-head-row">
            <span className="drawer-ico" style={{ background: `color-mix(in srgb, ${M.color} 14%, white)`, color: M.color }}>
              <UIcon name={type === "po" ? "purchase" : "clipboard"} size={20} strokeWidth={1.9} />
            </span>
            <div>
              <div className="drawer-title">{M.th}</div>
              <div className="drawer-en">{no}</div>
            </div>
            <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
          </div>
          <button className="btn-primary" style={{ width: "100%" }} onClick={onOpenFull}>เปิดหน้าเต็ม (แก้ไข/พิมพ์) ↗</button>
        </div>

        <div style={{ overflowY: "auto", padding: "16px 22px 28px", flex: 1 }}>
          {loading && <div className="empty">กำลังโหลด…</div>}
          {err && <div className="empty" style={{ color: "var(--down)" }}>โหลดไม่สำเร็จ: {err}</div>}
          {!loading && !err && !doc && <div className="empty">ไม่พบเอกสาร {no}</div>}
          {doc && (
            <>
              <div className="cd-grid">
                <div className="cd-k">{type === "po" ? "ผู้ขาย" : "ลูกค้า"}</div><div className="cd-v"><b>{type === "po" ? (doc.supplier || "-") : (doc.customerName || "-")}</b></div>
                <div className="cd-k">วันที่</div><div className="cd-v">{fmtDocDate(doc.issue_date || doc.created_at) || "-"}</div>
                {stKey && <><div className="cd-k">สถานะ</div><div className="cd-v">{(type === "job" ? JOB_ST[stKey] : type === "billing" ? ({ open: "วางบิล", cancelled: "ยกเลิก" }[stKey]) : ST_TH[stKey]) || stKey}{payTh ? <span className="jo-dim"> · 💳 {payTh}</span> : ""}</div></>}
                {doc.title && <><div className="cd-k">ชื่องาน</div><div className="cd-v">{doc.title}</div></>}
                {(type === "po" || type === "job") && doc.quote_no && <><div className="cd-k">อ้างอิง</div><div className="cd-v">{doc.quote_no}</div></>}
                {type === "invoice" && doc.due_date && <><div className="cd-k">ครบกำหนด</div><div className="cd-v">{fmtDocDate(doc.due_date)}</div></>}
                {type === "job" && doc.teamName && <><div className="cd-k">ทีมช่าง</div><div className="cd-v">🔧 {doc.teamName}</div></>}
                {type === "job" && doc.scheduled_at && <><div className="cd-k">นัดหมาย</div><div className="cd-v">📅 {fmtDocDate(doc.scheduled_at)}</div></>}
                {type === "job" && doc.address && <><div className="cd-k">ที่อยู่</div><div className="cd-v">📍 {doc.address}</div></>}
              </div>
              {type === "job" && doc.details && (
                <><div className="cd-sec">รายละเอียดงาน</div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>{doc.details}</div></>
              )}
              {type === "billing" && (doc.invoices || []).length > 0 && (
                <>
                  <div className="cd-sec">ใบส่งของ/ใบแจ้งหนี้ในใบวางบิล ({doc.invoices.length})</div>
                  {doc.invoices.map((iv) => (
                    <div key={iv.invoice_no} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: "1px dashed var(--line-2)", fontSize: 12.5, opacity: iv.status === "cancelled" ? 0.55 : 1 }}>
                      <span style={{ flex: 1 }}>{iv.invoice_no}<span className="jo-dim"> · งวด {iv.installment} · {Math.round(iv.pct)}%</span>{iv.status === "cancelled" && <span className="job-badge b-red" style={{ marginLeft: 6 }}>ยกเลิก · ไม่รวมยอด</span>}</span>
                      <span style={{ fontWeight: 700, whiteSpace: "nowrap", textDecoration: iv.status === "cancelled" ? "line-through" : "none" }}>{fmtBaht(iv.total)}</span>
                    </div>
                  ))}
                </>
              )}

              {lines.length > 0 && (
                <>
                  <div className="cd-sec">รายการ ({lines.length})</div>
                  {lines.map((l, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: "1px dashed var(--line-2)", fontSize: 12.5 }}>
                      <span style={{ flex: 1 }}>{l.name}</span>
                      <span style={{ color: "var(--ink-3)", whiteSpace: "nowrap" }}>{fmtNum(l.qty)} {l.unit} × {fmtBaht(l.price)}{l.disc > 0 && <span style={{ color: "var(--down)" }}> −{fmtBaht(l.disc)}</span>}</span>
                      <span style={{ fontWeight: 700, whiteSpace: "nowrap", minWidth: 78, textAlign: "right" }}>{l.free ? "แถม" : fmtBaht(l.amount)}</span>
                    </div>
                  ))}
                </>
              )}

              <div style={{ marginTop: 14, background: "var(--surface-2)", borderRadius: 12, padding: "10px 14px" }}>
                {type === "quote" && <>
                  <PeekRow l="รวมเป็นเงิน" v={fmtBaht(doc.subtotal)} />
                  {doc.discount > 0 && <PeekRow l="ส่วนลด" v={"− " + fmtBaht(doc.discount)} />}
                  {doc.vat ? <PeekRow l="VAT 7%" v={fmtBaht(doc.vatAmt)} /> : null}
                  <PeekRow big l="รวมทั้งสิ้น" v={fmtBaht(doc.grand)} />
                </>}
                {type === "boq" && <PeekRow big l="ต้นทุนรวมทั้งสิ้น" v={fmtBaht(doc.total)} />}
                {type === "invoice" && <>
                  {doc.installment != null && doc.pct != null ? <PeekRow l="งวด" v={`งวดที่ ${doc.installment} · ${doc.pct}%`} /> : null}
                  {Number(doc.wht_amt) > 0 && <PeekRow l="หัก ณ ที่จ่าย" v={"− " + fmtBaht(doc.wht_amt)} />}
                  <PeekRow big l="ยอดบิล" v={fmtBaht(doc.total)} />
                </>}
                {type === "receipt" && <>
                  {Number(doc.wht_amt) > 0 && <PeekRow l="หัก ณ ที่จ่าย" v={"− " + fmtBaht(doc.wht_amt)} />}
                  <PeekRow big l="รับชำระสุทธิ" v={fmtBaht(doc.net || doc.total)} />
                </>}
                {type === "billing" && <>
                  <PeekRow l="ยอดวางบิลรวม" v={fmtBaht(doc.total)} />
                  {Number(doc.wht) > 0 && <PeekRow l="หัก ณ ที่จ่าย" v={"− " + fmtBaht(doc.wht)} />}
                  <PeekRow big l="ยอดสุทธิที่ต้องชำระ" v={fmtBaht(doc.net || doc.total)} />
                </>}
                {type === "po" && <>
                  <PeekRow l="ยอดก่อน VAT" v={fmtBaht(doc.subtotal)} />
                  {doc.vat ? <PeekRow l="VAT 7%" v={fmtBaht(doc.vatAmt)} /> : null}
                  <PeekRow big l={"รวมทั้งสิ้น" + (doc.vat ? " (รวม VAT)" : "")} v={fmtBaht(doc.total)} />
                </>}
                {type === "job" && (Number(doc.quoteGrand) > 0
                  ? <PeekRow big l="มูลค่างาน (ตามใบเสนอ)" v={fmtBaht(doc.quoteGrand)} />
                  : <PeekRow l="ประเภทงาน" v={doc.job_type ? jobTypeDef(doc.job_type)[1] : "-"} />)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PeekRow({ l, v, big }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: big ? 15 : 12.5, fontWeight: big ? 800 : 500 }}>
      <span style={{ color: big ? "var(--ink)" : "var(--ink-2)" }}>{l}</span><span>{v}</span>
    </div>
  );
}

// hook สำเร็จรูปให้ทุกหน้าใช้ซ้ำ: const [peekEl, openPeek] = useDocPeek(onOpenDoc)
// openPeek(type, no) → ชนิดที่รองรับ (boq/quote/invoice/receipt/po) เปิดพรีวิวแผงขวาก่อน ·
// ชนิดอื่น (เช่น job) ส่งต่อการนำทางเดิมทันที · ปุ่ม "เปิดหน้าเต็ม" ใช้ตัวนำทางเดิมเสมอ
export function useDocPeek(nav) {
  const [peek, setPeek] = React.useState(null);
  const open = (t, n) => (META[t] ? setPeek({ type: t, no: n }) : (nav && nav(t, n)));
  const element = peek ? (
    <DocPeek type={peek.type} no={peek.no} onClose={() => setPeek(null)}
      onOpenFull={() => { const p = peek; setPeek(null); nav && nav(p.type, p.no); }} />
  ) : null;
  return [element, open];
}
