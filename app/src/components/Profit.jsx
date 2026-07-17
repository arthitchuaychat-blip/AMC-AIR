import React from "react";
import { listQuotations, listBoqs, listJobOrders, jobMaterialCost, jobExpenseCost, listPurchaseOrders } from "../lib/api";
import { fmtBaht, matchText, inRange } from "../lib/format";
import { UIcon } from "../icons";

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
  // ตัวกรอง: ค้นหา (ลูกค้า/ทีมช่าง/เลขใบงาน/เลขใบเสนอ) + ช่วงวันที่ (วันอนุมัติใบเสนอ หรือวันนัดงานของใบงานใดใบหนึ่ง)
  const [query, setQuery] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  async function load() {
    setLoading(true); setErr(null);
    try {
      const [qs, bs, jos, mat, exp, pos] = await Promise.all([listQuotations(), listBoqs(), listJobOrders(), jobMaterialCost(), jobExpenseCost(), listPurchaseOrders().catch(() => [])]);
      const boqCost = Object.fromEntries(bs.map((b) => [b.boq_no, b.total]));
      // PO ผูกงานที่ยังรอรับของ = ต้นทุนที่สั่งแล้วของงาน (ก่อน VAT) · พอรับของจะย้ายไปอยู่ใน "เบิกจริง" แทน (นับเฉพาะ open → ไม่ซ้ำ)
      const poPendByQuote = {};
      (pos || []).forEach((p) => { if (p.quote_no && p.status === "open") poPendByQuote[p.quote_no] = (poPendByQuote[p.quote_no] || 0) + (Number(p.subtotal) || 0); });
      const jobByNo = Object.fromEntries(jos.map((j) => [j.job_no, j]));
      // group job orders by quote (1 ใบเสนอราคา = 1 งาน)
      const jobsByQuote = {};
      jos.forEach((j) => { if (j.quote_no) (jobsByQuote[j.quote_no] = jobsByQuote[j.quote_no] || []).push(j); });

      const out = [];
      qs.forEach((q) => {
        if (q.status !== "approved") return;             // นับเฉพาะใบเสนอที่อนุมัติ — กติกาเดียวกับหน้ารายงานขาย (เจ้าของเคาะ 2026-07-17)
        const jobs = jobsByQuote[q.quote_no] || [];
        if (!jobs.length) return;                                   // ยังไม่มีใบงาน → ยังไม่ใช่งานที่ทำ
        const active = jobs.filter((j) => j.status !== "cancelled");
        const done = active.length > 0 && active.every((j) => j.status === "done");
        if (!done) return;                                          // งานยังไม่เสร็จครบทุกใบ → ข้าม

        // ต่อใบงาน: วัสดุเบิก/คืน + ค่าแรงช่างซัพ (เพื่อกางดูรายละเอียดได้)
        const detail = jobs.map((j) => {
          const m = mat[j.job_no] || { withdraw: 0, return: 0 };
          return { job: j, withdraw: m.withdraw, ret: m.return, matNet: m.withdraw - m.return, labor: Number(j.labor_total) || 0, expense: Number(exp[j.job_no]) || 0 };
        });
        const withdraw = detail.reduce((a, d) => a + d.withdraw, 0);
        const ret = detail.reduce((a, d) => a + d.ret, 0);
        const matNet = withdraw - ret;                              // วัสดุที่ใช้จริงสุทธิ (รวมทุกใบงาน)
        const labor = detail.reduce((a, d) => a + d.labor, 0);      // ค่าแรงช่างซัพ (รวมทุกใบงาน)
        const expenses = detail.reduce((a, d) => a + d.expense, 0); // ค่าใช้จ่ายเบิกจ่ายของงาน (รวมทุกใบงาน)

        const sale = q.afterDisc;                                   // ยอดขายสุทธิ ก่อน VAT (นับครั้งเดียว)
        // ค่าธรรมเนียมบัตร = ส่วนต่างระหว่างยอดขายราคาบัตร (price_show) กับยอดขายราคาเงินสด — เงินส่วนนี้จ่ายธนาคาร ไม่ใช่กำไร (เจ้าของเคาะ 2026-07-17)
        let cardFee = 0;
        if (q.payMethod && q.payMethod !== "cash") {
          const subCash = (q.items || []).reduce((a, x) => a + Number(x.qty) * (Number(x.unit_price) || 0) - (Number(x.discount) || 0), 0);
          const discCash = q.discount_type === "percent" ? subCash * Number(q.discount_value || 0) / 100 : Number(q.discount_value || 0);
          cardFee = Math.max(0, Math.round((sale - (subCash - discCash)) * 100) / 100);
        }
        const cost = q.boq_no && boqCost[q.boq_no] != null ? boqCost[q.boq_no] : null;
        // สูตรต้นทุนจริง (เลือกโดยผู้ใช้ 2026-07-04): กำไรสุทธิ = ขาย − ต้นทุนจริง
        // ต้นทุนจริง = เบิกจริง−คืน + ค่าแรงซัพ + เบิกจ่าย + ค่าสินค้าตาม PO ผูกงานที่ยังรอรับของ + ค่าธรรมเนียมบัตร
        // BOQ = กำไรตามประมาณการ ไว้เทียบเท่านั้น — ห้ามหักซ้อน
        const gross = cost == null ? null : sale - cost;            // กำไรตามประมาณการ (BOQ)
        const poPend = poPendByQuote[q.quote_no] || 0;
        const hasRealCost = matNet + labor + expenses + poPend > 0; // ค่าธรรมเนียมบัตรอย่างเดียวยังไม่นับว่า "มีต้นทุนจริง"
        const actualCost = matNet + labor + expenses + poPend + cardFee;
        const net = hasRealCost ? sale - actualCost : null;         // ยังไม่มีต้นทุนจริง → ไม่โชว์กำไรลวง
        const margin = net == null || sale <= 0 ? null : (net / sale) * 100;
        out.push({ q, jobs, detail, sale, cost, gross, withdraw, ret, matNet, labor, expenses, poPend, cardFee, net, margin });
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

  // กรองก่อนคิดยอดรวม — การ์ดสรุปสะท้อนเฉพาะรายการที่ผ่านตัวกรอง
  const shown = rows.filter((r) => {
    const inDate = (!from && !to)
      || inRange(r.q.approved_at || r.q.issue_date, from, to)
      || r.jobs.some((j) => j.scheduled_at && inRange(j.scheduled_at, from, to));
    if (!inDate) return false;
    return matchText(query, r.q.quote_no, r.q.customerName, r.q.title,
      ...r.jobs.flatMap((j) => [j.job_no, j.teamName]));
  });
  const withEst = shown.filter((r) => r.gross != null);
  const sumGross = withEst.reduce((a, r) => a + r.gross, 0);           // กำไรประมาณการรวม (BOQ)
  const withNet = shown.filter((r) => r.net != null);                  // เฉพาะงานที่มีต้นทุนจริงบันทึกแล้ว
  const sumSaleNet = withNet.reduce((a, r) => a + r.sale, 0);
  const sumNet = withNet.reduce((a, r) => a + r.net, 0);
  const sumMat = shown.reduce((a, r) => a + r.matNet, 0);
  const sumLabor = shown.reduce((a, r) => a + r.labor, 0);
  const margin = sumSaleNet > 0 ? (sumNet / sumSaleNet) * 100 : 0;
  const filtered = !!(query || from || to);
  const toggle = (qn) => setOpen((o) => ({ ...o, [qn]: !o[qn] }));

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">กำไร/งาน <span className="page-title-en">Profit per Job</span></h1>
          <p className="page-sub">1 ใบเสนอราคา = 1 งาน · เฉพาะงานที่ใบงานเสร็จครบทุกใบ · กำไรสุทธิ = ยอดขาย − <b>ต้นทุนจริง</b> (วัสดุ/แอร์เบิกจริง + ค่าแรงซัพ + เบิกจ่าย) · BOQ = ประมาณการไว้เทียบ</p></div>
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {err && <div className="empty" style={{ color: "var(--down)" }}>โหลดไม่สำเร็จ: {err}</div>}

      {!loading && !err && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <div className="cat-search" style={{ maxWidth: 400, marginBottom: 0 }}>
              <UIcon name="search" size={16} color="var(--ink-3)" />
              <input placeholder="ค้นหา ลูกค้า / ทีมช่าง / เลขใบงาน / เลขใบเสนอ / ชื่องาน" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="tc-range">
              <span>จาก</span><input className="inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span>ถึง</span><input className="inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            {filtered && <button className="btn-ghost sm" onClick={() => { setQuery(""); setFrom(""); setTo(""); }}>✕ ล้างตัวกรอง</button>}
            {filtered && <span className="page-sub" style={{ margin: 0 }}>แสดง {shown.length} จาก {rows.length} งาน</span>}
          </div>

          <div className="kpi-grid">
            <div className="stat-card"><div className="stat-val">{fmtBaht(sumGross)}</div><div className="stat-label">กำไรประมาณการรวม (BOQ)</div><div className="stat-sub">{shown.length} งานที่เสร็จ{filtered ? ` (กรองจาก ${rows.length})` : ""}</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: "var(--down)" }}>−{fmtBaht(sumMat)}</div><div className="stat-label">วัสดุ/แอร์ที่เบิกใช้จริง (สุทธิ)</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: "var(--down)" }}>−{fmtBaht(sumLabor)}</div><div className="stat-label">ค่าแรงช่างซัพรวม</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: sumNet >= 0 ? "var(--up)" : "var(--down)" }}>{fmtBaht(sumNet)}</div><div className="stat-label">กำไรสุทธิรวม (ต้นทุนจริง)</div><div className="stat-sub">{withNet.length} งานที่มีต้นทุนจริง</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: "var(--up)" }}>{margin.toFixed(1)}%</div><div className="stat-label">มาร์จินสุทธิเฉลี่ย (จริง)</div></div>
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
          {rows.length > 0 && shown.length === 0 && <div className="empty">ไม่พบงานตามตัวกรอง — ลองแก้คำค้น/ช่วงวันที่ หรือกด “ล้างตัวกรอง”</div>}
          {shown.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="jp-row jp-head"><span>เลขที่ / ลูกค้า</span><span className="r">ยอดขาย</span><span className="r">ต้นทุน BOQ (ประมาณ)</span><span className="r">กำไรประมาณการ</span><span className="r">วัสดุ/แอร์เบิกจริง</span><span className="r">ค่าแรงช่างซัพ</span><span className="r">กำไรสุทธิ (จริง)</span><span className="r">%</span></div>
              {shown.map(({ q, jobs, detail, sale, cost, gross, withdraw, ret, matNet, labor, expenses, poPend, cardFee, net, margin }) => {
                const isOpen = !!open[q.quote_no];
                return (
                  <React.Fragment key={q.quote_no}>
                    <div className="jp-row" style={{ cursor: "pointer" }} onClick={() => toggle(q.quote_no)} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(q.quote_no)}>
                      <span className="jp-name"><b>{isOpen ? "▾ " : "▸ "}{q.quote_no}</b><br />
                        <span className="jp-cust">{q.customerName || "-"} · {jobs.length} ใบงาน{cost == null ? " · ไม่อ้าง BOQ" : ""}{poPend > 0 ? ` · 🛒 PO รอรับของ ${fmtBaht(poPend)}` : ""}{cardFee > 0 ? ` · 💳 ค่าธรรมเนียมบัตร ${fmtBaht(cardFee)}` : ""}</span></span>
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
                              {d.expense > 0 && <> · ค่าใช้จ่ายเบิก {fmtBaht(d.expense)}</>}
                            </span>
                          </div>
                        ))}
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0 0", fontWeight: 700 }}>
                          <span>รวมทั้งงาน</span>
                          <span style={{ textAlign: "right" }}>วัสดุ {fmtBaht(matNet)} · ค่าแรงซัพ {fmtBaht(labor)}{expenses > 0 ? ` · ค่าใช้จ่ายเบิก ${fmtBaht(expenses)}` : ""}{poPend > 0 ? ` · PO รอรับของ ${fmtBaht(poPend)}` : ""}{cardFee > 0 ? ` · ค่าธรรมเนียมบัตร ${fmtBaht(cardFee)}` : ""}{ret > 0 ? ` · (เบิกรวม ${fmtBaht(withdraw)} − คืน ${fmtBaht(ret)})` : ""}</span>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
          <p className="page-sub" style={{ marginTop: 12 }}>* กดที่แถวเพื่อกางดูวัสดุ + ค่าแรงช่างซัพรายใบงาน · นับเฉพาะใบเสนอราคาที่<b>อนุมัติแล้ว</b> (กติกาเดียวกับรายงานขาย) และใบงาน “เสร็จ” ครบทุกใบ · กำไรสุทธิคิดจาก<b>ต้นทุนจริง</b> (วัสดุเบิกจริง + ค่าแรงซัพ + เบิกจ่าย + PO รอรับของ + 💳 ค่าธรรมเนียมบัตร) — งานที่ยังไม่บันทึกต้นทุนจริงจะขึ้น “—” เพื่อไม่ให้กำไรลวง · BOQ เป็นประมาณการไว้เทียบ · ยอดขายเป็นราคาก่อน VAT</p>
        </>
      )}
    </div>
  );
}
