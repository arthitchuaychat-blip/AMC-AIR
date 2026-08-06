import React from "react";
import JobHandover from "./JobHandover";

// การ์ดให้คะแนนความพอใจ — ลูกค้าให้ดาว 1-5 + ความเห็น (บันทึกผ่าน /api/handover-rate)
function RatingCard({ id, token, initial, initialComment }) {
  const [rating, setRating] = React.useState(initial || 0);
  const [hover, setHover] = React.useState(0);
  const [comment, setComment] = React.useState(initialComment || "");
  const [done, setDone] = React.useState(!!initial);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const labels = ["", "ต้องปรับปรุง", "พอใช้", "ดี", "ดีมาก", "ประทับใจมาก"];

  async function submit() {
    if (!(rating >= 1)) { setErr("กรุณาเลือกดาวก่อน"); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/handover-rate", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, t: token, rating, comment }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
      setDone(true);
    } catch (e) { setErr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    setBusy(false);
  }

  const shown = hover || rating;
  return (
    <div className="pubho-rate" style={{ maxWidth: 820, margin: "16px auto 0", padding: "0 12px" }}>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 18px", textAlign: "center", boxShadow: "0 2px 12px rgba(0,0,0,.06)" }}>
        {done ? (
          <>
            <div style={{ fontSize: 34 }}>🙏</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginTop: 6 }}>ขอบคุณสำหรับคะแนนครับ</div>
            <div style={{ marginTop: 8, fontSize: 26, letterSpacing: 3, color: "#f59e0b" }}>{"★".repeat(rating)}<span style={{ color: "#e2e8f0" }}>{"★".repeat(5 - rating)}</span></div>
            <div style={{ color: "#64748b", fontSize: 13.5, marginTop: 8 }}>ความเห็นของคุณช่วยให้เราพัฒนาบริการให้ดียิ่งขึ้น</div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: 16 }}>ให้คะแนนความพอใจงานนี้</div>
            <div style={{ color: "#64748b", fontSize: 13.5, marginTop: 3 }}>บริการของทีมช่างเป็นอย่างไรบ้างครับ?</div>
            <div style={{ margin: "14px 0 4px", fontSize: 40, letterSpacing: 6, cursor: "pointer", userSelect: "none" }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
                  style={{ color: n <= shown ? "#f59e0b" : "#e2e8f0", transition: "color .1s" }}>★</span>
              ))}
            </div>
            <div style={{ height: 18, color: "#f59e0b", fontWeight: 600, fontSize: 14 }}>{labels[shown] || ""}</div>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="ความเห็นเพิ่มเติม (ไม่บังคับ)"
              style={{ width: "100%", maxWidth: 420, margin: "10px auto 0", display: "block", border: "1px solid #cbd5e1", borderRadius: 9, padding: "9px 11px", fontSize: 14, resize: "vertical", fontFamily: "inherit" }} />
            {err && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{err}</div>}
            <button onClick={submit} disabled={busy} style={{ marginTop: 12, background: "#16a34a", color: "#fff", border: 0, borderRadius: 9, padding: "10px 26px", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: busy ? .6 : 1 }}>
              {busy ? "กำลังส่ง…" : "ส่งคะแนน"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Public read-only view of a handover sheet, opened by the customer from a LINE link (?ho=<id>&t=<token>).
// No login: data comes from the token-gated /api/handover-view endpoint; renders the same JobHandover sheet.
export default function PublicHandover({ id, token }) {
  const [state, setState] = React.useState({ loading: true });
  React.useEffect(() => {
    fetch(`/api/handover-view?id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status); return r.json(); })
      .then((d) => setState({ loading: false, data: d }))
      .catch((e) => setState({ loading: false, error: String(e.message || e) }));
  }, [id, token]);

  if (state.loading) return <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#64748b" }}>กำลังโหลดเอกสาร…</div>;
  if (state.error) return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
      <div><div style={{ fontSize: 40 }}>🔒</div><div style={{ fontWeight: 700, marginTop: 8 }}>เปิดเอกสารไม่ได้</div>
        <div style={{ color: "#64748b", marginTop: 4, fontSize: 14 }}>ลิงก์ไม่ถูกต้องหรือหมดอายุ — กรุณาติดต่อร้าน</div></div>
    </div>
  );

  const { handover, company } = state.data;
  const co = company?.vat?.name ? company.vat : (company?.novat || company || {});
  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh", padding: "0 0 40px" }}>
      <style>{`@media print { .pubho-bar, .pubho-rate { display:none !important; } .pubho-page { background:#fff !important; padding:0 !important; } }`}</style>
      <div className="pubho-bar" style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
        <b style={{ flex: 1, fontSize: 15 }}>🧾 ใบส่งมอบงาน · {co.name || "AMC AIR"}</b>
        <button onClick={() => window.print()} style={{ background: "#16a34a", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>🖨️ พิมพ์ / บันทึก PDF</button>
      </div>
      <div className="pubho-page" style={{ maxWidth: 820, margin: "0 auto", padding: "16px 12px" }}>
        <div className="doc-capture-wrap" style={{ background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,.08)", borderRadius: 8, padding: "22px 20px" }}>
          <JobHandover handover={handover} company={co} />
        </div>
      </div>
      {/* ให้คะแนนความพอใจ — เฉพาะใบที่ส่งมอบแล้ว (งานเสร็จ) */}
      {handover?.status === "submitted" && (
        <RatingCard id={id} token={token} initial={handover.cust_rating || 0} initialComment={handover.cust_comment || ""} />
      )}
    </div>
  );
}
