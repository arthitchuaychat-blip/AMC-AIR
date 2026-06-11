import React from "react";
import { listQuotations, listBoqs } from "../lib/api";
import { fmtBaht, fmtNum } from "../lib/format";
import { UIcon } from "../icons";

export default function Profit() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const [qs, bs] = await Promise.all([listQuotations(), listBoqs()]);
      const boqCost = Object.fromEntries(bs.map((b) => [b.boq_no, b.total]));
      const approved = qs.filter((q) => q.status === "approved");
      setRows(approved.map((q) => {
        const cost = q.boq_no && boqCost[q.boq_no] != null ? boqCost[q.boq_no] : null;
        const sale = q.afterDisc; // net sale before VAT
        const profit = cost == null ? null : sale - cost;
        const margin = cost == null || sale <= 0 ? null : (profit / sale) * 100;
        return { q, sale, cost, profit, margin };
      }));
    } catch (e) { setErr(e.message || String(e)); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);

  const withCost = rows.filter((r) => r.cost != null);
  const sumSale = withCost.reduce((a, r) => a + r.sale, 0);
  const sumCost = withCost.reduce((a, r) => a + r.cost, 0);
  const sumProfit = sumSale - sumCost;
  const margin = sumSale > 0 ? (sumProfit / sumSale) * 100 : 0;

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">กำไร <span className="page-title-en">Profit (Approved)</span></h1>
          <p className="page-sub">ยอดขายสุทธิ (ก่อน VAT) − ต้นทุน BOQ · เฉพาะใบเสนอราคาที่อนุมัติแล้ว</p></div>
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {err && <div className="empty" style={{ color: "var(--down)" }}>โหลดไม่สำเร็จ: {err}</div>}

      {!loading && !err && (
        <>
          <div className="kpi-grid">
            <div className="stat-card"><div className="stat-val">{fmtBaht(sumSale)}</div><div className="stat-label">ยอดขายรวม (อนุมัติ)</div><div className="stat-sub">{rows.length} ใบ</div></div>
            <div className="stat-card"><div className="stat-val">{fmtBaht(sumCost)}</div><div className="stat-label">ต้นทุนรวม (จาก BOQ)</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: sumProfit >= 0 ? "var(--up)" : "var(--down)" }}>{fmtBaht(sumProfit)}</div><div className="stat-label">กำไรรวม</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: "var(--up)" }}>{margin.toFixed(1)}%</div><div className="stat-label">มาร์จินเฉลี่ย</div></div>
          </div>

          {rows.length === 0 && <div className="empty">ยังไม่มีใบเสนอราคาที่อนุมัติ</div>}
          {rows.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="pf-row pf-head"><span>เลขที่ / ลูกค้า</span><span className="r">ยอดขาย</span><span className="r">ต้นทุน BOQ</span><span className="r">กำไร</span><span className="r">%</span></div>
              {rows.map(({ q, sale, cost, profit, margin }) => (
                <div className="pf-row" key={q.quote_no}>
                  <span className="pf-name"><b>{q.quote_no}</b><br /><span className="pf-cust">{q.customerName || "-"}{q.boq_no ? ` · ${q.boq_no}` : " · ไม่อ้าง BOQ"}</span></span>
                  <span className="r">{fmtBaht(sale)}</span>
                  <span className="r">{cost == null ? "—" : fmtBaht(cost)}</span>
                  <span className="r" style={{ color: profit == null ? "var(--ink-3)" : profit >= 0 ? "var(--up)" : "var(--down)", fontWeight: 700 }}>{profit == null ? "—" : fmtBaht(profit)}</span>
                  <span className="r" style={{ color: "var(--ink-3)" }}>{margin == null ? "—" : margin.toFixed(0) + "%"}</span>
                </div>
              ))}
            </div>
          )}
          <p className="page-sub" style={{ marginTop: 12 }}>* ใบที่ "ไม่อ้าง BOQ" จะคำนวณต้นทุน/กำไรไม่ได้ (ต้องผูก BOQ ในใบเสนอราคา) · ยอดขายเป็นราคาก่อน VAT</p>
        </>
      )}
    </div>
  );
}
