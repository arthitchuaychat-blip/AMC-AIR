import React from "react";
import { listKpiScorecard, saleAdminKpi } from "../lib/api";
import { fmtBaht } from "../lib/format";
import { ROLE_LABEL } from "../lib/permissions";

// สกอร์การ์ดผลงาน — วัด KPI จริงต่อคน/ต่อทีม (mig 198 kpi_scorecard) · office เท่านั้น (อ่านอย่างเดียว)
// เป้าอ้างอิงจากคู่มือตำแหน่งงาน (COMPANY_TARGETS): ยอดขาย/คน ≥2.0 ลบ. · อัตราปิด ≥30% · เคลม ≤3% · คะแนน ≥4.5

const fmtInt = (n) => (Number(n) || 0).toLocaleString("en-US");
const monthNow = () => new Date().toISOString().slice(0, 7);
// วันแรก–วันสุดท้ายของเดือน YYYY-MM (ทำงานฝั่ง client, ไม่พึ่ง timezone)
function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
// RAG: คืน class ป้ายสี ตามเกณฑ์ (มาก=ดี โดยดีฟอลต์ · invert=true สำหรับ "ยิ่งน้อยยิ่งดี" เช่น เคลม)
function rag(val, good, ok, invert) {
  if (val == null) return "b-grey";
  if (invert) return val <= good ? "b-green" : val <= ok ? "b-amber" : "b-red";
  return val >= good ? "b-green" : val >= ok ? "b-amber" : "b-red";
}

export default function KpiScorecard() {
  const [month, setMonth] = React.useState(monthNow);
  const [data, setData] = React.useState(null);
  const [saData, setSaData] = React.useState(null);   // KPI ธุรการขาย (Sale Admin)
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null); setSaData(null);
    const { from, to } = monthRange(month);
    saleAdminKpi(from, to).then((d) => { if (alive) setSaData(d); }).catch(() => { if (alive) setSaData([]); });
    listKpiScorecard(from, to)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e.message || String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [month]);

  const sales = data?.sales || [];
  const teams = data?.teams || [];
  const totalRev = sales.reduce((a, s) => a + (Number(s.revenue) || 0), 0);
  const totalWon = sales.reduce((a, s) => a + (Number(s.won) || 0), 0);
  const totalDone = teams.reduce((a, t) => a + (Number(t.jobs_done) || 0), 0);

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">สกอร์การ์ดผลงาน <span className="page-title-en">KPI Scorecard</span></h1>
          <p className="page-sub">วัดผลจริงจากข้อมูลในระบบ · ยอดขายนับจากผู้สร้างเอกสาร · งานนับตามทีมที่รับผิดชอบ</p>
        </div>
        <input type="month" className="inp" style={{ width: "auto", flex: "none" }} value={month} max={monthNow()} onChange={(e) => setMonth(e.target.value || monthNow())} />
      </div>

      {loading && <div className="card"><div className="empty">กำลังโหลด…</div></div>}
      {!loading && err && <div className="card"><div className="empty">โหลดไม่สำเร็จ: {err}</div></div>}

      {!loading && !err && <>
        {/* สรุปเดือน */}
        <div className="kpi-tiles">
          <div className="kpi-tile"><span className="kpi-tile-lb">ยอดเก็บเงินรวม</span><b>{fmtBaht(totalRev)}</b></div>
          <div className="kpi-tile"><span className="kpi-tile-lb">ดีลปิดได้</span><b>{fmtInt(totalWon)} <small>ใบ</small></b></div>
          <div className="kpi-tile"><span className="kpi-tile-lb">งานเสร็จ</span><b>{fmtInt(totalDone)} <small>งาน</small></b></div>
          <div className="kpi-tile"><span className="kpi-tile-lb">ฝ่ายขายมีผลงาน</span><b>{fmtInt(sales.length)} <small>คน</small></b></div>
        </div>

        {/* ผลงานฝ่ายขาย */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="sec-head"><div>
            <div className="sec-title">ผลงานฝ่ายขาย (ต่อคน)</div>
            <div className="sec-sub">เป้า: ยอดขาย ≥ 2.0 ลบ./เดือน · อัตราปิด ≥ 30% · 🟢 ถึงเป้า · 🟡 ใกล้ · 🔴 ต่ำกว่าเป้า</div>
          </div></div>
          {sales.length === 0 && <div className="empty sm">ยังไม่มีข้อมูลยอดขายในเดือนนี้</div>}
          {sales.length > 0 && (
            <div className="kpi-table-wrap">
              <table className="kpi-table">
                <thead><tr>
                  <th style={{ textAlign: "left" }}>พนักงาน</th>
                  <th>ยอดเก็บเงิน</th><th>ใบเสนอ</th><th>ปิดได้</th><th>อัตราปิด</th>
                </tr></thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.user_id}>
                      <td style={{ textAlign: "left" }}>
                        <b>{s.name || "-"}</b>
                        <span className="jo-dim" style={{ display: "block", fontSize: 11 }}>{ROLE_LABEL[s.role] || s.role || ""}</span>
                      </td>
                      <td><span className={"job-badge " + rag(s.revenue, 2000000, 1000000)}>{fmtBaht(s.revenue)}</span></td>
                      <td>{fmtInt(s.quotes)}</td>
                      <td>{fmtInt(s.won)}</td>
                      <td>{s.close_rate == null ? <span className="jo-dim">—</span> : <span className={"job-badge " + rag(s.close_rate, 30, 20)}>{s.close_rate}%</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ธุรการขาย (Sale Admin) */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="sec-head"><div>
            <div className="sec-title">ธุรการขาย · Sale Admin (ต่อคน)</div>
            <div className="sec-sub">วัดจากงานจริง — ตอบลีด ≤ 15น. · ทำใบเสนอ ≤ 1 วัน · ติดตาม ≥ 90% · อัตราปิด ≥ 50% · เอกสารผิด ≤ 3% · พอใจ ≥ 4.5 · คะแนนรวม ≥ 85 = ดีเยี่ยม</div>
          </div></div>
          {(saData || []).length === 0 && <div className="empty sm">ยังไม่มีข้อมูล Sale Admin ในเดือนนี้</div>}
          {(saData || []).length > 0 && (
            <div className="kpi-table-wrap">
              <table className="kpi-table">
                <thead><tr>
                  <th style={{ textAlign: "left" }}>พนักงาน</th>
                  <th>ตอบลีด</th><th>ทำใบเสนอ</th><th>ติดตาม</th><th>ใบเสนอ</th><th>อัตราปิด</th><th>เอกสารผิด</th><th>พอใจ</th><th>คะแนนรวม</th>
                </tr></thead>
                <tbody>
                  {saData.map((s) => (
                    <tr key={s.id}>
                      <td style={{ textAlign: "left" }}><b>{s.name || "-"}</b><span className="jo-dim" style={{ display: "block", fontSize: 11 }}>{ROLE_LABEL[s.role] || s.role || ""}</span></td>
                      <td>{s.respMin == null ? <span className="jo-dim">—</span> : <span className={"job-badge " + rag(s.respMin, 15, 30, true)}>{s.respMin < 60 ? Math.round(s.respMin) + " น." : (s.respMin / 60).toFixed(1) + " ชม."}</span>}</td>
                      <td>{s.turnaround == null ? <span className="jo-dim">—</span> : <span className={"job-badge " + rag(s.turnaround, 1, 2, true)}>{s.turnaround.toFixed(1)} ว.</span>}</td>
                      <td>{s.followup == null ? <span className="jo-dim">—</span> : <span className={"job-badge " + rag(s.followup * 100, 90, 75)} title={`ลีดในมือ ${s.leads} ราย`}>{Math.round(s.followup * 100)}%</span>}</td>
                      <td>{fmtInt(s.quotes)}</td>
                      <td>{s.closeRate == null ? <span className="jo-dim">—</span> : <span className={"job-badge " + rag(s.closeRate * 100, 50, 30)}>{Math.round(s.closeRate * 100)}%</span>}</td>
                      <td>{s.errRate == null ? <span className="jo-dim">—</span> : <span className={"job-badge " + rag(s.errRate * 100, 3, 7, true)}>{Math.round(s.errRate * 100)}%</span>}</td>
                      <td>{s.rating == null ? <span className="jo-dim">—</span> : <span className={"job-badge " + rag(s.rating, 4.5, 4)}>{s.rating.toFixed(1)} ★</span>}</td>
                      <td>{s.score == null ? <span className="jo-dim">—</span> : <span className={"job-badge " + rag(s.score, 85, 70)} style={{ fontWeight: 800 }}>{s.score}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ผลงานทีมช่าง */}
        <div className="card">
          <div className="sec-head"><div>
            <div className="sec-title">ผลงานทีมช่าง (ต่อทีม)</div>
            <div className="sec-sub">เป้า: งานเคลม ≤ 3% · คะแนนลูกค้า ≥ 4.5 ดาว · (คะแนนลูกค้า = ลูกค้าให้ดาวจากลิงก์ใบส่งมอบงาน)</div>
          </div></div>
          {teams.length === 0 && <div className="empty sm">ยังไม่มีงานเสร็จของทีมในเดือนนี้</div>}
          {teams.length > 0 && (
            <div className="kpi-table-wrap">
              <table className="kpi-table">
                <thead><tr>
                  <th style={{ textAlign: "left" }}>ทีม</th>
                  <th>งานเสร็จ</th><th>เคลม</th><th>อัตราเคลม</th><th>คะแนนลูกค้า</th>
                </tr></thead>
                <tbody>
                  {teams.map((t) => {
                    // เฉพาะคะแนน "ลูกค้า" จริงเท่านั้น — ไม่ปนกับคะแนนรีวิวช่างซัพของออฟฟิศ (rating_avg)
                    const rv = t.cust_rating_avg;
                    return (
                      <tr key={t.team_id}>
                        <td style={{ textAlign: "left" }}>
                          <b>{t.name || t.team_id}</b>
                          {t.type === "sub" && <span className="jo-dim" style={{ fontSize: 11 }}> · ช่างซัพ</span>}
                        </td>
                        <td>{fmtInt(t.jobs_done)}</td>
                        <td>{fmtInt(t.claims)}</td>
                        <td><span className={"job-badge " + rag(t.claim_rate, 3, 7, true)}>{t.claim_rate}%</span></td>
                        <td>{rv == null || !(t.cust_rating_n > 0) ? <span className="jo-dim">— <span style={{ fontSize: 10 }}>ยังไม่มีรีวิว</span></span> : <>
                          <span className={"job-badge " + rag(rv, 4.5, 4)}>{rv} ★</span>
                          <span className="jo-dim" style={{ fontSize: 10.5, display: "block" }}>{t.cust_rating_n} รีวิว</span>
                        </>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="page-sub" style={{ marginTop: 12 }}>* ยอดเก็บเงิน = ใบเสร็จที่ออกในเดือน (ตามผู้สร้างเอกสาร) · อัตราปิด = ใบเสนออนุมัติ ÷ ใบเสนอทั้งหมด · เกณฑ์เป้าปรับได้ภายหลัง</p>
      </>}
    </div>
  );
}
