import React from "react";
import { listQuotations, listBoqs, listJobOrders, listProfiles, listTeams } from "../lib/api";
import { fmtBaht } from "../lib/format";

// Sales & profit report from APPROVED quotations:
//  - total approved sales
//  - per salesperson (who created the quote)
//  - per technician team (assigned to the job created from that quote)
// Cost & profit use the linked BOQ cost (net sale before VAT − BOQ cost), same basis as the Profit page.
export default function SalesReport() {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    Promise.all([listQuotations(), listBoqs(), listJobOrders(), listProfiles(), listTeams()])
      .then(([qs, bs, jos, profs, teams]) => {
        if (!alive) return;
        const boqCost = Object.fromEntries(bs.map((b) => [b.boq_no, b.total]));
        const profName = Object.fromEntries((profs || []).map((p) => [p.id, p.name || p.email]));
        const teamName = Object.fromEntries(teams.map((t) => [t.id, t.name]));
        const jobByQuote = {}; jos.forEach((j) => { if (j.quote_no && !jobByQuote[j.quote_no]) jobByQuote[j.quote_no] = j; });

        const approved = qs.filter((q) => q.status === "approved");
        const z = () => ({ sale: 0, cost: 0, hasCost: false, count: 0 });
        const bySales = {}, byTeam = {};
        let totalSale = 0, totalCost = 0;
        approved.forEach((q) => {
          const sale = q.afterDisc || 0;
          const cost = q.boq_no && boqCost[q.boq_no] != null ? boqCost[q.boq_no] : null;
          totalSale += sale; if (cost != null) totalCost += cost;
          const sid = q.created_by || "__unknown__";
          (bySales[sid] = bySales[sid] || z());
          bySales[sid].sale += sale; bySales[sid].count++;
          if (cost != null) { bySales[sid].cost += cost; bySales[sid].hasCost = true; }
          const job = jobByQuote[q.quote_no];
          const tid = job?.assigned_team || "__none__";
          (byTeam[tid] = byTeam[tid] || z());
          byTeam[tid].sale += sale; byTeam[tid].count++;
          if (cost != null) { byTeam[tid].cost += cost; byTeam[tid].hasCost = true; }
        });
        const mk = (entries, label) => Object.entries(entries)
          .map(([id, v]) => ({ id, name: label(id), ...v, profit: v.hasCost ? v.sale - v.cost : null }))
          .sort((a, b) => b.sale - a.sale);
        const salesRows = mk(bySales, (id) => id === "__unknown__" ? "ไม่ทราบผู้ทำ" : (profName[id] || "ไม่ทราบผู้ทำ"));
        const teamRows = mk(byTeam, (id) => id === "__none__" ? "ยังไม่มอบช่าง" : (teamName[id] || id));
        setData({ totalSale, totalCost, totalProfit: totalSale - totalCost, count: approved.length, salesRows, teamRows });
      })
      .catch((e) => { if (alive) setErr(e.message || String(e)); });
    return () => { alive = false; };
  }, []);

  if (err) return <div className="empty" style={{ color: "var(--down)" }}>โหลดรายงานยอดขายไม่สำเร็จ: {err}</div>;
  if (!data) return <div className="empty">กำลังโหลดรายงานยอดขาย…</div>;

  const margin = data.totalSale > 0 ? (data.totalProfit / data.totalSale) * 100 : 0;

  const Table = ({ title, sub, rows, nameHead }) => (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="sec-head" style={{ padding: "16px 18px 0" }}><div><div className="sec-title">{title}</div><div className="sec-sub">{sub}</div></div></div>
      {rows.length === 0 && <div className="empty sm" style={{ padding: 18 }}>ยังไม่มีข้อมูล</div>}
      {rows.length > 0 && (
        <div style={{ padding: "10px 0 4px" }}>
          <div className="pf-row pf-head"><span>{nameHead}</span><span className="r">ยอดขาย</span><span className="r">ต้นทุน</span><span className="r">กำไร</span></div>
          {rows.map((r) => (
            <div className="pf-row" key={r.id}>
              <span className="pf-name"><b>{r.name}</b><br /><span className="pf-cust">{r.count} ใบ</span></span>
              <span className="r">{fmtBaht(r.sale)}</span>
              <span className="r">{r.hasCost ? fmtBaht(r.cost) : "—"}</span>
              <span className="r" style={{ color: r.profit == null ? "var(--ink-3)" : r.profit >= 0 ? "var(--up)" : "var(--down)", fontWeight: 700 }}>{r.profit == null ? "—" : fmtBaht(r.profit)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="sales-report">
      <div className="sec-head" style={{ marginBottom: 12 }}><div><div className="sec-title">รายงานยอดขาย & กำไร</div><div className="sec-sub">จากใบเสนอราคาที่อนุมัติแล้ว · ยอดสุทธิก่อน VAT − ต้นทุน BOQ</div></div></div>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-val">{fmtBaht(data.totalSale)}</div><div className="stat-label">ยอดขายทั้งหมด (อนุมัติ)</div><div className="stat-sub">{data.count} ใบ</div></div>
        <div className="stat-card"><div className="stat-val">{fmtBaht(data.totalCost)}</div><div className="stat-label">ต้นทุนรวม (จาก BOQ)</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: data.totalProfit >= 0 ? "var(--up)" : "var(--down)" }}>{fmtBaht(data.totalProfit)}</div><div className="stat-label">กำไรรวม</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: "var(--up)" }}>{margin.toFixed(1)}%</div><div className="stat-label">มาร์จินเฉลี่ย</div></div>
      </div>
      <div className="sr-tables">
        <Table title="ยอดขายรายคน · พนักงานขาย" sub="Sales by salesperson" rows={data.salesRows} nameHead="พนักงานขาย" />
        <Table title="ยอดขาย / ต้นทุน / กำไร · รายทีมช่าง" sub="By technician team (งานที่อ้างใบเสนอราคา)" rows={data.teamRows} nameHead="ทีมช่าง" />
      </div>
      <p className="page-sub" style={{ marginTop: 12 }}>* ต้นทุน/กำไรคิดเฉพาะใบที่ผูก BOQ · ทีมช่างอิงจากใบงานที่สร้างจากใบเสนอราคานั้น (ใบที่ยังไม่ออกใบงานจะอยู่ใน "ยังไม่มอบช่าง")</p>
    </div>
  );
}
