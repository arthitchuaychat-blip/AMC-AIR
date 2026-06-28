import React from "react";
import { listWebOrders, setWebOrderStatus } from "../lib/api";
import { fmtBaht } from "../lib/format";

const STATUS = [
  ["new", "ใหม่", "#dc2626", "#fee2e2"],
  ["contacted", "ติดต่อแล้ว", "#d97706", "#fef3c7"],
  ["quoted", "เสนอราคาแล้ว", "#1d4ed8", "#dbeafe"],
  ["done", "ปิดการขาย", "#059669", "#dcf5e8"],
  ["cancelled", "ยกเลิก", "#64748b", "#f1f5f9"],
];
const ST = Object.fromEntries(STATUS.map((s) => [s[0], s]));
const thDateTime = (s) => { try { return new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return s; } };

export default function WebOrders({ role }) {
  const [rows, setRows] = React.useState(null);
  const [statusF, setStatusF] = React.useState("all");
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2600); };

  async function load() {
    try { setRows(await listWebOrders()); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e) + " (รัน 071_website.sql แล้วหรือยัง?)", true); setRows([]); }
  }
  React.useEffect(() => { load(); }, []);

  async function changeStatus(o, status) {
    try { await setWebOrderStatus(o.id, status); setRows((rs) => rs.map((x) => x.id === o.id ? { ...x, status } : x)); }
    catch (e) { flash("อัปเดตไม่สำเร็จ: " + (e.message || e), true); }
  }

  const counts = React.useMemo(() => {
    const c = {}; (rows || []).forEach((o) => { c[o.status] = (c[o.status] || 0) + 1; }); return c;
  }, [rows]);
  const shown = (rows || []).filter((o) => statusF === "all" || o.status === statusF);

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">คำสั่งซื้อจากเว็บ <span className="page-title-en">Web Orders</span></h1>
          <p className="page-sub">คำสั่งซื้อ/ขอใบเสนอราคา ที่ส่งเข้ามาจากเว็บไซต์ · จัดการรูป/เนื้อหาเว็บที่เมนู “จัดการเว็บไซต์”</p></div>
        <div className="cat-head-actions" style={{ gap: 8 }}>
          <button className="btn-ghost sm" onClick={load}>🔄 รีเฟรช</button>
        </div>
      </div>

      <div className="cat-filter" style={{ marginBottom: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className={"cat-chip" + (statusF === "all" ? " on" : "")} onClick={() => setStatusF("all")}>ทั้งหมด ({rows?.length || 0})</button>
        {STATUS.map(([v, l, c]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)}
            style={statusF === v ? { background: c, color: "#fff", borderColor: c } : {}}>{l}{counts[v] ? ` (${counts[v]})` : ""}</button>
        ))}
      </div>

      {rows === null ? <div className="empty">กำลังโหลด…</div>
        : shown.length === 0 ? <div className="empty" style={{ padding: 40 }}>{statusF === "all" ? "ยังไม่มีคำสั่งซื้อจากเว็บ" : "ไม่มีรายการในสถานะนี้"}</div>
        : (
          <div className="wo-list">
            {shown.map((o) => { const st = ST[o.status] || ST.new; const items = Array.isArray(o.items) ? o.items : []; return (
              <div key={o.id} className="wo-card card">
                <div className="wo-head">
                  <span className="wo-badge" style={{ color: st[2], background: st[3] }}>{st[1]}</span>
                  <b className="wo-name">{o.name}</b>
                  <a className="wo-phone" href={`tel:${o.phone}`}>📞 {o.phone}</a>
                  <span className="wo-time">{thDateTime(o.created_at)}</span>
                </div>
                {(o.address || o.note) && (
                  <div className="wo-meta">
                    {o.address && <div>📍 {o.address}</div>}
                    {o.email && <div>✉️ {o.email}</div>}
                    {o.note && <div>📝 {o.note}</div>}
                  </div>
                )}
                {items.length > 0 && (
                  <div className="wo-items">
                    {items.map((it, i) => (
                      <div className="wo-item" key={i}>
                        <span>{it.name}</span>
                        <span className="wo-item-qty">× {it.qty}</span>
                        <span className="wo-item-pr">{it.price ? fmtBaht(it.price * it.qty) : "สอบถาม"}</span>
                      </div>
                    ))}
                    <div className="wo-total"><span>รวมโดยประมาณ</span><b>{fmtBaht(o.total)}</b></div>
                  </div>
                )}
                <div className="wo-acts">
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>เปลี่ยนสถานะ:</span>
                  {STATUS.map(([v, l, c]) => (
                    <button key={v} className={"wo-st-btn" + (o.status === v ? " on" : "")}
                      style={o.status === v ? { background: c, color: "#fff", borderColor: c } : {}}
                      onClick={() => changeStatus(o, v)}>{l}</button>
                  ))}
                </div>
              </div>
            ); })}
          </div>
        )}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
