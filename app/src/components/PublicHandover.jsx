import React from "react";
import JobHandover from "./JobHandover";

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
    </div>
  );
}
