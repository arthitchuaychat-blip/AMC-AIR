import React from "react";
import { listQuotations, listBoqs, listJobOrders, listProfiles, listTeams, jobMaterialCost, jobExpenseCost, listPurchaseOrders } from "../lib/api";
import { fmtBaht, inRange } from "../lib/format";
import { UIcon } from "../icons";

// Sales & profit report from APPROVED quotations within the selected date range:
//  - total approved sales · per salesperson · per technician team · กำไรต่องาน (per-job P&L)
// Click any KPI / row to drill into the line items, then jump straight to the quotation or job order.
// Per-job net profit mirrors the "กำไร/งาน" page: ยอดขาย − ต้นทุน BOQ − วัสดุเบิกจริง − ค่าแรงช่างซัพ − เบิกจ่าย.
export default function SalesReport({ onOpenQuote, onOpenJob, from, to }) {
  const [raw, setRaw] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [detail, setDetail] = React.useState(null);    // { title, quotes:[...] } — salesperson/team drill-down
  const [jobDetail, setJobDetail] = React.useState(null); // one job's full P&L waterfall

  React.useEffect(() => {
    let alive = true;
    Promise.all([listQuotations(), listBoqs(), listJobOrders(), listProfiles(), listTeams(), jobMaterialCost(), jobExpenseCost(), listPurchaseOrders().catch(() => [])])
      .then(([qs, bs, jos, profs, teams, mat, exp, pos]) => { if (alive) setRaw({ qs, bs, jos, profs, teams, mat, exp, pos }); })
      .catch((e) => { if (alive) setErr(e.message || String(e)); });
    return () => { alive = false; };
  }, []);

  const data = React.useMemo(() => {
    if (!raw) return null;
    const { qs, bs, jos, profs, teams, mat, exp, pos } = raw;
    // ใบสั่งซื้อผูกงานที่ "ยังรอรับของ" = ต้นทุนที่สั่ง/ผูกพันแล้วของงานนั้น (ราคาก่อน VAT)
    // นับเฉพาะสถานะ open — พอรับของ ระบบเบิกเข้างานอัตโนมัติ ต้นทุนจะย้ายไปอยู่ใน "เบิกจริง" แทน (ไม่นับซ้ำ)
    const poPendByQuote = {};
    (pos || []).forEach((p) => { if (p.quote_no && p.status === "open") poPendByQuote[p.quote_no] = (poPendByQuote[p.quote_no] || 0) + (Number(p.subtotal) || 0); });
    const boqCost = Object.fromEntries(bs.map((b) => [b.boq_no, b.total]));
    const profName = Object.fromEntries((profs || []).map((p) => [p.id, p.name || p.email]));
    const teamName = Object.fromEntries(teams.map((t) => [t.id, t.name]));
    const jobByQuote = {}; jos.forEach((j) => { if (j.quote_no && !jobByQuote[j.quote_no]) jobByQuote[j.quote_no] = j; });
    // all (non-cancelled) job orders per quote → sum actual materials + สับ labor + reimbursements across every job of the งาน
    const jobsByQuote = {}; jos.forEach((j) => { if (j.quote_no && j.status !== "cancelled") (jobsByQuote[j.quote_no] = jobsByQuote[j.quote_no] || []).push(j); });

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
      // actual spend beyond the BOQ estimate — summed over every job order under this quote
      const qJobs = jobsByQuote[q.quote_no] || [];
      let matNet = 0, labor = 0, expenseReim = 0;
      qJobs.forEach((j) => {
        const m = mat[j.job_no] || { withdraw: 0, return: 0 };
        matNet += (Number(m.withdraw) || 0) - (Number(m.return) || 0);
        labor += Number(j.labor_total) || 0;
        expenseReim += Number(exp[j.job_no]) || 0;
      });
      // สูตรต้นทุนจริง (เลือกโดยผู้ใช้ 2026-07-04): กำไรสุทธิ = ขาย − ต้นทุนจริง
      // ต้นทุนจริง = วัสดุ/แอร์เบิกจริง−คืน + ค่าแรงซัพ + เบิกจ่าย + ค่าสินค้าตาม PO ผูกงานที่ยังรอรับของ
      // BOQ ใช้เป็น "กำไรตามประมาณการ" ไว้เทียบเท่านั้น — ห้ามหักซ้อนกับของจริง
      const poPend = poPendByQuote[q.quote_no] || 0;
      const expenses = matNet + labor + expenseReim + poPend;     // ต้นทุนจริงทั้งหมด
      const grossProfit = cost == null ? null : sale - cost;      // กำไรตามประมาณการ (BOQ)
      const net = expenses > 0 ? sale - expenses : null;          // ยังไม่มีต้นทุนจริงบันทึก → ไม่โชว์กำไรลวง
      const jobMargin = net == null || sale <= 0 ? null : (net / sale) * 100;
      return { quote_no: q.quote_no, customerName: q.customerName, sale, cost, profit: grossProfit,
        salesId: sid, salesName: sid === "__unknown__" ? "ไม่ทราบผู้ทำ" : (profName[sid] || "ไม่ทราบผู้ทำ"),
        teamId: tid, teamName: tid === "__none__" ? "ยังไม่มอบช่าง" : (teamName[tid] || tid), job_no: job?.job_no || null,
        jobCount: qJobs.length, matNet, labor, expenseReim, poPend, expenses, grossProfit, net, jobMargin,
        vat: q.vatAmt || 0, wht: q.whtAmt || 0, grand: q.grand || sale };
    });
    const mk = (entries, label) => Object.entries(entries)
      .map(([id, v]) => ({ id, name: label(id), ...v, profit: v.hasCost ? v.sale - v.cost : null }))
      .sort((a, b) => b.sale - a.sale);
    const salesRows = mk(bySales, (id) => id === "__unknown__" ? "ไม่ทราบผู้ทำ" : (profName[id] || "ไม่ทราบผู้ทำ"));
    const teamRows = mk(byTeam, (id) => id === "__none__" ? "ยังไม่มอบช่าง" : (teamName[id] || id));
    // per-job P&L rows — best/worst first (jobs missing a BOQ cost sink to the bottom)
    const jobRows = [...quotes].sort((a, b) => {
      if (a.net == null && b.net == null) return b.sale - a.sale;
      if (a.net == null) return 1; if (b.net == null) return -1;
      return b.net - a.net;
    });
    return { totalSale, totalCost, totalProfit: totalSale - totalCost, count: approved.length, salesRows, teamRows, quotes, jobRows };
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
          <div className="pf-row pf-head"><span>{nameHead}</span><span className="r">ยอดขาย</span><span className="r">ต้นทุน (BOQ)</span><span className="r">กำไร (ประมาณ)</span></div>
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
          <div className="stat-val">{fmtBaht(data.totalCost)}</div><div className="stat-label">ต้นทุนประมาณการ (BOQ)</div>
          <div className="stat-more">ดูรายการ <UIcon name="chevR" size={13} strokeWidth={2.2} color="currentColor" /></div>
        </div>
        <div className="stat-card clickable" onClick={openAll} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openAll()}>
          <div className="stat-val" style={{ color: data.totalProfit >= 0 ? "var(--up)" : "var(--down)" }}>{fmtBaht(data.totalProfit)}</div><div className="stat-label">กำไรรวม (ประมาณการ)</div>
          <div className="stat-more">ดูรายการ <UIcon name="chevR" size={13} strokeWidth={2.2} color="currentColor" /></div>
        </div>
        <div className="stat-card"><div className="stat-val" style={{ color: "var(--up)" }}>{margin.toFixed(1)}%</div><div className="stat-label">มาร์จินเฉลี่ย</div></div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div className="sec-head" style={{ padding: "16px 18px 0" }}><div><div className="sec-title">กำไรต่องาน</div><div className="sec-sub">กำไรสุทธิ = ยอดขาย − <b>ต้นทุนจริง</b> (วัสดุ/แอร์เบิกจริง + ค่าแรงซัพ + เบิกจ่าย) · BOQ แสดงเป็นประมาณการไว้เทียบ · กดที่งานเพื่อดูรายละเอียด</div></div></div>
        {data.jobRows.length === 0 && <div className="empty sm" style={{ padding: 18 }}>ยังไม่มีงานที่อนุมัติในช่วงนี้</div>}
        {data.jobRows.length > 0 && (
          <div style={{ padding: "10px 0 4px", maxHeight: 460, overflowY: "auto" }}>
            <div className="pjob-row pjob-head"><span>เลขที่ / ลูกค้า / ทีม</span><span className="r">ยอดขาย</span><span className="r">ต้นทุนจริง</span><span className="r">กำไรสุทธิ (จริง)</span><span className="r">ประมาณการ (BOQ)</span><span className="r">%</span></div>
            {data.jobRows.map((q) => (
              <div className="pjob-row pjob-click" key={q.quote_no} onClick={() => setJobDetail(q)} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setJobDetail(q)}>
                <span className="pf-name"><b>{q.quote_no}</b><br /><span className="pf-cust">{q.customerName || "-"} · {q.teamName}{q.jobCount > 1 ? ` · ${q.jobCount} ใบงาน` : ""} · ดูรายละเอียด ›</span></span>
                <span className="r">{fmtBaht(q.sale)}</span>
                <span className="r">{q.expenses > 0 ? <span style={{ color: "var(--down)" }}>−{fmtBaht(q.expenses)}</span> : <span style={{ color: "var(--ink-3)" }}>ยังไม่บันทึก</span>}</span>
                <span className="r" style={{ color: q.net == null ? "var(--ink-3)" : q.net >= 0 ? "var(--up)" : "var(--down)", fontWeight: 700 }}>{q.net == null ? "—" : fmtBaht(q.net)}</span>
                <span className="r" style={{ color: "var(--ink-3)" }}>{q.grossProfit == null ? "—" : fmtBaht(q.grossProfit)}</span>
                <span className="r" style={{ color: "var(--ink-3)" }}>{q.jobMargin == null ? "—" : q.jobMargin.toFixed(0) + "%"}</span>
              </div>
            ))}
          </div>
        )}
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
              <div className="pf-row pf-head"><span>เลขที่ / ลูกค้า / ทีม</span><span className="r">ยอดขาย</span><span className="r">ต้นทุน (BOQ)</span><span className="r">กำไร (ประมาณ)</span><span className="sr-links-head">เปิด</span></div>
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

      {jobDetail && (() => {
        const q = jobDetail;
        const noCost = q.cost == null;
        return (
          <div className="modal-overlay" onClick={() => setJobDetail(null)}>
            <div className="modal pjob-detail" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div className="modal-title">กำไรต่องาน · {q.quote_no}<span>{q.customerName || "-"}</span></div>
                <button className="modal-x" onClick={() => setJobDetail(null)}><UIcon name="x" size={18} /></button>
              </div>
              <div className="pjob-wf">
                <div className="pjob-wf-sub" style={{ marginBottom: 6 }}>{q.teamName}{q.jobCount > 0 ? ` · ${q.jobCount} ใบงาน` : ""}</div>
                {q.vat > 0 && (
                  <>
                    <div className="pjob-wf-row"><span className="lbl">ยอดที่ลูกค้าจ่าย (รวม VAT)</span><span className="val">{fmtBaht(q.grand)}</span></div>
                    <div className="pjob-wf-row sub"><span className="lbl">− ภาษีมูลค่าเพิ่ม (VAT 7%)</span><span className="val" style={{ color: "var(--down)" }}>−{fmtBaht(q.vat)}</span></div>
                  </>
                )}
                <div className="pjob-wf-row mid"><span className="lbl">ยอดขายสุทธิ (ก่อน VAT)</span><span className="val">{fmtBaht(q.sale)}</span></div>
                {q.expenses > 0 ? (
                  <>
                    {q.matNet > 0.005 && <div className="pjob-wf-row sub"><span className="lbl">− วัสดุ/แอร์ที่เบิกใช้จริง (เบิก−คืน · รวมของจาก PO ที่รับแล้ว)</span><span className="val" style={{ color: "var(--down)" }}>−{fmtBaht(q.matNet)}</span></div>}
                    {q.poPend > 0.005 && <div className="pjob-wf-row sub"><span className="lbl">− ค่าสินค้าตามใบสั่งซื้อ (ผูกงาน · ยังรอรับของ)</span><span className="val" style={{ color: "var(--down)" }}>−{fmtBaht(q.poPend)}</span></div>}
                    {q.labor > 0.005 && <div className="pjob-wf-row sub"><span className="lbl">− ค่าแรงช่างซัพ</span><span className="val" style={{ color: "var(--down)" }}>−{fmtBaht(q.labor)}</span></div>}
                    {q.expenseReim > 0.005 && <div className="pjob-wf-row sub"><span className="lbl">− ค่าใช้จ่าย/เบิกจ่าย</span><span className="val" style={{ color: "var(--down)" }}>−{fmtBaht(q.expenseReim)}</span></div>}
                    <div className="pjob-wf-row mid"><span className="lbl">รวมต้นทุนจริงทั้งหมด</span><span className="val" style={{ color: "var(--down)" }}>−{fmtBaht(q.expenses)}</span></div>
                  </>
                ) : (
                  <div className="pjob-wf-row sub"><span className="lbl">ต้นทุนจริง (วัสดุ/แอร์เบิกจริง · ค่าแรงซัพ · เบิกจ่าย)</span><span className="val" style={{ color: "var(--ink-3)" }}>ยังไม่มีการบันทึก</span></div>
                )}
                <div className="pjob-wf-row total"><span className="lbl">กำไรสุทธิ (จากต้นทุนจริง)</span><span className="val" style={{ color: q.net == null ? "var(--ink-3)" : q.net >= 0 ? "var(--up)" : "var(--down)" }}>{q.net == null ? "ยังสรุปไม่ได้ — ยังไม่มีต้นทุนจริง" : fmtBaht(q.net)}</span></div>
                {q.jobMargin != null && <div className="pjob-wf-row" style={{ borderBottom: "none", paddingTop: 2 }}><span className="lbl">มาร์จินสุทธิ</span><span className="val" style={{ color: q.jobMargin >= 0 ? "var(--up)" : "var(--down)" }}>{q.jobMargin.toFixed(1)}%</span></div>}
                <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--surface-2)", borderRadius: 10, fontSize: 12.5, color: "var(--ink-3)" }}>
                  📐 ประมาณการตาม BOQ: {noCost ? "ไม่ได้ผูก BOQ" : <>ต้นทุน {fmtBaht(q.cost)} → กำไรประมาณการ <b style={{ color: q.grossProfit >= 0 ? "var(--up)" : "var(--down)" }}>{fmtBaht(q.grossProfit)}</b>{q.net != null && <> · ต่างจากจริง {fmtBaht(q.net - q.grossProfit)}</>}</>}
                </div>
                {q.wht > 0 && <div className="page-sub" style={{ marginTop: 10 }}>* ลูกค้าหัก ณ ที่จ่าย {fmtBaht(q.wht)} — เป็นภาษีที่เครดิต/ขอคืนได้ ไม่นับเป็นต้นทุน</div>}
                <div className="sr-links" style={{ justifyContent: "flex-start", marginTop: 14 }}>
                  <button className="btn-ghost sm" onClick={() => { setJobDetail(null); onOpenQuote && onOpenQuote(q.quote_no); }}>เปิดใบเสนอราคา</button>
                  {q.job_no
                    ? <button className="btn-ghost sm" onClick={() => { setJobDetail(null); onOpenJob && onOpenJob(q.job_no); }}>เปิดใบงาน</button>
                    : <span className="sr-nojob">ยังไม่ออกใบงาน</span>}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
