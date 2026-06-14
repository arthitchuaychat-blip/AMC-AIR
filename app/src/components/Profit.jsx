import React from "react";
import { listQuotations, listBoqs, listJobOrders, jobMaterialCost } from "../lib/api";
import { fmtBaht } from "../lib/format";

// กำไร/งาน — เฉพาะงานที่ทำเสร็จแล้ว
// กำไรขั้นต้น = ยอดขายสุทธิ (ก่อน VAT) − ต้นทุน BOQ
// กำไรสุทธิ/งาน = กำไรขั้นต้น − (ต้นทุนวัสดุที่เบิกใช้ − ต้นทุนวัสดุที่ส่งคืน)
export default function Profit() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const [qs, bs, jos, mat] = await Promise.all([listQuotations(), listBoqs(), listJobOrders(), jobMaterialCost()]);
      const boqCost = Object.fromEntries(bs.map((b) => [b.boq_no, b.total]));
      // group job orders by quote
      const jobsByQuote = {};
      jos.forEach((j) => { if (j.quote_no) (jobsByQuote[j.quote_no] = jobsByQuote[j.quote_no] || []).push(j); });

      const out = [];
      qs.forEach((q) => {
        const jobs = jobsByQuote[q.quote_no] || [];
        if (!jobs.length) return;                                   // ยังไม่มีใบงาน → ไม่ใช่งานที่ทำ
        const active = jobs.filter((j) => j.status !== "cancelled");
        const done = active.length > 0 && active.every((j) => j.status === "done");
        if (!done) return;                                          // งานยังไม่เสร็จครบทุกใบ → ข้าม

        // รวมต้นทุนวัสดุเบิก/คืน จากทุกใบงานของงานนี้ (รวมใบเชื่อม A/B/C)
        let withdraw = 0, ret = 0;
        jobs.forEach((j) => { const m = mat[j.job_no]; if (m) { withdraw += m.withdraw; ret += m.return; } });
        const matNet = withdraw - ret;                              // วัสดุที่ใช้จริงสุทธิ

        const sale = q.afterDisc;                                   // ยอดขายสุทธิ (ก่อน VAT)
        const cost = q.boq_no && boqCost[q.boq_no] != null ? boqCost[q.boq_no] : null;
        const gross = cost == null ? null : sale - cost;            // กำไรขั้นต้น
        const net = gross == null ? null : gross - matNet;          // กำไรสุทธิ/งาน
        const margin = net == null || sale <= 0 ? null : (net / sale) * 100;
        out.push({ q, jobs, sale, cost, gross, withdraw, ret, matNet, net, margin });
      });
      setRows(out);
    } catch (e) { setErr(e.message || String(e)); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);

  const withGross = rows.filter((r) => r.gross != null);
  const sumSale = withGross.reduce((a, r) => a + r.sale, 0);
  const sumGross = withGross.reduce((a, r) => a + r.gross, 0);
  const sumMat = rows.reduce((a, r) => a + r.matNet, 0);
  const sumNet = withGross.reduce((a, r) => a + r.net, 0);
  const margin = sumSale > 0 ? (sumNet / sumSale) * 100 : 0;

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">กำไร/งาน <span className="page-title-en">Profit per Job</span></h1>
          <p className="page-sub">เฉพาะงานที่ทำเสร็จแล้ว · กำไรขั้นต้น (ขาย−ต้นทุน BOQ) − วัสดุที่เบิกใช้จริง (เบิก−คืน)</p></div>
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {err && <div className="empty" style={{ color: "var(--down)" }}>โหลดไม่สำเร็จ: {err}</div>}

      {!loading && !err && (
        <>
          <div className="kpi-grid">
            <div className="stat-card"><div className="stat-val">{fmtBaht(sumGross)}</div><div className="stat-label">กำไรขั้นต้นรวม</div><div className="stat-sub">{rows.length} งานที่เสร็จ</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: "var(--down)" }}>−{fmtBaht(sumMat)}</div><div className="stat-label">วัสดุที่เบิกใช้จริง (สุทธิ)</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: sumNet >= 0 ? "var(--up)" : "var(--down)" }}>{fmtBaht(sumNet)}</div><div className="stat-label">กำไรสุทธิรวม</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: "var(--up)" }}>{margin.toFixed(1)}%</div><div className="stat-label">มาร์จินสุทธิเฉลี่ย</div></div>
          </div>

          {rows.length === 0 && <div className="empty">ยังไม่มีงานที่ทำเสร็จ (ใบงานสถานะ “เสร็จ” ทุกใบของงานนั้น)</div>}
          {rows.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="jp-row jp-head"><span>เลขที่ / ลูกค้า</span><span className="r">ยอดขาย</span><span className="r">ต้นทุน BOQ</span><span className="r">กำไรขั้นต้น</span><span className="r">วัสดุเบิกจริง</span><span className="r">กำไรสุทธิ</span><span className="r">%</span></div>
              {rows.map(({ q, jobs, sale, cost, gross, withdraw, ret, matNet, net, margin }) => (
                <div className="jp-row" key={q.quote_no}>
                  <span className="jp-name"><b>{q.quote_no}</b><br />
                    <span className="jp-cust">{q.customerName || "-"} · {jobs.map((j) => j.job_no).join(", ")}{cost == null ? " · ไม่อ้าง BOQ" : ""}</span></span>
                  <span className="r">{fmtBaht(sale)}</span>
                  <span className="r">{cost == null ? "—" : fmtBaht(cost)}</span>
                  <span className="r" style={{ color: gross == null ? "var(--ink-3)" : gross >= 0 ? "var(--ink)" : "var(--down)" }}>{gross == null ? "—" : fmtBaht(gross)}</span>
                  <span className="r">{matNet === 0 ? "—" : <span style={{ color: "var(--down)" }}>−{fmtBaht(matNet)}</span>}{ret > 0 && <><br /><span className="jp-sub">เบิก {fmtBaht(withdraw)} · คืน {fmtBaht(ret)}</span></>}</span>
                  <span className="r" style={{ color: net == null ? "var(--ink-3)" : net >= 0 ? "var(--up)" : "var(--down)", fontWeight: 700 }}>{net == null ? "—" : fmtBaht(net)}</span>
                  <span className="r" style={{ color: "var(--ink-3)" }}>{margin == null ? "—" : margin.toFixed(0) + "%"}</span>
                </div>
              ))}
            </div>
          )}
          <p className="page-sub" style={{ marginTop: 12 }}>* แสดงเฉพาะงานที่ใบงาน “เสร็จ” ครบทุกใบ · ใบที่ “ไม่อ้าง BOQ” คำนวณกำไรไม่ได้ · ยอดขายเป็นราคาก่อน VAT · วัสดุดึงจากการเบิก/คืนที่ผูกเลขใบงาน</p>
        </>
      )}
    </div>
  );
}
