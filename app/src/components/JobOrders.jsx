import React from "react";
import { listJobOrders, saveJobOrder, deleteJobOrder, listCustomers, listTeams, listQuotations } from "../lib/api";
import { UIcon } from "../icons";

const STATUS = {
  pending: { th: "รอจ่ายงาน", cls: "open" }, scheduled: { th: "นัดแล้ว", cls: "open" },
  in_progress: { th: "กำลังทำ", cls: "open" }, done: { th: "เสร็จ", cls: "closed" }, cancelled: { th: "ยกเลิก", cls: "closed" },
};
const STATUS_OPTS = [["pending", "รอจ่ายงาน"], ["scheduled", "นัดแล้ว"], ["in_progress", "กำลังทำ"], ["done", "เสร็จ"], ["cancelled", "ยกเลิก"]];
function genNo() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `JOB-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }

export default function JobOrders({ role, prefill, onPrefillConsumed }) {
  const canEdit = role === "admin" || role === "sales";
  const [list, setList] = React.useState([]);
  const [custs, setCusts] = React.useState([]);
  const [teams, setTeams] = React.useState([]);
  const [quotes, setQuotes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [ed, setEd] = React.useState(null);

  async function load() {
    setLoading(true);
    try { const [j, c, t, q] = await Promise.all([listJobOrders(), listCustomers(), listTeams(), listQuotations()]); setList(j); setCusts(c); setTeams(t); setQuotes(q); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }

  // open editor prefilled from an approved quotation
  React.useEffect(() => {
    if (!prefill) return;
    const q = prefill;
    const cust = custs.find((c) => String(c.id) === String(q.customer_id));
    const site = cust?.sites?.find((s) => String(s.id) === String(q.site_id));
    const contact = cust?.contacts?.[0];
    const details = (q.items || []).map((it, i) => `${i + 1}. ${it.name || it.item_code} × ${it.qty} ${it.unit || ""}`).join("\n");
    setEd({
      job_no: genNo(), quote_no: q.quote_no, customer_id: q.customer_id || "", site_id: q.site_id || "",
      title: q.title || "", contact_name: contact?.name || "", contact_phone: contact?.phone || "",
      address: site?.address || cust?.address || "", map_url: site?.map_url || "", details,
      assigned_team: "", date: "", time: "", status: "pending",
    });
    onPrefillConsumed && onPrefillConsumed();
  }, [prefill, custs]);

  function startNew() { setEd({ job_no: genNo(), quote_no: "", customer_id: "", site_id: "", title: "", contact_name: "", contact_phone: "", address: "", map_url: "", details: "", assigned_team: "", date: "", time: "", status: "pending" }); }
  function startEdit(jo) {
    const dt = jo.scheduled_at ? new Date(jo.scheduled_at) : null;
    const p = (n) => String(n).padStart(2, "0");
    setEd({ ...jo, customer_id: jo.customer_id || "", site_id: jo.site_id || "", assigned_team: jo.assigned_team || "",
      date: dt ? `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}` : "", time: dt ? `${p(dt.getHours())}:${p(dt.getMinutes())}` : "",
      contact_name: jo.contact_name || "", contact_phone: jo.contact_phone || "", address: jo.address || "", map_url: jo.map_url || "", details: jo.details || "", title: jo.title || "" });
  }
  const cust = custs.find((c) => String(c.id) === String(ed?.customer_id));
  const setF = (k, v) => setEd((e) => ({ ...e, [k]: v }));
  function onCustomer(id) {
    const c = custs.find((x) => String(x.id) === String(id));
    setEd((e) => ({ ...e, customer_id: id, site_id: "", contact_name: c?.contacts?.[0]?.name || "", contact_phone: c?.contacts?.[0]?.phone || "", address: c?.address || "", map_url: "" }));
  }
  function onSite(id) {
    const s = cust?.sites?.find((x) => String(x.id) === String(id));
    setEd((e) => ({ ...e, site_id: id, address: s?.address || e.address, map_url: s?.map_url || e.map_url }));
  }

  async function save() {
    if (!ed.title?.trim() && !ed.customer_id) return flash("ใส่ลูกค้าหรือชื่องาน", true);
    const scheduled_at = ed.date ? `${ed.date}T${ed.time || "08:00"}:00` : null;
    const status = ed.status === "pending" && ed.assigned_team && ed.date ? "scheduled" : ed.status;
    try { await saveJobOrder({ ...ed, scheduled_at, status }); flash("บันทึกใบงานแล้ว"); setEd(null); await load(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(jo) { if (!confirm(`ลบใบงาน ${jo.job_no}?`)) return; try { await deleteJobOrder(jo.job_no); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }

  // ---------- EDITOR ----------
  if (ed) {
    return (
      <div className="adm">
        <div className="adm-head"><div><h1 className="page-title">ใบงาน <span className="page-title-en">Job Order</span></h1>
          <p className="page-sub">ข้อมูลงาน · มอบหมายทีมช่าง · นัดวัน-เวลา</p></div></div>
        <div className="card" style={{ maxWidth: 800 }}>
          <div className="fld-row">
            <label className="fld"><span>เลขที่ใบงาน</span><input className="inp" value={ed.job_no} onChange={(e) => setF("job_no", e.target.value)} /></label>
            <label className="fld"><span>ชื่องาน</span><input className="inp" value={ed.title} onChange={(e) => setF("title", e.target.value)} placeholder="เช่น ติดตั้งแอร์ออฟฟิศ" /></label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>ลูกค้า</span>
              <select className="inp" value={ed.customer_id} onChange={(e) => onCustomer(e.target.value)}>
                <option value="">— เลือกลูกค้า —</option>{custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="fld"><span>ไซต์งาน</span>
              <select className="inp" value={ed.site_id} onChange={(e) => onSite(e.target.value)} disabled={!cust?.sites?.length}>
                <option value="">{cust?.sites?.length ? "— เลือกไซต์ —" : "(ไม่มีไซต์)"}</option>
                {cust?.sites?.map((s) => <option key={s.id} value={s.id}>{s.site_name || s.address}</option>)}
              </select>
            </label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>ผู้ติดต่อ</span><input className="inp" value={ed.contact_name} onChange={(e) => setF("contact_name", e.target.value)} /></label>
            <label className="fld"><span>เบอร์โทร</span><input className="inp" value={ed.contact_phone} onChange={(e) => setF("contact_phone", e.target.value)} /></label>
          </div>
          <label className="fld"><span>ที่อยู่หน้างาน</span><textarea className="inp" rows={2} style={{ resize: "vertical" }} value={ed.address} onChange={(e) => setF("address", e.target.value)} /></label>
          <label className="fld"><span>ลิงก์แผนที่ (Google Maps)</span><input className="inp" value={ed.map_url} onChange={(e) => setF("map_url", e.target.value)} placeholder="วางลิงก์แผนที่" /></label>
          <label className="fld"><span>รายละเอียดงาน / รายการที่ต้องทำ</span><textarea className="inp" rows={4} style={{ resize: "vertical" }} value={ed.details} onChange={(e) => setF("details", e.target.value)} /></label>

          <div className="fld-row">
            <label className="fld"><span>มอบหมายทีมช่าง</span>
              <div className="team-pick-row">
                {teams.map((t) => (
                  <button key={t.id} className={"team-pick" + (ed.assigned_team === t.id ? " on" : "")} onClick={() => setF("assigned_team", t.id)}
                    style={ed.assigned_team === t.id ? { background: t.color, borderColor: t.color, color: "#fff" } : {}}>
                    <span style={{ width: 8, height: 8, borderRadius: 9, background: ed.assigned_team === t.id ? "#fff" : t.color }} />{t.name.replace("Team ", "")}
                  </button>
                ))}
              </div>
            </label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>วันนัด</span><input className="inp" type="date" value={ed.date} onChange={(e) => setF("date", e.target.value)} /></label>
            <label className="fld"><span>เวลา</span><input className="inp" type="time" value={ed.time} onChange={(e) => setF("time", e.target.value)} /></label>
          </div>
          <label className="fld"><span>สถานะ</span>
            <select className="inp" value={ed.status} onChange={(e) => setF("status", e.target.value)}>{STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn-ghost" onClick={() => setEd(null)}>ยกเลิก</button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> บันทึกใบงาน</button>
          </div>
        </div>
        {toast && <Toast t={toast} />}
      </div>
    );
  }

  // ---------- LIST ----------
  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ใบงาน <span className="page-title-en">Job Orders</span></h1><p className="page-sub">{list.length} ใบ · มอบหมาย & จัดคิวงานช่าง</p></div>
        {canEdit && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> สร้างใบงาน</button>}
      </div>
      {loading && <div className="empty">กำลังโหลด…</div>}
      {!loading && list.length === 0 && <div className="empty">ยังไม่มีใบงาน</div>}
      <div className="job-cards">
        {list.map((jo) => {
          const st = STATUS[jo.status] || STATUS.pending;
          const dt = jo.scheduled_at ? new Date(jo.scheduled_at) : null;
          return (
            <div className={"card job-card" + (jo.status === "done" || jo.status === "cancelled" ? " closed" : "")} key={jo.job_no}>
              <div className="job-card-head" style={{ cursor: "default" }}>
                <div className="job-card-id"><span className="job-no">{jo.job_no}</span><span className={"job-badge " + st.cls}>{st.th}</span></div>
                <div className="job-card-meta">{jo.customerName || "-"}{jo.title ? ` · ${jo.title}` : ""} · ทีม {jo.teamName || "ยังไม่มอบ"}{dt ? ` · ${dt.toLocaleDateString("th-TH")} ${dt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
                <div style={{ flex: "none" }}>{jo.map_url && <a href={jo.map_url} target="_blank" rel="noreferrer" className="btn-ghost sm" onClick={(e) => e.stopPropagation()}>📍 แผนที่</a>}</div>
              </div>
              {canEdit && (
                <div className="job-lines"><div className="job-actions">
                  <button className="btn-ghost sm" onClick={() => startEdit(jo)}><UIcon name="edit" size={14} /> แก้ไข</button>
                  <button className="btn-ghost sm danger" onClick={() => del(jo)}><UIcon name="trash" size={14} /> ลบ</button>
                </div></div>
              )}
            </div>
          );
        })}
      </div>
      {toast && <Toast t={toast} />}
    </div>
  );
}

function Toast({ t }) {
  return <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: t.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center" }}>{t.m}</div>;
}
