import React from "react";
import { listCustomers, listStaff, setCustomerPipeline } from "../lib/api";
import { fmtBaht } from "../lib/format";
import { PIPE_STAGES, STAGE_BY, OPEN_STAGES, PIPE_SOURCES } from "../lib/pipeline";

// ท่อขาย (Sales Pipeline) — ลูกค้าที่มี stage จัดเป็นคอลัมน์ตามขั้น + สรุป ROI ต่อช่องทาง
// อ่าน customers.stage/source/owner_id/next_followup/est_value (mig 199) · เซลส์เห็นของตัวเอง ผู้จัดการเห็นทุกคน
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "";

export default function Pipeline({ role, me, onOpenCustomer }) {
  const [list, setList] = React.useState([]);
  const [staff, setStaff] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [ownerF, setOwnerF] = React.useState((role === "sales" || role === "field_sales") ? "me" : "all"); // เซลส์เริ่มที่ "ของฉัน"
  const [srcF, setSrcF] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2500); };

  async function load() {
    setLoading(true);
    try { const [c, s] = await Promise.all([listCustomers(), listStaff()]); setList(c); setStaff(s); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  const staffName = React.useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.name])), [staff]);

  async function changeStage(cust, stage) {
    try { await setCustomerPipeline(cust.id, { stage }); setList((l) => l.map((c) => c.id === cust.id ? { ...c, stage } : c)); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }

  // เฉพาะลูกค้าที่อยู่ในท่อขาย (มี stage) + ตัวกรอง
  const inPipe = list.filter((c) => c.stage
    && (ownerF === "all" || (ownerF === "me" ? String(c.owner_id) === String(me) : String(c.owner_id) === String(ownerF)))
    && (srcF === "all" || c.source === srcF)
    && (!q.trim() || (c.name || "").toLowerCase().includes(q.trim().toLowerCase())));

  const byStage = {}; PIPE_STAGES.forEach((s) => { byStage[s.v] = []; });
  inPipe.forEach((c) => { (byStage[c.stage] = byStage[c.stage] || []).push(c); });
  const openValue = inPipe.filter((c) => OPEN_STAGES.includes(c.stage)).reduce((a, c) => a + (Number(c.est_value) || 0), 0);
  const openCount = inPipe.filter((c) => OPEN_STAGES.includes(c.stage)).length;

  // สรุป ROI ต่อช่องทาง — นับจากลูกค้าที่ระบุ source (ทุก stage) ในขอบเขตผู้ดูแลที่เลือก
  const srcScope = list.filter((c) => c.source
    && (ownerF === "all" || (ownerF === "me" ? String(c.owner_id) === String(me) : String(c.owner_id) === String(ownerF))));
  const srcRows = PIPE_SOURCES.map((s) => {
    const rows = srcScope.filter((c) => c.source === s);
    const won = rows.filter((c) => c.stage === "won").length;
    return { s, total: rows.length, won, conv: rows.length ? Math.round(100 * won / rows.length) : 0 };
  }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">ท่อขาย <span className="page-title-en">Sales Pipeline</span></h1>
          <p className="page-sub">ติดตามลูกค้าตั้งแต่ผู้สนใจจนปิดการขาย · ไม่มี lead หลุด · วัดว่าช่องทางไหนคุ้ม</p>
        </div>
      </div>

      {/* ตัวกรอง */}
      <div className="cat-filter" style={{ marginBottom: 14, alignItems: "center", gap: 8 }}>
        <select className="inp" style={{ width: "auto", flex: "none" }} value={ownerF} onChange={(e) => setOwnerF(e.target.value)}>
          <option value="all">ทุกเซลส์</option>
          <option value="me">ของฉัน</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="inp" style={{ width: "auto", flex: "none" }} value={srcF} onChange={(e) => setSrcF(e.target.value)}>
          <option value="all">ทุกช่องทาง</option>
          {PIPE_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="inp" style={{ width: 180, flex: "none" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อลูกค้า" />
      </div>

      {loading && <div className="card"><div className="empty">กำลังโหลด…</div></div>}

      {!loading && <>
        {/* สรุปท่อ */}
        <div className="kpi-tiles" style={{ marginBottom: 14 }}>
          <div className="kpi-tile"><span className="kpi-tile-lb">มูลค่าในท่อ (ยังไม่ปิด)</span><b>{fmtBaht(openValue)}</b></div>
          <div className="kpi-tile"><span className="kpi-tile-lb">ดีลกำลังคุย</span><b>{openCount} <small>ราย</small></b></div>
          <div className="kpi-tile"><span className="kpi-tile-lb">ปิดได้</span><b>{byStage.won?.length || 0} <small>ราย</small></b></div>
        </div>

        {/* ROI ต่อช่องทาง */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="sec-head"><div>
            <div className="sec-title">ช่องทางที่มา (วัดว่าอันไหนคุ้ม)</div>
            <div className="sec-sub">นับจากลูกค้าที่ระบุช่องทาง · Conversion = ปิดได้ ÷ ทั้งหมด</div>
          </div></div>
          {srcRows.length === 0 && <div className="empty sm">ยังไม่มีลูกค้าที่ระบุช่องทาง — ใส่ “ช่องทางที่มา” ในฟอร์มลูกค้าเพื่อเริ่มวัดผล</div>}
          {srcRows.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="pipe-src-tbl">
                <thead><tr><th>ช่องทาง</th><th>ลูกค้าทั้งหมด</th><th>ปิดได้</th><th>Conversion</th></tr></thead>
                <tbody>{srcRows.map((r) => (
                  <tr key={r.s}><td>{r.s}</td><td>{r.total}</td><td>{r.won}</td>
                    <td><span className={"job-badge " + (r.conv >= 30 ? "b-green" : r.conv >= 15 ? "b-amber" : "b-grey")}>{r.conv}%</span></td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>

        {/* บอร์ดขั้นท่อขาย */}
        <div className="pipe-cols">
          {PIPE_STAGES.map((st) => {
            const items = (byStage[st.v] || []).slice().sort((a, b) => (a.next_followup || "9999").localeCompare(b.next_followup || "9999"));
            const sum = items.reduce((a, c) => a + (Number(c.est_value) || 0), 0);
            return (
              <div className="pipe-col" key={st.v}>
                <div className="pipe-col-hd">
                  <span>{st.emoji} {st.t}</span>
                  <span className="cnt">{items.length}{sum > 0 ? ` · ${fmtBaht(sum)}` : ""}</span>
                </div>
                {items.length === 0 && <div className="empty sm" style={{ padding: "8px 2px", fontSize: 12 }}>—</div>}
                {items.map((c) => {
                  const late = c.next_followup && c.next_followup < today() && !STAGE_BY[c.stage]?.done;
                  return (
                    <div className="pipe-card" key={c.id}>
                      <div className="nm" onClick={() => onOpenCustomer && onOpenCustomer(c.id)} title="เปิดข้อมูลลูกค้า">{c.name}</div>
                      <div className="mt">
                        {c.owner_id && <span>👤 {staffName[c.owner_id] || "—"}</span>}
                        {Number(c.est_value) > 0 && <span>💰 {fmtBaht(c.est_value)}</span>}
                        {c.source && <span>📍 {c.source}</span>}
                        {c.next_followup && <span className={late ? "due-late" : ""}>🗓 {fmtDate(c.next_followup)}{late ? " (เลย)" : ""}</span>}
                      </div>
                      <select className="mini" value={c.stage} onChange={(e) => changeStage(c, e.target.value)} title="ย้ายขั้น">
                        {PIPE_STAGES.map((s) => <option key={s.v} value={s.v}>{s.emoji} {s.t}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <p className="page-sub" style={{ marginTop: 12 }}>* บอร์ดแสดงเฉพาะลูกค้าที่อยู่ในท่อขาย (มีการตั้งขั้น) · ตั้งช่องทาง/ขั้น/ผู้ดูแลได้ในฟอร์มลูกค้า หรือย้ายขั้นจากการ์ดตรงนี้</p>
      </>}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
