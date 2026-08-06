import React from "react";

// หน้าให้คะแนนความพอใจ (แยกจากเอกสารส่งมอบ) — ลูกค้าเปิดจากลิงก์ ?rate=<id>&t=<token>
// ดึงข้อมูลย่อ (บริษัท/งาน/สถานะ) จาก /api/handover-view (token เดียวกัน) แล้วโชว์เฉพาะการ์ดให้ดาว
export default function PublicRating({ id, token }) {
  const [state, setState] = React.useState({ loading: true });
  React.useEffect(() => {
    fetch(`/api/handover-view?id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status); return r.json(); })
      .then((d) => setState({ loading: false, data: d }))
      .catch((e) => setState({ loading: false, error: String(e.message || e) }));
  }, [id, token]);

  if (state.loading) return <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#64748b" }}>กำลังโหลด…</div>;
  if (state.error) return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
      <div><div style={{ fontSize: 40 }}>🔒</div><div style={{ fontWeight: 700, marginTop: 8 }}>เปิดลิงก์ไม่ได้</div>
        <div style={{ color: "#64748b", marginTop: 4, fontSize: 14 }}>ลิงก์ไม่ถูกต้องหรือหมดอายุ — กรุณาติดต่อร้าน</div></div>
    </div>
  );

  const { handover, company } = state.data;
  const co = company?.vat?.name ? company.vat : (company?.novat || company || {});
  const coName = co.name || "AMC AIR";
  const custName = handover?.customer_name || "";

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#1e74e0 0%,#3b8ff0 34%,#eaf3fe 34%,#eaf3fe 100%)", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 14px 48px", fontFamily: '"Segoe UI","Leelawadee UI","Noto Sans Thai",Tahoma,sans-serif' }}>
      {/* หัวสีแบรนด์ + ข้อความเชิญชวน */}
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center", color: "#fff", padding: "34px 8px 20px" }}>
        {co.logo_url ? <img src={co.logo_url} alt="" style={{ height: 46, marginBottom: 12, objectFit: "contain", filter: "brightness(0) invert(1)" }} /> : <div style={{ fontSize: 40 }}>❄️</div>}
        <div style={{ fontWeight: 800, fontSize: 19, marginTop: 4 }}>{coName}</div>
      </div>

      {/* การ์ดขาว: ข้อความขอคะแนน + ดาว */}
      <div style={{ maxWidth: 440, width: "100%", background: "#fff", borderRadius: 20, boxShadow: "0 12px 40px rgba(20,40,80,.16)", padding: "26px 20px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 6 }}>🙏</div>
        <div style={{ fontWeight: 800, fontSize: 20, color: "#0f172a" }}>ขอบคุณที่ไว้วางใจเรา{custName ? ` คุณ${custName.split(" ")[0]}` : ""}</div>
        <div style={{ color: "#475569", fontSize: 14.5, marginTop: 8, lineHeight: 1.6 }}>
          บริการของทีมช่างเราเป็นอย่างไรบ้างครับ?<br />รบกวนให้คะแนนความพอใจสักนิดนะครับ<br />
          <span style={{ color: "#64748b", fontSize: 13 }}>ความเห็นของคุณมีค่ากับเรามาก และช่วยให้เราพัฒนาบริการให้ดียิ่งขึ้น 💙</span>
        </div>
        <RatingCard id={id} token={token} initial={handover?.cust_rating || 0} initialComment={handover?.cust_comment || ""} />
      </div>
      <div style={{ color: "#64748b", fontSize: 12.5, marginTop: 20 }}>© {coName}{handover?.job_no ? ` · งาน ${handover.job_no}` : ""}</div>
    </div>
  );
}

// การ์ดให้คะแนน — ให้ดาว 1-5 + ความเห็น (บันทึกผ่าน /api/handover-rate)
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
  if (done) return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #f1f5f9" }}>
      <div style={{ fontSize: 40, letterSpacing: 5, color: "#f59e0b" }}>{"★".repeat(rating)}<span style={{ color: "#e5e7eb" }}>{"★".repeat(5 - rating)}</span></div>
      <div style={{ fontWeight: 700, fontSize: 16, marginTop: 10, color: "#16a34a" }}>✓ ส่งคะแนนแล้ว — ขอบคุณมากครับ 🙏</div>
    </div>
  );
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 46, letterSpacing: 7, cursor: "pointer", userSelect: "none" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            style={{ color: n <= shown ? "#f59e0b" : "#e2e8f0", transition: "color .1s" }}>★</span>
        ))}
      </div>
      <div style={{ height: 20, color: "#f59e0b", fontWeight: 700, fontSize: 15, marginTop: 2 }}>{labels[shown] || "แตะดาวเพื่อให้คะแนน"}</div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="ความเห็นเพิ่มเติม (ไม่บังคับ)"
        style={{ width: "100%", margin: "12px auto 0", display: "block", border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 12px", fontSize: 14.5, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
      {err && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{err}</div>}
      <button onClick={submit} disabled={busy} style={{ marginTop: 14, width: "100%", background: rating >= 1 ? "#16a34a" : "#94a3b8", color: "#fff", border: 0, borderRadius: 12, padding: "13px", fontWeight: 800, fontSize: 16, cursor: "pointer", opacity: busy ? .6 : 1, transition: "background .15s" }}>
        {busy ? "กำลังส่ง…" : "ส่งคะแนน"}
      </button>
    </div>
  );
}
