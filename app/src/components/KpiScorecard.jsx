import React from "react";
import { listKpiScorecard } from "../lib/api";
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
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    const { from, to } = monthRange(month);
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
                    const rv = t.cust_rating_avg ?? t.rating_avg;   // คะแนนลูกค้าก่อน · ไม่มีก็ตกไปคะแนนรีวิวช่างซัพเดิม
                    const isCust = t.cust_rating_avg != null;
                    return (
                      <tr key={t.team_id}>
                        <td style={{ textAlign: "left" }}>
                          <b>{t.name || t.team_id}</b>
                          {t.type === "sub" && <span className="jo-dim" style={{ fontSize: 11 }}> · ช่างซัพ</span>}
                        </td>
                        <td>{fmtInt(t.jobs_done)}</td>
                        <td>{fmtInt(t.claims)}</td>
                        <td><span className={"job-badge " + rag(t.claim_rate, 3, 7, true)}>{t.claim_rate}%</span></td>
                        <td>{rv == null ? <span className="jo-dim">—</span> : <>
                          <span className={"job-badge " + rag(rv, 4.5, 4)}>{rv} ★</span>
                          {isCust && t.cust_rating_n > 0 && <span className="jo-dim" style={{ fontSize: 10.5, display: "block" }}>{t.cust_rating_n} รีวิว</span>}
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
