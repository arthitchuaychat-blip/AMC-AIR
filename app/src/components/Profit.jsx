import React from "react";
import { listQuotations, listBoqs, listJobOrders, jobMaterialCost } from "../lib/api";
import { fmtBaht } from "../lib/format";

// กำไร/งาน — 1 ใบเสนอราคา = 1 งาน (รวมทุกใบงานที่อยู่ใต้ใบเสนอราคานั้น รวมใบงานเชื่อม)
// ยอดขาย/ต้นทุน BOQ นับครั้งเดียวต่อใบเสนอราคา (ไม่ซ้ำซ้อน)
// กำไรขั้นต้น = ยอดขายสุทธิ (ก่อน VAT) − ต้นทุน BOQ
// กำไรสุทธิ/งาน = กำไรขั้นต้น − วัสดุที่เบิกใช้จริง (เบิก−คืน รวมทุกใบงาน) − ค่าแรงช่างซัพ (รวมทุกใบงาน)
const ST = { pending: "รอเริ่ม", in_progress: "กำลังทำ", awaiting_approval: "รออนุมัติ", reschedule: "ตั้งนัดเพิ่ม", done: "เสร็จ", cancelled: "ยกเลิก" };

export default function Profit() {
  const [rows, setRows] = React.useState([]);
  const [orphans, setOrphans] = React.useState([]);
  const [open, setOpen] = React.useState({});       // quote_no → expanded breakdown
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const [qs, bs, jos, mat] = await Promise.all([listQuotations(), listBoqs(), listJobOrders(), jobMaterialCost()]);
      const boqCost = Object.fromEntries(bs.map((b) => [b.boq_no, b.total]));
      const jobByNo = Object.fromEntries(jos.map((j) => [j.job_no, j]));
      // group job orders by quote (1 ใบเสนอราคา = 1 งาน)
      const jobsByQuote = {};
      jos.forEach((j) => { if (j.quote_no) (jobsByQuote[j.quote_no] = jobsByQuote[j.quote_no] || []).push(j); });

      const out = [];
      qs.forEach((q) => {
        const jobs = jobsByQuote[q.quote_no] || [];
        if (!jobs.length) return;                                   // ยังไม่มีใบงาน → ยังไม่ใช่งานที่ทำ
        const active = jobs.filter((j) => j.status !== "cancelled");
        const done = active.length > 0 && active.every((j) => j.status === "done");
        if (!done) return;                                          // งานยังไม่เสร็จครบทุกใบ → ข้าม

        // ต่อใบงาน: วัสดุเบิก/คืน + ค่าแรงช่างซัพ (เพื่อกางดูรายละเอียดได้)
        const detail = jobs.map((j) => {
          const m = mat[j.job_no] || { withdraw: 0, return: 0 };
          return { job: j, withdraw: m.withdraw, ret: m.return, matNet: m.withdraw - m.return, labor: Number(j.labor_total) || 0 };
        });
        const withdraw = detail.reduce((a, d) => a + d.withdraw, 0);
        const ret = detail.reduce((a, d) => a + d.ret, 0);
        const matNet = withdraw - ret;                              // วัสดุที่ใช้จริงสุทธิ (รวมทุกใบงาน)
        const labor = detail.reduce((a, d) => a + d.labor, 0);      // ค่าแรงช่างซัพ (รวมทุกใบงาน)

        const sale = q.afterDisc;                                   // ยอดขายสุทธิ ก่อน VAT (นับครั้งเดียว)
        const cost = q.boq_no && boqCost[q.boq_no] != null ? boqCost[q.boq_no] : null;
        const gross = cost == null ? null : sale - cost;            // กำไรขั้นต้น
        const net = gross == null ? null : gross - matNet - labor;  // กำไรสุทธิ/งาน
        const margin = net == null || sale <= 0 ? null : (net / sale) * 100;
        out.push({ q, jobs, detail, sale, cost, gross, withdraw, ret, matNet, labor, net, margin });
      });
      setRows(out);

      // วัสดุที่เบิกในใบงานที่ไม่ผูกใบเสนอราคา → ต้นทุนที่ตกหล่นจากการคิดกำไร
      const orph = Object.entries(mat)
        .map(([jobNo, m]) => ({ jobNo, net: (m.withdraw || 0) - (m.return || 0), job: jobByNo[jobNo] }))
        .filter((o) => o.net > 0.01 && (!o.job || !o.job.quote_no))
        .sort((a, b) => b.net - a.net);
      setOrphans(orph);
    } catch (e) { setErr(e.message || String(e)); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);

  const withGross = rows.filter((r) => r.gross != null);
  const sumSale = withGross.reduce((a, r) => a + r.sale, 0);
  const sumGross = withGross.reduce((a, r) => a + r.gross, 0);
  const sumMat = rows.reduce((a, r) => a + r.matNet, 0);
  const sumLabor = rows.reduce((a, r) => a + r.labor, 0);
  const sumNet = withGross.reduce((a, r) => a + r.net, 0);
  const margin = sumSale > 0 ? (sumNet / sumSale) * 100 : 0;
  const toggle = (qn) => setOpen((o) => ({ ...o, [qn]: !o[qn] }));

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">กำไร/งาน <span className="page-title-en">Profit per Job</span></h1>
          <p className="page-sub">1 ใบเสนอราคา = 1 งาน · เฉพาะงานที่ใบงานเสร็จครบทุกใบ · ยอดขาย−ต้นทุน BOQ−วัสดุเบิกจริง−ค่าแรงช่างซัพ</p></div>
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {err && <div className="empty" style={{ color: "var(--down)" }}>โหลดไม่สำเร็จ: {err}</div>}

      {!loading && !err && (
        <>
          <div className="kpi-grid">
            <div className="stat-card"><div className="stat-val">{fmtBaht(sumGross)}</div><div className="stat-label">กำไรขั้นต้นรวม</div><div className="stat-sub">{rows.length} งานที่เสร็จ</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: "var(--down)" }}>−{fmtBaht(sumMat)}</div><div className="stat-label">วัสดุที่เบิกใช้จริง (สุทธิ)</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: "var(--down)" }}>−{fmtBaht(sumLabor)}</div><div className="stat-label">ค่าแรงช่างซัพรวม</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: sumNet >= 0 ? "var(--up)" : "var(--down)" }}>{fmtBaht(sumNet)}</div><div className="stat-label">กำไรสุทธิรวม</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: "var(--up)" }}>{margin.toFixed(1)}%</div><div className="stat-label">มาร์จินสุทธิเฉลี่ย</div></div>
          </div>

          {orphans.length > 0 && (
            <div className="card" style={{ padding: "12px 16px", marginBottom: 14, borderLeft: "3px solid var(--down)" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--down)", marginBottom: 6 }}>⚠️ วัสดุที่เบิกแต่ยังไม่ผูกใบเสนอราคา ({orphans.length} ใบงาน)</div>
              <div className="page-sub" style={{ marginTop: 0, marginBottom: 8 }}>ต้นทุนวัสดุเหล่านี้ยัง<b>ไม่ถูกนำไปคิดกำไร</b> เพราะใบงานไม่ได้อ้างใบเสนอราคา — ให้ผูกใบงานกับใบเสนอราคา หรือใช้ปุ่ม “ใบงานเชื่อม” กับงานหลัก</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {orphans.map((o) => (
                  <span key={o.jobNo} style={{ fontSize: 12, background: "var(--surface-2)", border: "1px solid var(--line-2)", borderRadius: 8, padding: "3px 9px" }}>
                    {o.jobNo}{o.job?.customerName ? ` · ${o.job.customerName}` : ""} · <b style={{ color: "var(--down)" }}>{fmtBaht(o.net)}</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          {rows.length === 0 && <div className="empty">ยังไม่มีงานที่ทำเสร็จ (ใบงานสถานะ “เสร็จ” ทุกใบของงานนั้น)</div>}
          {rows.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="jp-row jp-head"><span>เลขที่ / ลูกค้า</span><span className="r">ยอดขาย</span><span className="r">ต้นทุน BOQ</span><span className="r">กำไรขั้นต้น</span><span className="r">วัสดุเบิกจริง</span><span className="r">ค่าแรงช่างซัพ</span><span className="r">กำไรสุทธิ</span><span className="r">%</span></div>
              {rows.map(({ q, jobs, detail, sale, cost, gross, withdraw, ret, matNet, labor, net, margin }) => {
                const isOpen = !!open[q.quote_no];
                return (
                  <React.Fragment key={q.quote_no}>
                    <div className="jp-row" style={{ cursor: "pointer" }} onClick={() => toggle(q.quote_no)} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(q.quote_no)}>
                      <span className="jp-name"><b>{isOpen ? "▾ " : "▸ "}{q.quote_no}</b><br />
                        <span className="jp-cust">{q.customerName || "-"} · {jobs.length} ใบงาน{cost == null ? " · ไม่อ้าง BOQ" : ""}</span></span>
                      <span className="r">{fmtBaht(sale)}</span>
                      <span className="r">{cost == null ? "—" : fmtBaht(cost)}</span>
                      <span className="r" style={{ color: gross == null ? "var(--ink-3)" : gross >= 0 ? "var(--ink)" : "var(--down)" }}>{gross == null ? "—" : fmtBaht(gross)}</span>
                      <span className="r">{matNet === 0 ? "—" : <span style={{ color: "var(--down)" }}>−{fmtBaht(matNet)}</span>}</span>
                      <span className="r">{labor === 0 ? "—" : <span style={{ color: "var(--down)" }}>−{fmtBaht(labor)}</span>}</span>
                      <span className="r" style={{ color: net == null ? "var(--ink-3)" : net >= 0 ? "var(--up)" : "var(--down)", fontWeight: 700 }}>{net == null ? "—" : fmtBaht(net)}</span>
                      <span className="r" style={{ color: "var(--ink-3)" }}>{margin == null ? "—" : margin.toFixed(0) + "%"}</span>
                    </div>
                    {isOpen && (
                      <div style={{ padding: "6px 16px 12px 30px", background: "var(--surface-2)", borderBottom: "1px solid var(--line-2)", fontSize: 12 }}>
                        {detail.map((d) => (
                          <div key={d.job.job_no} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", borderBottom: "1px dashed var(--line-2)" }}>
                            <span>📋 <b>{d.job.job_no}</b>{d.job.teamName ? ` · ${d.job.teamName}` : ""}{d.job.status !== "done" ? ` · ${ST[d.job.status] || d.job.status}` : ""}</span>
                            <span style={{ textAlign: "right", color: "var(--ink-2)" }}>
                              {d.matNet === 0 ? "ไม่มีวัสดุ" : <>วัสดุ {fmtBaht(d.matNet)}{d.ret > 0 ? ` (เบิก ${fmtBaht(d.withdraw)} − คืน ${fmtBaht(d.ret)})` : ""}</>}
                              {d.labor > 0 && <> · ค่าแรงซัพ {fmtBaht(d.labor)}</>}
                            </span>
                          </div>
                        ))}
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0 0", fontWeight: 700 }}>
                          <span>รวมทั้งงาน</span>
                          <span style={{ textAlign: "right" }}>วัสดุ {fmtBaht(matNet)} · ค่าแรงซัพ {fmtBaht(labor)}{ret > 0 ? ` · (เบิกรวม ${fmtBaht(withdraw)} − คืน ${fmtBaht(ret)})` : ""}</span>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
          <p className="page-sub" style={{ marginTop: 12 }}>* กดที่แถวเพื่อกางดูวัสดุ + ค่าแรงช่างซัพรายใบงาน · แสดงเฉพาะงานที่ใบงาน “เสร็จ” ครบทุกใบ · ใบที่ “ไม่อ้าง BOQ” คำนวณกำไรขั้นต้นไม่ได้ · ยอดขายเป็นราคาก่อน VAT</p>
        </>
      )}
    </div>
  );
}
