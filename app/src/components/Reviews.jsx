import React from "react";
import { listReviews, publishReview, unpublishReview } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";

// รีวิวลูกค้าจริง (จากคะแนนบนใบงาน) + ส่งขึ้นเว็บ / ลบจากเว็บ (คุมว่ารีวิวไหนโชว์หน้า amcair.net)
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "";
const firstName = (n) => { const s = String(n || "").replace(/^คุณ\s*/, "").trim().split(/\s+/)[0]; return s ? "คุณ" + s : "ลูกค้า"; };
const STARS = [["all", "ทุกคะแนน"], ["5", "5 ดาว"], ["4", "4 ดาว+"], ["low", "≤ 3 ดาว"]];

export default function Reviews({ role }) {
  const [rows, setRows] = React.useState(null);
  const [starF, setStarF] = React.useState("all");
  const [onlyComment, setOnlyComment] = React.useState(true);
  const [busy, setBusy] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };
  const canPublish = ["admin", "exec", "sales", "graphic", "hr"].includes(role);

  async function load() {
    try { setRows(await listReviews()); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); setRows([]); }
  }
  React.useEffect(() => { load(); }, []);

  async function publish(r) {
    setBusy(r.job_no);
    try {
      await publishReview({ job_no: r.job_no, name: firstName(r.customer_name), role: "ลูกค้า AMC AIR", text: r.comment, stars: r.rating });
      setRows((rs) => rs.map((x) => x.job_no === r.job_no ? { ...x, published: true } : x));
      flash("ส่งขึ้นเว็บแล้ว ✓ (โชว์ที่ amcair.net) — จัดชื่อ/ลำดับเพิ่มได้ที่ จัดการเว็บไซต์ → รีวิว");
      load();   // รีเฟรชให้ได้ web_review_id ไว้กดลบ
    } catch (e) { flash("ส่งไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(null);
  }
  async function unpublish(r) {
    if (!await confirmDialog({ title: "ลบรีวิวนี้ออกจากเว็บ?", message: "รีวิวจะหายจากหน้า amcair.net (คะแนนในระบบยังอยู่)", confirmText: "ลบจากเว็บ" })) return;
    setBusy(r.job_no);
    try {
      if (r.web_review_id) await unpublishReview(r.web_review_id);
      setRows((rs) => rs.map((x) => x.job_no === r.job_no ? { ...x, published: false, web_review_id: null } : x));
      flash("ลบออกจากเว็บแล้ว");
    } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(null);
  }

  const all = rows || [];
  const shown = all.filter((r) => {
    if (onlyComment && !(r.comment && r.comment.trim())) return false;
    if (starF === "5") return r.rating === 5;
    if (starF === "4") return r.rating >= 4;
    if (starF === "low") return r.rating <= 3;
    return true;
  });
  const avg = all.length ? (all.reduce((a, r) => a + (r.rating || 0), 0) / all.length) : 0;
  const pubCount = all.filter((r) => r.published).length;

  return (
    <div className="adm">
      <div className="adm-head"><div>
        <h1 className="page-title">รีวิวลูกค้า <span className="page-title-en">Customer Reviews</span></h1>
        <p className="page-sub">คะแนน+ความเห็นจริงจากลูกค้า (จากลิงก์ให้คะแนนหลังจบงาน) · เลือก “ส่งขึ้นเว็บ” เพื่อโชว์ที่ amcair.net · ลบออกได้ทุกเมื่อ</p>
      </div></div>

      {rows === null && <div className="card"><div className="empty">กำลังโหลด…</div></div>}

      {rows !== null && <>
        <div className="kpi-tiles" style={{ marginBottom: 14 }}>
          <div className="kpi-tile"><span className="kpi-tile-lb">รีวิวทั้งหมด</span><b>{all.length} <small>งาน</small></b></div>
          <div className="kpi-tile"><span className="kpi-tile-lb">คะแนนเฉลี่ย</span><b>{avg ? avg.toFixed(1) : "—"} <small>★</small></b></div>
          <div className="kpi-tile"><span className="kpi-tile-lb">โชว์บนเว็บอยู่</span><b>{pubCount} <small>รีวิว</small></b></div>
        </div>

        <div className="cat-filter" style={{ marginBottom: 12, alignItems: "center", gap: 8 }}>
          {STARS.map(([v, l]) => (
            <button key={v} className={"cat-chip" + (starF === v ? " on" : "")} onClick={() => setStarF(v)}
              style={starF === v ? { background: "#f59e0b", color: "#fff", borderColor: "#f59e0b" } : {}}>{l}</button>
          ))}
          <label className="jo-dim" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
            <input type="checkbox" checked={onlyComment} onChange={(e) => setOnlyComment(e.target.checked)} /> เฉพาะที่มีข้อความ
          </label>
        </div>

        {shown.length === 0 && <div className="card"><div className="empty">ยังไม่มีรีวิวตามตัวกรอง{onlyComment ? " (ลองปิด “เฉพาะที่มีข้อความ”)" : ""}</div></div>}

        <div className="rev-list">
          {shown.map((r) => (
            <div className="card rev-card" key={r.job_no}>
              <div className="rev-card-main">
                <div className="rev-stars">{"★".repeat(r.rating)}<span className="rev-star-off">{"★".repeat(5 - r.rating)}</span></div>
                {r.comment ? <p className="rev-text">“{r.comment}”</p> : <p className="rev-text jo-dim">— ให้ดาวแต่ไม่ได้เขียนข้อความ —</p>}
                <div className="jo-dim" style={{ fontSize: 12.5 }}>{firstName(r.customer_name)} · งาน {r.job_no}{r.team ? ` · ${r.team}` : ""} · {fmtDate(r.rated_at)}</div>
              </div>
              <div className="rev-card-act">
                {r.published
                  ? <>
                      <span className="job-badge b-green">✓ อยู่บนเว็บ</span>
                      {canPublish && <button className="btn-ghost sm danger" disabled={busy === r.job_no} onClick={() => unpublish(r)}>ลบจากเว็บ</button>}
                    </>
                  : canPublish && <button className="btn-primary sm" disabled={busy === r.job_no || !(r.comment && r.comment.trim())} title={!(r.comment && r.comment.trim()) ? "ไม่มีข้อความ — ส่งขึ้นเว็บไม่ได้" : "โชว์รีวิวนี้ที่ amcair.net"} onClick={() => publish(r)}>{busy === r.job_no ? "…" : "⬆️ ส่งขึ้นเว็บ"}</button>}
              </div>
            </div>
          ))}
        </div>

        <p className="page-sub" style={{ marginTop: 12 }}>* ส่งขึ้นเว็บใช้ชื่อจริงแบบสุภาพ (คุณ+ชื่อต้น) · ปรับชื่อ/รูป/ลำดับ/คำอธิบายเพิ่มได้ที่ <b>จัดการเว็บไซต์ → รีวิวลูกค้า</b> · รีวิวที่ทีมกราฟิกพิมพ์เองยังอยู่ครบ</p>
      </>}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
