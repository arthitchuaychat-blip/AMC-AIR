import React from "react";
import { listQuotations, listBoqs, listJobOrders, listProfiles, listTeams } from "../lib/api";
import { fmtBaht, inRange } from "../lib/format";
import { UIcon } from "../icons";

// Sales & profit report from APPROVED quotations within the selected date range:
//  - total approved sales · per salesperson · per technician team
// Click any KPI / row to drill into the line items, then jump straight to the quotation or job order.
export default function SalesReport({ onOpenQuote, onOpenJob, from, to }) {
  const [raw, setRaw] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [detail, setDetail] = React.useState(null); // { title, quotes:[...] }

  React.useEffect(() => {
    let alive = true;
    Promise.all([listQuotations(), listBoqs(), listJobOrders(), listProfiles(), listTeams()])
      .then(([qs, bs, jos, profs, teams]) => { if (alive) setRaw({ qs, bs, jos, profs, teams }); })
      .catch((e) => { if (alive) setErr(e.message || String(e)); });
    return () => { alive = false; };
  }, []);

  const data = React.useMemo(() => {
    if (!raw) return null;
    const { qs, bs, jos, profs, teams } = raw;
    const boqCost = Object.fromEntries(bs.map((b) => [b.boq_no, b.total]));
    const profName = Object.fromEntries((profs || []).map((p) => [p.id, p.name || p.email]));
    const teamName = Object.fromEntries(teams.map((t) => [t.id, t.name]));
    const jobByQuote = {}; jos.forEach((j) => { if (j.quote_no && !jobByQuote[j.quote_no]) jobByQuote[j.quote_no] = j; });

    const approved = qs.filter((q) => q.status === "approved" && inRange(q.approved_at || q.issue_date, from, to));
    const z = () => ({ sale: 0, cost: 0, hasCost: false, count: 0 });
    const bySales = {}, byTeam = {};
    let totalSale = 0, totalCost = 0;
    const quotes = approved.map((q) => {
      const sale = q.afterDisc || 0;
      const cost = q.boq_no && boqCost[q.boq_no] != null ? boqCost[q.boq_no] : null;
      totalSale += sale; if (cost != null) totalCost += cost;
      const sid = q.created_by || "__unknown__";
      const job = jobByQuote[q.quote_no];
      const tid = job?.assigned_team || "__none__";
      (bySales[sid] = bySales[sid] || z());
      bySales[sid].sale += sale; bySales[sid].count++;
      if (cost != null) { bySales[sid].cost += cost; bySales[sid].hasCost = true; }
      (byTeam[tid] = byTeam[tid] || z());
      byTeam[tid].sale += sale; byTeam[tid].count++;
      if (cost != null) { byTeam[tid].cost += cost; byTeam[tid].hasCost = true; }
      return { quote_no: q.quote_no, customerName: q.customerName, sale, cost, profit: cost == null ? null : sale - cost,
        salesId: sid, salesName: sid === "__unknown__" ? "ไม่ทราบผู้ทำ" : (profName[sid] || "ไม่ทราบผู้ทำ"),
        teamId: tid, teamName: tid === "__none__" ? "ยังไม่มอบช่าง" : (teamName[tid] || tid), job_no: job?.job_no || null };
    });
    const mk = (entries, label) => Object.entries(entries)
      .map(([id, v]) => ({ id, name: label(id), ...v, profit: v.hasCost ? v.sale - v.cost : null }))
      .sort((a, b) => b.sale - a.sale);
    const salesRows = mk(bySales, (id) => id === "__unknown__" ? "ไม่ทราบผู้ทำ" : (profName[id] || "ไม่ทราบผู้ทำ"));
    const teamRows = mk(byTeam, (id) => id === "__none__" ? "ยังไม่มอบช่าง" : (teamName[id] || id));
    return { totalSale, totalCost, totalProfit: totalSale - totalCost, count: approved.length, salesRows, teamRows, quotes };
  }, [raw, from, to]);

  if (err) return <div className="empty" style={{ color: "var(--down)" }}>โหลดรายงานยอดขายไม่สำเร็จ: {err}</div>;
  if (!data) return <div className="empty">กำลังโหลดรายงานยอดขาย…</div>;

  const margin = data.totalSale > 0 ? (data.totalProfit / data.totalSale) * 100 : 0;
  const openAll = () => setDetail({ title: "ใบเสนอราคาที่อนุมัติทั้งหมด", quotes: data.quotes });
  const openSales = (r) => setDetail({ title: `ยอดขาย · ${r.name}`, quotes: data.quotes.filter((q) => q.salesId === r.id) });
  const openTeam = (r) => setDetail({ title: `งานทีม · ${r.name}`, quotes: data.quotes.filter((q) => q.teamId === r.id) });

  const Table = ({ title, sub, rows, nameHead, onRow }) => (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="sec-head" style={{ padding: "16px 18px 0" }}><div><div className="sec-title">{title}</div><div className="sec-sub">{sub}</div></div></div>
      {rows.length === 0 && <div className="empty sm" style={{ padding: 18 }}>ยังไม่มีข้อมูล</div>}
      {rows.length > 0 && (
        <div style={{ padding: "10px 0 4px" }}>
          <div className="pf-row pf-head"><span>{nameHead}</span><span className="r">ยอดขาย</span><span className="r">ต้นทุน</span><span className="r">กำไร</span></div>
          {rows.map((r) => (
            <div className="pf-row pf-click" key={r.id} onClick={() => onRow(r)}>
              <span className="pf-name"><b>{r.name}</b><br /><span className="pf-cust">{r.count} ใบ · ดูรายการ ›</span></span>
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
      <div className="sec-head" style={{ marginBottom: 12 }}><div><div className="sec-title">รายงานยอดขาย & กำไร</div><div className="sec-sub">จากใบเสนอราคาที่อนุมัติแล้ว · ยอดสุทธิก่อน VAT − ต้นทุน BOQ · กดดูรายการได้</div></div></div>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card clickable" onClick={openAll} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openAll()}>
          <div className="stat-val">{fmtBaht(data.totalSale)}</div><div className="stat-label">ยอดขายทั้งหมด (อนุมัติ)</div><div className="stat-sub">{data.count} ใบ</div>
          <div className="stat-more">ดูรายการ <UIcon name="chevR" size={13} strokeWidth={2.2} color="currentColor" /></div>
        </div>
        <div className="stat-card clickable" onClick={openAll} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openAll()}>
          <div className="stat-val">{fmtBaht(data.totalCost)}</div><div className="stat-label">ต้นทุนรวม (จาก BOQ)</div>
          <div className="stat-more">ดูรายการ <UIcon name="chevR" size={13} strokeWidth={2.2} color="currentColor" /></div>
        </div>
        <div className="stat-card clickable" onClick={openAll} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openAll()}>
          <div className="stat-val" style={{ color: data.totalProfit >= 0 ? "var(--up)" : "var(--down)" }}>{fmtBaht(data.totalProfit)}</div><div className="stat-label">กำไรรวม</div>
          <div className="stat-more">ดูรายการ <UIcon name="chevR" size={13} strokeWidth={2.2} color="currentColor" /></div>
        </div>
        <div className="stat-card"><div className="stat-val" style={{ color: "var(--up)" }}>{margin.toFixed(1)}%</div><div className="stat-label">มาร์จินเฉลี่ย</div></div>
      </div>
      <div className="sr-tables">
        <Table title="ยอดขายรายคน · พนักงานขาย" sub="Sales by salesperson · กดเพื่อดูรายการ" rows={data.salesRows} nameHead="พนักงานขาย" onRow={openSales} />
        <Table title="ยอดขาย / ต้นทุน / กำไร · รายทีมช่าง" sub="By technician team · กดเพื่อดูรายการ" rows={data.teamRows} nameHead="ทีมช่าง" onRow={openTeam} />
      </div>
      <p className="page-sub" style={{ marginTop: 12 }}>* ต้นทุน/กำไรคิดเฉพาะใบที่ผูก BOQ · ทีมช่างอิงจากใบงานที่สร้างจากใบเสนอราคานั้น (ใบที่ยังไม่ออกใบงานจะอยู่ใน "ยังไม่มอบช่าง")</p>

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal sr-detail" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">{detail.title} <span>{detail.quotes.length} ใบ</span></div>
              <button className="modal-x" onClick={() => setDetail(null)}><UIcon name="x" size={18} /></button>
            </div>
            <div className="sr-detail-body">
              <div className="pf-row pf-head"><span>เลขที่ / ลูกค้า / ทีม</span><span className="r">ยอดขาย</span><span className="r">ต้นทุน</span><span className="r">กำไร</span><span className="sr-links-head">เปิด</span></div>
              {detail.quotes.map((q) => (
                <div className="pf-row sr-detail-row" key={q.quote_no}>
                  <span className="pf-name"><b>{q.quote_no}</b><br /><span className="pf-cust">{q.customerName || "-"} · {q.teamName}</span></span>
                  <span className="r">{fmtBaht(q.sale)}</span>
                  <span className="r">{q.cost == null ? "—" : fmtBaht(q.cost)}</span>
                  <span className="r" style={{ color: q.profit == null ? "var(--ink-3)" : q.profit >= 0 ? "var(--up)" : "var(--down)", fontWeight: 700 }}>{q.profit == null ? "—" : fmtBaht(q.profit)}</span>
                  <span className="sr-links">
                    <button className="btn-ghost sm" onClick={() => { setDetail(null); onOpenQuote && onOpenQuote(q.quote_no); }}>ใบเสนอราคา</button>
                    {q.job_no
                      ? <button className="btn-ghost sm" onClick={() => { setDetail(null); onOpenJob && onOpenJob(q.job_no); }}>ใบงาน</button>
                      : <span className="sr-nojob">ยังไม่ออกใบงาน</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
