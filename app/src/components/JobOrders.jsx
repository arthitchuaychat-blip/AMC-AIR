import React from "react";
import { listJobOrders, saveJobOrder, deleteJobOrder, listCustomers, listTeams, listQuotations, uploadMaterialPhoto, listDocLinks } from "../lib/api";
import { SLOTS, slotStartTime, jobsOverlap, scheduleLabel } from "../lib/schedule";
import { buildOrderConfirm } from "../lib/confirmText";
import { UIcon } from "../icons";
import JobTimeline from "./JobTimeline";
import DocChips from "./DocChips";

const STATUS = {
  pending: { th: "รอจ่ายงาน", cls: "b-grey" }, scheduled: { th: "นัดแล้ว", cls: "b-blue" },
  in_progress: { th: "กำลังทำ", cls: "b-amber" }, done: { th: "เสร็จ", cls: "b-green" }, cancelled: { th: "ยกเลิก", cls: "b-red" },
};
const STATUS_OPTS = [["pending", "รอจ่ายงาน"], ["scheduled", "นัดแล้ว"], ["in_progress", "กำลังทำ"], ["done", "เสร็จ"], ["cancelled", "ยกเลิก"]];
function genNo() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `JOB-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }
const mapLink = (addr) => (addr && addr.trim()) ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr.trim()) : "";

const blankEd = () => ({ job_no: genNo(), quote_no: "", customer_id: "", site_id: "", title: "", contact_name: "", contact_phone: "", address: "", map_url: "", details: "", sales_note: "", sales_photos: [], assigned_team: "", date: "", end_date: "", slot: "morning", time: "", status: "pending" });

export default function JobOrders({ role, me, focus, onFocusConsumed, prefill, onPrefillConsumed, schedule, onScheduleConsumed, onOpenQuote, onOpenBoq, onOpenDoc }) {
  const canEdit = ["admin", "sales", "exec", "finance"].includes(role);
  const [openTl, setOpenTl] = React.useState(null);
  const [upBrief, setUpBrief] = React.useState(false);
  const [list, setList] = React.useState([]);
  const [custs, setCusts] = React.useState([]);
  const [teams, setTeams] = React.useState([]);
  const [quotes, setQuotes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [ed, setEd] = React.useState(null);
  const [statusF, setStatusF] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [docLinks, setDocLinks] = React.useState({ byQuote: {} });

  async function load() {
    setLoading(true);
    try { const [j, c, t, q, dl] = await Promise.all([listJobOrders(), listCustomers(), listTeams(), listQuotations(), listDocLinks()]); setList(j); setCusts(c); setTeams(t); setQuotes(q); setDocLinks(dl); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }
  // open focused on a specific job order (from the dashboard report link)
  React.useEffect(() => { if (!focus) return; setEd(null); setStatusF("all"); setQ(focus); onFocusConsumed && onFocusConsumed(); }, [focus]);

  // open editor prefilled from an approved quotation
  React.useEffect(() => {
    if (!prefill) return;
    const q = prefill;
    const cust = custs.find((c) => String(c.id) === String(q.customer_id));
    const site = cust?.sites?.find((s) => String(s.id) === String(q.site_id));
    const contact = cust?.contacts?.[0];
    const details = (q.items || []).map((it, i) => `${i + 1}. ${it.name || it.item_code} × ${it.qty} ${it.unit || ""}`).join("\n");
    setEd({
      ...blankEd(), quote_no: q.quote_no, customer_id: q.customer_id || "", site_id: q.site_id || "",
      title: q.title || "", contact_name: contact?.name || "", contact_phone: contact?.phone || "",
      address: site?.address || cust?.address || "", map_url: site?.map_url || mapLink(site?.address || cust?.address), details,
    });
    onPrefillConsumed && onPrefillConsumed();
  }, [prefill, custs]);

  // open a new job editor prefilled from a calendar slot (date/team/slot picked on the Schedule page)
  React.useEffect(() => {
    if (!schedule) return;
    setEd({ ...blankEd(), date: schedule.date || "", end_date: schedule.end_date || "", slot: schedule.slot || "morning", assigned_team: schedule.assigned_team || "" });
    onScheduleConsumed && onScheduleConsumed();
  }, [schedule]);

  function startNew() { setEd(blankEd()); }
  function startEdit(jo) {
    const dt = jo.scheduled_at ? new Date(jo.scheduled_at) : null;
    const p = (n) => String(n).padStart(2, "0");
    setEd({ ...jo, _edit: true, customer_id: jo.customer_id || "", site_id: jo.site_id || "", assigned_team: jo.assigned_team || "",
      date: dt ? `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}` : "", time: dt ? `${p(dt.getHours())}:${p(dt.getMinutes())}` : "",
      end_date: jo.end_date || "", slot: jo.slot || "custom",
      contact_name: jo.contact_name || "", contact_phone: jo.contact_phone || "", address: jo.address || "", map_url: jo.map_url || "", details: jo.details || "", title: jo.title || "",
      sales_note: jo.sales_note || "", sales_photos: jo.sales_photos || [] });
  }
  async function onBriefFiles(e) {
    const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
    setUpBrief(true);
    try { const urls = []; for (const f of files) urls.push(await uploadMaterialPhoto(f, ed.job_no)); setEd((s) => ({ ...s, sales_photos: [...(s.sales_photos || []), ...urls] })); }
    catch (ex) { flash("อัปโหลดรูปไม่สำเร็จ: " + (ex.message || ex), true); }
    setUpBrief(false);
  }
  const removeBriefPhoto = (i) => setEd((s) => ({ ...s, sales_photos: (s.sales_photos || []).filter((_, j) => j !== i) }));
  const cust = custs.find((c) => String(c.id) === String(ed?.customer_id));
  const setF = (k, v) => setEd((e) => ({ ...e, [k]: v }));
  function onCustomer(id) {
    const c = custs.find((x) => String(x.id) === String(id));
    setEd((e) => ({ ...e, customer_id: id, site_id: "", contact_name: c?.contacts?.[0]?.name || "", contact_phone: c?.contacts?.[0]?.phone || "", address: c?.address || "", map_url: mapLink(c?.address) }));
  }
  function onSite(id) {
    const s = cust?.sites?.find((x) => String(x.id) === String(id));
    const addr = s?.address || cust?.address || "";
    setEd((e) => ({ ...e, site_id: id, address: addr || e.address, map_url: s?.map_url || mapLink(addr) || e.map_url }));
  }

  async function save() {
    if (!ed.title?.trim() && !ed.customer_id) return flash("ใส่ลูกค้าหรือชื่องาน", true);
    if (ed._edit && !window.confirm(`ยืนยันบันทึกการแก้ไขใบงาน ${ed.job_no} ?`)) return;
    const slot = ed.slot || "custom";
    // start time comes from the slot (custom uses the picked time); store the instant as ISO/UTC
    const time = slot === "custom" ? (ed.time || "08:00") : slotStartTime(slot);
    const scheduled_at = ed.date ? new Date(`${ed.date}T${time}:00`).toISOString() : null;
    const end_date = (ed.end_date && ed.date && ed.end_date > ed.date) ? ed.end_date : null;
    const tn = teams.find((t) => t.id === ed.assigned_team)?.name?.replace("Team ", "") || ed.assigned_team;
    // warn on a double-booking: same team, overlapping day-range + slot
    if (ed.assigned_team && scheduled_at) {
      const cand = { job_no: ed.job_no, scheduled_at, end_date, slot };
      const clash = list.find((j) => j.job_no !== ed.job_no && j.assigned_team === ed.assigned_team && j.status !== "cancelled" && jobsOverlap(cand, j));
      if (clash && !window.confirm(`⚠️ ทีม ${tn} มีงานซ้อนช่วงเวลานี้แล้ว:\n${clash.job_no}${clash.title ? " · " + clash.title : ""}\n\nต้องการจองซ้อนหรือไม่?`)) return;
    }
    const status = ed.status === "pending" && ed.assigned_team && ed.date ? "scheduled" : ed.status;
    try {
      await saveJobOrder({ ...ed, scheduled_at, end_date, slot, status });
      flash(ed.assigned_team ? `บันทึก · ส่งงานให้ทีม ${tn} แล้ว ✓` : "บันทึกใบงานแล้ว");
      setEd(null); await load();
    }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(jo) { if (!confirm(`ลบใบงาน ${jo.job_no}?`)) return; try { await deleteJobOrder(jo.job_no); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }

  // copy an order-confirmation message to send to the customer (Line OA)
  function copyConfirm(jo) {
    const text = buildOrderConfirm(jo);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => flash("คัดลอกคอนเฟิมออเดอร์แล้ว ✓")).catch(() => window.prompt("คัดลอกข้อความนี้:", text));
    else window.prompt("คัดลอกข้อความนี้:", text);
  }

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

          <label className="fld"><span>โน้ตถึงทีมช่าง (ฝ่ายขาย → ช่าง)</span>
            <textarea className="inp" rows={2} style={{ resize: "vertical" }} value={ed.sales_note} onChange={(e) => setF("sales_note", e.target.value)} placeholder="ข้อความ/ข้อควรระวังถึงช่าง เช่น ลูกค้าสะดวกช่วงบ่าย, จอดรถหลังตึก, ระวังพื้นไม้" /></label>
          <div className="fld"><span>รูปหน้างานเบื้องต้น (ให้ช่างดูก่อนเข้างาน)</span>
            <div className="myjob-photos">
              {(ed.sales_photos || []).map((u, i) => (
                <div className="myjob-photo" key={i}>
                  <a href={u} target="_blank" rel="noreferrer"><img src={u} alt="" /></a>
                  <button type="button" className="myjob-photo-x" onClick={() => removeBriefPhoto(i)} aria-label="ลบรูป">×</button>
                </div>
              ))}
              <label className="myjob-addphoto">{upBrief ? "…" : "＋ รูป"}
                <input type="file" accept="image/*" multiple onChange={onBriefFiles} hidden />
              </label>
            </div>
          </div>

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
            <label className="fld"><span>วันเริ่มงาน</span><input className="inp" type="date" value={ed.date} onChange={(e) => setF("date", e.target.value)} /></label>
            <label className="fld"><span>วันสิ้นสุด <small style={{ color: "var(--ink-3)", fontWeight: 400 }}>(งานหลายวัน · เว้นว่างได้)</small></span>
              <input className="inp" type="date" min={ed.date || undefined} value={ed.end_date || ""} onChange={(e) => setF("end_date", e.target.value)} /></label>
          </div>
          <div className="fld"><span>ช่วงเวลา</span>
            <div className="slot-pick">
              {SLOTS.map((s) => (
                <button key={s.id} type="button" className={"slot-btn" + (ed.slot === s.id ? " on" : "")} onClick={() => setF("slot", s.id)}>
                  <b>{s.icon} {s.th}</b>{s.time && <small>{s.time}</small>}
                </button>
              ))}
            </div>
          </div>
          {ed.slot === "custom" && (
            <label className="fld" style={{ maxWidth: 220 }}><span>เวลาเริ่ม</span><input className="inp" type="time" value={ed.time} onChange={(e) => setF("time", e.target.value)} /></label>
          )}
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
        <div className="cat-head-actions">
          <div className="cat-search"><UIcon name="search" size={17} color="var(--ink-3)" />
            <input placeholder="ค้นหาเลขงาน / ลูกค้า / เบอร์โทร / ทีมช่าง" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="cat-search-x" onClick={() => setQ("")}><UIcon name="x" size={15} /></button>}
          </div>
          {canEdit && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> สร้างใบงาน</button>}
        </div>
      </div>

      <div className="cat-filter">
        {[["all", "ทั้งหมด"], ...STATUS_OPTS].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)}
            style={statusF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {(() => {
        const ql = q.trim().toLowerCase();
        const fl = list.filter((jo) => (statusF === "all" || jo.status === statusF)
          && (!ql || jo.job_no.toLowerCase().includes(ql) || (jo.customerName || "").toLowerCase().includes(ql) || (jo.teamName || "").toLowerCase().includes(ql) || (jo.title || "").toLowerCase().includes(ql) || (jo.contact_phone || "").toLowerCase().includes(ql)));
        return (<>
          {!loading && fl.length === 0 && <div className="empty">{list.length === 0 ? "ยังไม่มีใบงาน" : "ไม่พบใบงานที่ตรงเงื่อนไข"}</div>}
          <div className="job-cards">
            {fl.map((jo) => {
          const st = STATUS[jo.status] || STATUS.pending;
          return (
            <div className={"card job-card" + (jo.status === "done" || jo.status === "cancelled" ? " closed" : "")} key={jo.job_no}>
              <div className="job-card-head" style={{ cursor: "default" }}>
                <div className="job-card-id"><span className="job-no">{jo.job_no}</span><span className={"job-badge " + st.cls}>{st.th}</span></div>
                <div className="job-card-meta">{jo.title || "งานติดตั้ง/บริการ"} · ทีม {jo.teamName || "ยังไม่มอบ"}{jo.scheduled_at ? ` · 🗓 ${scheduleLabel(jo)}` : ""}</div>
              </div>
              <div className="jo-info">
                <div className="jo-info-row"><span className="jo-ic">🏢</span><b>{jo.customerName || "ไม่ระบุลูกค้า"}</b>{jo.customerAddr ? <span className="jo-dim"> · {jo.customerAddr}</span> : null}</div>
                {(jo.contact_name || jo.contact_phone) && <div className="jo-info-row"><span className="jo-ic">👤</span>{jo.contact_name || "ผู้ติดต่อ"}{jo.contact_phone && <a href={`tel:${jo.contact_phone}`} className="jo-tel">📞 {jo.contact_phone}</a>}</div>}
                {jo.address && <div className="jo-info-row"><span className="jo-ic">📍</span><span style={{ flex: 1 }}>{jo.address}</span>{jo.map_url && <a href={jo.map_url} target="_blank" rel="noreferrer" className="btn-ghost sm" onClick={(e) => e.stopPropagation()}>แผนที่</a>}</div>}
              </div>
              {(() => { const ch = docLinks.byQuote[jo.quote_no] || {}; return <DocChips boqNo={jo.boq_no} quoteNo={jo.quote_no} jobNos={ch.jobNos} invoiceNos={ch.invoiceNos} receiptNos={ch.receiptNos} self={{ type: "job", no: jo.job_no }} onOpen={onOpenDoc} />; })()}
              <div className="job-lines"><div className="job-actions">
                <button className="btn-ghost sm" onClick={() => copyConfirm(jo)}><UIcon name="clipboard" size={14} /> คัดลอกคอนเฟิม</button>
                <button className="btn-ghost sm" onClick={() => setOpenTl(openTl === jo.job_no ? null : jo.job_no)}>
                  <UIcon name="clipboard" size={14} /> {openTl === jo.job_no ? "ซ่อนความเคลื่อนไหว" : "ความเคลื่อนไหว"}
                </button>
                {canEdit && <button className="btn-ghost sm" onClick={() => startEdit(jo)}><UIcon name="edit" size={14} /> แก้ไข</button>}
                {canEdit && <button className="btn-ghost sm danger" onClick={() => del(jo)}><UIcon name="trash" size={14} /> ลบ</button>}
              </div></div>
              {openTl === jo.job_no && <JobTimeline jobNo={jo.job_no} canPost={canEdit} author={me} flash={flash} />}
            </div>
          );
        })}
          </div>
        </>);
      })()}
      {toast && <Toast t={toast} />}
    </div>
  );
}

function Toast({ t }) {
  return <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: t.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center" }}>{t.m}</div>;
}
