import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listJobOrders, saveJobOrder, deleteJobOrder, listCustomers, listTeams, listQuotations, uploadMaterialPhoto, listDocLinks, updateVisitStatus, createLinkedJob } from "../lib/api";
import { SLOTS, slotStartTime, jobsOverlap, scheduleLabel, JOB_TYPES, jobTypeDef, deriveJobStatus, JOB_STATUSES } from "../lib/schedule";
import { UIcon } from "../icons";
import JobTimeline from "./JobTimeline";
import DocChips from "./DocChips";
import AttachThumb from "./AttachThumb";
import { ATTACH_ACCEPT, matchText, matchPhone } from "../lib/format";
import { can } from "../lib/permissions";

const STATUS = Object.fromEntries(JOB_STATUSES.map(([v, l, cls]) => [v, { th: l, cls }]));
const STATUS_OPTS = JOB_STATUSES.map(([v, l]) => [v, l]);
function genNo() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `JOB-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }
const mapLink = (addr) => (addr && addr.trim()) ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr.trim()) : "";

const blankVisit = () => ({ date: "", end_date: "", slot: "morning", time: "", status: "scheduled" });
const blankEd = () => ({ job_no: genNo(), quote_no: "", customer_id: "", site_id: "", title: "", job_type: "install", contact_name: "", contact_phone: "", address: "", map_url: "", details: "", sales_note: "", sales_photos: [], assigned_team: "", visits: [blankVisit()], status: "pending" });

export default function JobOrders({ role, me, focus, onFocusConsumed, prefill, onPrefillConsumed, schedule, onScheduleConsumed, surveyFor, onSurveyConsumed, onOpenQuote, onOpenBoq, onOpenDoc }) {
  const canEdit = can(role, "joborders", "edit");
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
  const [typeF, setTypeF] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [viewing, setViewing] = React.useState(null); // job being viewed (detail modal)
  const [approveCtx, setApproveCtx] = React.useState(null); // { jo, v } → approval choice popup
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

  // open editor prefilled from an approved quotation. Use the quote's own resolved
  // contact/site fields (always present from listQuotations) so it doesn't depend on
  // the customers list having finished loading.
  React.useEffect(() => {
    if (!prefill) return;
    const q = prefill;
    const cust = custs.find((c) => String(c.id) === String(q.customer_id));
    const site = cust?.sites?.find((s) => String(s.id) === String(q.site_id));
    const contact = cust?.contacts?.[0];
    const details = (q.items || []).map((it, i) => `${i + 1}. ${it.name || it.item_code} × ${it.qty} ${it.unit || ""}`).join("\n");
    const address = q.siteAddress || site?.address || q.customerAddr || cust?.address || "";
    setEd({
      ...blankEd(), quote_no: q.quote_no, customer_id: q.customer_id || "", site_id: q.site_id || "",
      title: q.title || "",
      contact_name: q.contactName || contact?.name || "",
      contact_phone: q.contactPhone || contact?.phone || "",
      address, map_url: q.map_url || site?.map_url || mapLink(address), details,
    });
    onPrefillConsumed && onPrefillConsumed();
  }, [prefill, custs]);

  // open a new SURVEY job prefilled with this customer (launched from the chat panel)
  React.useEffect(() => {
    if (!surveyFor || !custs.length) return;
    const c = custs.find((x) => String(x.id) === String(surveyFor));
    const address = c?.address || "";
    setEd({ ...blankEd(), customer_id: String(surveyFor), title: "สำรวจหน้างาน", job_type: "survey",
      contact_name: c?.contacts?.[0]?.name || "", contact_phone: c?.contacts?.[0]?.phone || "",
      address, map_url: mapLink(address) });
    onSurveyConsumed && onSurveyConsumed();
  }, [surveyFor, custs]);

  // open a new job editor prefilled from a calendar slot (date/team/slot picked on the Schedule page)
  React.useEffect(() => {
    if (!schedule) return;
    setEd({ ...blankEd(), assigned_team: schedule.assigned_team || "", visits: [{ ...blankVisit(), date: schedule.date || "", end_date: schedule.end_date || "", slot: schedule.slot || "morning" }] });
    onScheduleConsumed && onScheduleConsumed();
  }, [schedule]);

  // turn a stored job_visit row into the editor's visit shape (keep assigned_team so a done รอบ keeps its team)
  function visitFromRow(v) {
    const dt = (v.slot === "custom" && v.scheduled_at) ? new Date(v.scheduled_at) : null;
    const p = (n) => String(n).padStart(2, "0");
    return { assigned_team: v.assigned_team || "", date: v.visit_date || "", end_date: v.end_date || "", slot: v.slot || "morning", time: dt ? `${p(dt.getHours())}:${p(dt.getMinutes())}` : "", status: v.status || "scheduled" };
  }
  function startNew() { setEd(blankEd()); }
  function startEdit(jo) {
    // prefer the job's visits; fall back to the legacy single schedule for old jobs
    let visits = (jo.visits || []).map(visitFromRow);
    if (!visits.length) {
      const dt = jo.scheduled_at ? new Date(jo.scheduled_at) : null;
      const p = (n) => String(n).padStart(2, "0");
      visits = [{ assigned_team: jo.assigned_team || "", date: dt ? `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}` : "", end_date: jo.end_date || "", slot: jo.slot || "morning", time: dt ? `${p(dt.getHours())}:${p(dt.getMinutes())}` : "", status: jo.status || "scheduled" }];
    }
    setEd({ ...jo, _edit: true, job_type: jo.job_type || "install", customer_id: jo.customer_id || "", site_id: jo.site_id || "",
      assigned_team: jo.assigned_team || jo.visits?.[0]?.assigned_team || "",
      contact_name: jo.contact_name || "", contact_phone: jo.contact_phone || "", address: jo.address || "", map_url: jo.map_url || "", details: jo.details || "", title: jo.title || "",
      sales_note: jo.sales_note || "", sales_photos: jo.sales_photos || [], visits, status: jo.status || "pending" });
  }
  const setVisit = (i, k, v) => setEd((e) => ({ ...e, visits: e.visits.map((r, j) => j === i ? { ...r, [k]: v } : r) }));
  const addVisit = () => setEd((e) => ({ ...e, visits: [...e.visits, blankVisit()] }));
  const delVisit = (i) => setEd((e) => ({ ...e, visits: e.visits.length > 1 ? e.visits.filter((_, j) => j !== i) : e.visits }));
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
    if (ed._edit && !await confirmDialog(`ยืนยันบันทึกการแก้ไขใบงาน ${ed.job_no} ?`)) return;
    // build the visit rows (only ones with a date) — each = วัน + รอบเวลา; ทีมเดียวทั้งใบ
    // (รอบที่เสร็จแล้วคงทีมเดิมไว้ เผื่อมีการเปลี่ยนทีมของใบภายหลัง)
    const visitRows = (ed.visits || []).filter((v) => v.date).map((v) => {
      const slot = v.slot || "custom";
      const time = slot === "custom" ? (v.time || "08:00") : slotStartTime(slot);
      const team = v.status === "done" ? (v.assigned_team || ed.assigned_team || null) : (ed.assigned_team || null);
      return { visit_date: v.date, end_date: (v.end_date && v.end_date > v.date) ? v.end_date : null, slot, scheduled_at: new Date(`${v.date}T${time}:00`).toISOString(), assigned_team: team, status: v.status || "scheduled" };
    });
    // double-booking: each scheduled visit vs every other job's visits (same team, overlapping day+slot)
    for (const vr of visitRows) {
      if (!vr.assigned_team) continue;
      const tnm = teams.find((t) => t.id === vr.assigned_team)?.name?.replace("Team ", "") || vr.assigned_team;
      const cand = { scheduled_at: vr.scheduled_at, end_date: vr.end_date, slot: vr.slot };
      let clash = null;
      for (const j of list) {
        if (j.job_no === ed.job_no) continue;
        const ovs = (j.visits && j.visits.length) ? j.visits : [{ assigned_team: j.assigned_team, scheduled_at: j.scheduled_at, end_date: j.end_date, slot: j.slot, status: j.status }];
        for (const ov of ovs) {
          if (ov.assigned_team !== vr.assigned_team || ov.status === "cancelled" || !ov.scheduled_at) continue;
          if (jobsOverlap(cand, { scheduled_at: ov.scheduled_at, end_date: ov.end_date, slot: ov.slot })) { clash = j; break; }
        }
        if (clash) break;
      }
      if (clash && !await confirmDialog(`⚠️ ทีม ${tnm} มีงานซ้อนช่วงเวลานี้:\n${clash.job_no}${clash.title ? " · " + clash.title : ""}\n\nต้องการจองซ้อนหรือไม่?`)) return;
    }
    // primary visit (earliest) drives the job's legacy fields → keeps calendar/งานของฉัน working
    const primary = visitRows.slice().sort((a, b) => (a.scheduled_at || "").localeCompare(b.scheduled_at || ""))[0] || null;
    const scheduled_at = primary?.scheduled_at || null;
    const end_date = primary?.end_date || null;
    const slot = primary?.slot || null;
    const tn = ed.assigned_team ? (teams.find((t) => t.id === ed.assigned_team)?.name?.replace("Team ", "") || ed.assigned_team) : null;
    // overall job status is derived from the visits' own statuses
    const status = deriveJobStatus(visitRows);
    try {
      await saveJobOrder({ ...ed, assigned_team: ed.assigned_team || null, scheduled_at, end_date, slot, status, visits: visitRows }, me);
      flash(visitRows.length > 1 ? `บันทึก · ${visitRows.length} รอบเข้างาน ✓` : (ed.assigned_team ? `บันทึก · ส่งงานให้ทีม ${tn} แล้ว ✓` : "บันทึกใบงานแล้ว"));
      setEd(null); await load();
    }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(jo) { if (!await confirmDialog(`ลบใบงาน ${jo.job_no}?`)) return; try { await deleteJobOrder(jo.job_no); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }
  // linked job orders (A/B/C) sharing a group — for assigning extra teams, with a shared timeline
  const groupKey = (j) => j.group_no || j.job_no;
  const siblingsOf = (j) => list.filter((x) => groupKey(x) === groupKey(j)).sort((a, b) => a.job_no.localeCompare(b.job_no));
  async function addLinked(jo) {
    if (!await confirmDialog({ title: "สร้างใบงานเชื่อม (มอบทีมเพิ่ม) ?", message: `จาก ${jo.job_no} · คัดลอกลูกค้า/งาน แล้วให้กำหนดทีม+รอบของใบใหม่`, danger: false, confirmText: "สร้างใบเชื่อม" })) return;
    try { const newNo = await createLinkedJob(jo); flash(`สร้างใบงานเชื่อม ${newNo} แล้ว`); await load(); setViewing(null); const fresh = await listJobOrders(); setList(fresh); startEdit(fresh.find((x) => x.job_no === newNo)); }
    catch (e) { flash("สร้างไม่สำเร็จ: " + (e.message || e), true); }
  }
  // office sets ONE รอบ (visit) status — siblings untouched; modal/list refresh in place
  async function doVisitStatus(jo, v, status) {
    setApproveCtx(null);
    try {
      await updateVisitStatus(v.id, jo.job_no, status, me);
      flash(status === "done" ? "อนุมัติ · ปิดงานรอบนี้แล้ว ✓" : "ส่งรอบนี้ไปนัดหมายเพิ่มแล้ว");
      const fresh = await listJobOrders(); setList(fresh);
      setViewing((cur) => cur ? (fresh.find((x) => x.job_no === jo.job_no) || null) : cur);
    } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  // "นัดหมายเพิ่ม": ล๊อกรอบเดิม (เป็นประวัติ = done) แล้วเพิ่มรอบใหม่ (ครั้งถัดไป) ให้ออฟฟิศตั้งวัน
  // onlyIdx = เจาะจงรอบนั้น; ไม่ใส่ = รอบที่อยู่สถานะนัดหมายเพิ่มทั้งหมด
  function startReschedule(jo, onlyIdx) {
    startEdit(jo);
    setEd((e) => {
      if (!e) return e;
      const visits = e.visits.map((v, idx) => (v.status === "reschedule" && (onlyIdx == null || onlyIdx === idx)) ? { ...v, status: "done" } : v);
      visits.push(blankVisit()); // รอบใหม่สำหรับนัดหมายครั้งถัดไป
      return { ...e, visits };
    });
  }
  // unlock an approved (done) round in the editor — needs confirmation
  async function unlockVisit(i) {
    if (!await confirmDialog({ title: "ปลดล็อกรอบนี้เพื่อแก้ไข?", message: "รอบที่อนุมัติแล้วจะกลับมาแก้ไขได้ · อย่าลืมตั้งสถานะใหม่หลังแก้เสร็จ", danger: true, confirmText: "ปลดล็อก" })) return;
    setVisit(i, "status", "in_progress");
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
            <label className="fld"><span>ประเภทงาน</span>
              <Combo className="inp" value={ed.job_type} onChange={(e) => setF("job_type", e.target.value)}>
                {JOB_TYPES.map(([v, l, ic]) => <option key={v} value={v}>{ic} {l}</option>)}
              </Combo>
            </label>
          </div>
          <label className="fld"><span>ชื่องาน</span><input className="inp" value={ed.title} onChange={(e) => setF("title", e.target.value)} placeholder="เช่น ติดตั้งแอร์ออฟฟิศ" /></label>
          <div className="fld-row">
            <label className="fld"><span>ลูกค้า</span>
              <Combo className="inp" value={ed.customer_id} onChange={(e) => onCustomer(e.target.value)}>
                <option value="">— เลือกลูกค้า —</option>{custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Combo>
            </label>
            <label className="fld"><span>ไซต์งาน</span>
              <Combo className="inp" value={ed.site_id} onChange={(e) => onSite(e.target.value)} disabled={!cust?.sites?.length}>
                <option value="">{cust?.sites?.length ? "— เลือกไซต์ —" : "(ไม่มีไซต์)"}</option>
                {cust?.sites?.map((s) => <option key={s.id} value={s.id}>{s.site_name || s.address}</option>)}
              </Combo>
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
          <div className="fld"><span>รูป/ไฟล์หน้างานเบื้องต้น (ให้ช่างดูก่อนเข้างาน)</span>
            <div className="myjob-photos">
              {(ed.sales_photos || []).map((u, i) => (
                <div className="myjob-photo" key={i}>
                  <AttachThumb url={u} />
                  <button type="button" className="myjob-photo-x" onClick={() => removeBriefPhoto(i)} aria-label="ลบไฟล์">×</button>
                </div>
              ))}
              <label className="myjob-addphoto">{upBrief ? "…" : "＋ รูป/ไฟล์"}
                <input type="file" accept={ATTACH_ACCEPT} multiple onChange={onBriefFiles} hidden />
              </label>
            </div>
          </div>

          <div className="fld-row">
            <label className="fld"><span>ทีมช่าง <small style={{ color: "var(--ink-3)", fontWeight: 400 }}>(1 ใบงาน = 1 ทีม · ทีมอื่นใช้ "ใบงานเชื่อม")</small></span>
              <Combo className="inp" value={ed.assigned_team} disabled={ed.visits.some((v) => v.status === "done")} onChange={(e) => setF("assigned_team", e.target.value)}>
                <option value="">— เลือกทีมช่าง —</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name.replace("Team ", "")}</option>)}
              </Combo>
            </label>
          </div>
          <div className="fld"><span>รอบเข้างาน <small style={{ color: "var(--ink-3)", fontWeight: 400 }}>(เพิ่มได้หลายรอบ · หลายวัน/หลายช่วงเวลาของทีมนี้)</small></span>
            {ed.visits.map((v, i) => {
              const col = teams.find((t) => t.id === ed.assigned_team)?.color || "#94a3b8";
              const locked = v.status === "done"; // อนุมัติแล้ว = ล๊อก แก้ไม่ได้ กันรีเซ็ต
              return (
                <div className="crm-site" key={i} style={{ borderLeftColor: col, background: col + "14", opacity: locked ? 0.85 : 1 }}>
                  <div className="crm-site-head">
                    <span className="crm-site-badge" style={{ background: col }}>รอบ {i + 1}{locked ? " · 🔒 อนุมัติแล้ว" : ""}</span>
                    {locked
                      ? <button className="btn-ghost sm" onClick={() => unlockVisit(i)}>🔓 ปลดล็อก</button>
                      : ed.visits.length > 1 && <button className="line-x" onClick={() => delVisit(i)}><UIcon name="x" size={14} /></button>}
                  </div>
                  <div className="crm-row">
                    <Combo className="inp" value={v.slot} disabled={locked} onChange={(e) => setVisit(i, "slot", e.target.value)}>
                      {SLOTS.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.th}{s.time ? ` (${s.time})` : ""}</option>)}
                    </Combo>
                    <Combo className="inp" value={v.status || "scheduled"} disabled={locked} onChange={(e) => setVisit(i, "status", e.target.value)}>
                      {STATUS_OPTS.map(([sv, sl]) => <option key={sv} value={sv}>สถานะ: {sl}</option>)}
                    </Combo>
                  </div>
                  <div className="crm-row">
                    <label className="fld" style={{ flex: 1 }}><span style={{ fontSize: 11 }}>วันเริ่ม</span><input className="inp" type="date" disabled={locked} value={v.date} onChange={(e) => setVisit(i, "date", e.target.value)} /></label>
                    <label className="fld" style={{ flex: 1 }}><span style={{ fontSize: 11 }}>วันสิ้นสุด (เว้นว่างได้)</span><input className="inp" type="date" disabled={locked} min={v.date || undefined} value={v.end_date} onChange={(e) => setVisit(i, "end_date", e.target.value)} /></label>
                    {v.slot === "custom" && <label className="fld" style={{ flex: 1 }}><span style={{ fontSize: 11 }}>เวลาเริ่ม</span><input className="inp" type="time" disabled={locked} value={v.time} onChange={(e) => setVisit(i, "time", e.target.value)} /></label>}
                  </div>
                </div>
              );
            })}
            <button className="btn-ghost sm" onClick={addVisit}><UIcon name="plus" size={13} /> เพิ่มรอบเข้างาน</button>
          </div>
          <div className="fld"><span>สถานะงาน (ภาพรวม · คำนวณจากรอบ)</span>
            {(() => { const s = deriveJobStatus((ed.visits || []).filter((v) => v.date)); const d = STATUS[s] || STATUS.pending; return <div><span className={"job-badge " + d.cls}>{d.th}</span></div>; })()}
          </div>

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
          <div className="jo-datefilter">
            <UIcon name="calendar" size={15} color="var(--ink-3)" />
            <input className="inp" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="ตั้งแต่วันที่" />
            <span className="jo-date-dash">–</span>
            <input className="inp" type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} title="ถึงวันที่" />
            {(dateFrom || dateTo) && <button className="cat-search-x" title="ล้างวันที่" onClick={() => { setDateFrom(""); setDateTo(""); }}><UIcon name="x" size={15} /></button>}
          </div>
          <div className="cat-search"><UIcon name="search" size={17} color="var(--ink-3)" />
            <input placeholder="ค้นหาเลขงาน / ลูกค้า / เบอร์โทร / ทีมช่าง" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="cat-search-x" onClick={() => setQ("")}><UIcon name="x" size={15} /></button>}
          </div>
          {canEdit && <button className="btn-primary" onClick={startNew}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> สร้างใบงาน</button>}
        </div>
      </div>

      <div className="cat-filter">
        <button className={"cat-chip" + (statusF === "all" ? " on" : "")} onClick={() => setStatusF("all")}
          style={statusF === "all" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ทั้งหมด ({list.length})</button>
        {JOB_STATUSES.map(([v, l, , col]) => {
          const n = list.filter((j) => j.status === v).length;
          const on = statusF === v;
          return (
            <button key={v} className={"cat-chip" + (on ? " on" : "")} onClick={() => setStatusF(v)}
              style={on ? { background: col, color: "#fff", borderColor: col } : {}}>
              <span style={{ width: 8, height: 8, borderRadius: 9, background: on ? "#fff" : col, display: "inline-block", marginRight: 5 }} />{l} ({n})
            </button>
          );
        })}
      </div>
      <div className="cat-filter">
        <button className={"cat-chip" + (typeF === "all" ? " on" : "")} onClick={() => setTypeF("all")}
          style={typeF === "all" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ทุกประเภท</button>
        {JOB_TYPES.map(([v, l, ic, col]) => (
          <button key={v} className={"cat-chip" + (typeF === v ? " on" : "")} onClick={() => setTypeF(v)}
            style={typeF === v ? { background: col, color: "#fff", borderColor: col } : {}}>{ic} {l}</button>
        ))}
      </div>

      {loading && <div className="empty">กำลังโหลด…</div>}
      {(() => {
        // all visit dates of a job (YYYY-MM-DD) — falls back to the legacy single scheduled_at
        const jobDates = (jo) => {
          const ds = (jo.visits || []).map((v) => v.scheduled_at).filter(Boolean).map((s) => new Date(s).toISOString().slice(0, 10));
          if (!ds.length && jo.scheduled_at) ds.push(new Date(jo.scheduled_at).toISOString().slice(0, 10));
          return ds;
        };
        const inDateRange = (jo) => {
          if (!dateFrom && !dateTo) return true;
          const ds = jobDates(jo);
          if (!ds.length) return false; // no date → excluded when filtering by date
          return ds.some((d) => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo));
        };
        const jobAt = (jo) => { const t = jo.scheduled_at ? new Date(jo.scheduled_at).getTime() : NaN; return Number.isNaN(t) ? Infinity : t; };
        const fl = list.filter((jo) => (statusF === "all" || jo.status === statusF)
          && (typeF === "all" || (jo.job_type || "install") === typeF)
          && inDateRange(jo)
          && (matchText(q, jo.job_no, jo.customerName, jo.teamName, jo.title, jo.quote_no, jo.address) || matchPhone(q, jo.contact_phone)))
          .sort((a, b) => jobAt(a) - jobAt(b) || a.job_no.localeCompare(b.job_no)); // วันใกล้ → ไกล (ไม่มีวันอยู่ท้าย)
        return (<>
          {!loading && fl.length === 0 && <div className="empty">{list.length === 0 ? "ยังไม่มีใบงาน" : "ไม่พบใบงานที่ตรงเงื่อนไข"}</div>}
          <div className="job-cards">
            {fl.map((jo) => {
          const st = STATUS[jo.status] || STATUS.pending;
          return (
            <div className={"card job-card" + (jo.status === "done" || jo.status === "cancelled" ? " closed" : "")} key={jo.job_no}>
              <div className="job-card-head" style={{ cursor: "pointer" }} onClick={() => setViewing(jo)} title="กดดูรายละเอียด">
                <div className="job-card-id"><span className="job-no">{jo.job_no}</span>
                  {(() => { const td = jobTypeDef(jo.job_type); return <span className="job-type-chip" style={{ background: td[3] }}>{td[2]} {td[1]}</span>; })()}
                  <span className={"job-badge " + st.cls}>{st.th}</span></div>
                <div className="job-card-meta">
                  <div className="jcm-title">{jo.title || "งานติดตั้ง/บริการ"}</div>
                  <div className="jcm-when">🗓 ทีม {jo.teamName || "ยังไม่มอบ"}{jo.scheduled_at ? ` · ${scheduleLabel(jo)}` : " · ยังไม่กำหนดวัน"}{jo.visits && jo.visits.length > 1 ? ` · 🔁 ${jo.visits.length} รอบ` : ""}</div>
                  {(jo.salesName || jo.createdByName) && (
                    <div className="jcm-by">
                      {jo.salesName && <span>🧑‍💼 ขายโดย <b>{jo.salesName}</b></span>}
                      {jo.createdByName && <span>✍️ ออกใบงานโดย <b>{jo.createdByName}</b></span>}
                    </div>
                  )}
                </div>
              </div>
              <div className="jo-info">
                <div className="jo-info-row"><span className="jo-ic">🏢</span><b>{jo.customerName || "ไม่ระบุลูกค้า"}</b>{jo.customerAddr ? <span className="jo-dim"> · {jo.customerAddr}</span> : null}</div>
                {(jo.contact_name || jo.contact_phone) && <div className="jo-info-row"><span className="jo-ic">👤</span>{jo.contact_name || "ผู้ติดต่อ"}{jo.contact_phone && <a href={`tel:${jo.contact_phone}`} className="jo-tel">📞 {jo.contact_phone}</a>}</div>}
                {jo.address && <div className="jo-info-row"><span className="jo-ic">📍</span><span style={{ flex: 1 }}>{jo.address}</span>{jo.map_url && <a href={jo.map_url} target="_blank" rel="noreferrer" className="btn-ghost sm" onClick={(e) => e.stopPropagation()}>แผนที่</a>}</div>}
              </div>
              {(() => { const ch = docLinks.byQuote[jo.quote_no] || {}; return <DocChips boqNo={jo.boq_no} quoteNo={jo.quote_no} jobNos={ch.jobNos} invoiceNos={ch.invoiceNos} receiptNos={ch.receiptNos} self={{ type: "job", no: jo.job_no }} onOpen={onOpenDoc} />; })()}
              {(() => { const sibs = siblingsOf(jo); return sibs.length > 1 ? (
                <div className="job-group-chips"><span style={{ fontSize: 12, color: "var(--ink-2)" }}>🔗 ใบงานเชื่อม:</span>
                  {sibs.map((s) => <button key={s.job_no} className={"job-group-chip" + (s.job_no === jo.job_no ? " cur" : "")} onClick={() => setViewing(s)}>{s.job_no}</button>)}
                </div>
              ) : null; })()}
              {canEdit && jo.status === "awaiting_approval" && (
                <div className="job-lines"><div className="job-actions">
                  <button className="btn-primary sm ok" onClick={() => setViewing(jo)}><UIcon name="check" size={14} color="#fff" strokeWidth={2.4} /> ตรวจ & อนุมัติรายรอบ</button>
                </div></div>
              )}
              {canEdit && jo.status === "reschedule" && (
                <div className="job-lines"><div className="job-actions">
                  <button className="btn-primary sm" onClick={() => startReschedule(jo)}><UIcon name="calendar" size={14} color="#fff" /> ตั้งวันนัดหมายเพิ่ม</button>
                </div></div>
              )}
              <div className="job-lines"><div className="job-actions">
                <button className="btn-ghost sm" onClick={() => setOpenTl(openTl === jo.job_no ? null : jo.job_no)}>
                  <UIcon name="clipboard" size={14} /> {openTl === jo.job_no ? "ซ่อนความเคลื่อนไหว" : "ความเคลื่อนไหว"}
                </button>
                {canEdit && <button className="btn-ghost sm" onClick={() => addLinked(jo)}><UIcon name="plus" size={14} /> ใบงานเชื่อม</button>}
                {canEdit && <button className="btn-ghost sm" onClick={() => startEdit(jo)}><UIcon name="edit" size={14} /> แก้ไข</button>}
                {canEdit && <button className="btn-ghost sm danger" onClick={() => del(jo)}><UIcon name="trash" size={14} /> ลบ</button>}
              </div></div>
              {openTl === jo.job_no && <JobTimeline jobNo={jo.job_no} groupNo={groupKey(jo)} linked={!!jo.group_no} canPost={canEdit} author={me} flash={flash} />}
            </div>
          );
        })}
          </div>
        </>);
      })()}

      {viewing && (() => {
        const jo = viewing; const st = STATUS[jo.status] || STATUS.pending; const td = jobTypeDef(jo.job_type);
        const vs = (jo.visits && jo.visits.length) ? jo.visits : [];
        return (
          <div className="modal-overlay" onClick={() => setViewing(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640, maxWidth: "95vw" }}>
              <div className="modal-head">
                <div className="modal-title">{jo.job_no} <span>{td[2]} {td[1]} · {st.th}</span></div>
                <button className="drawer-close" onClick={() => setViewing(null)}><UIcon name="x" size={20} /></button>
              </div>
              <div className="modal-body">
                <div className="cd-grid">
                  <div className="cd-k">ชื่องาน</div><div className="cd-v">{jo.title || "—"}</div>
                  <div className="cd-k">ลูกค้า</div><div className="cd-v">{jo.customerName || "—"}</div>
                  {(jo.contact_name || jo.contact_phone) && <><div className="cd-k">ผู้ติดต่อ</div><div className="cd-v">{jo.contact_name || "—"}{jo.contact_phone ? ` · ${jo.contact_phone}` : ""}</div></>}
                  {jo.address && <><div className="cd-k">ที่อยู่</div><div className="cd-v">{jo.address}{jo.map_url ? <> · <a href={jo.map_url} target="_blank" rel="noreferrer">แผนที่</a></> : null}</div></>}
                </div>

                <div className="cd-sec">รอบเข้างาน ({vs.length})</div>
                {vs.length === 0 && <div className="cd-empty">— ยังไม่มีรอบเข้างาน —</div>}
                {vs.map((v, i) => {
                  const vst = STATUS[v.status] || STATUS.scheduled; const col = teams.find((t) => t.id === v.assigned_team)?.color || "#94a3b8";
                  return (
                    <div className="cd-site" key={v.id || i} style={{ borderLeft: `3px solid ${col}`, background: col + "18", paddingLeft: 9, borderRadius: 8 }}>
                      <div className="cd-site-top"><span>📍 รอบ {i + 1} · {v.teamName || "ยังไม่มอบทีม"}</span><span className={"job-badge " + vst.cls}>{vst.th}</span></div>
                      <div className="cd-site-addr">🗓 {scheduleLabel({ scheduled_at: v.scheduled_at, end_date: v.end_date, slot: v.slot })}</div>
                      {canEdit && v.status === "awaiting_approval" && (
                        <div className="myjob-visit-acts" style={{ marginTop: 7 }}>
                          <button className="btn-primary sm ok" onClick={() => setApproveCtx({ jo, v })}>✓ อนุมัติรอบนี้</button>
                        </div>
                      )}
                      {canEdit && v.status === "reschedule" && (
                        <div className="myjob-visit-acts" style={{ marginTop: 7 }}>
                          <button className="btn-primary sm" onClick={() => { setViewing(null); startReschedule(jo, i); }}>📅 ตั้งวันนัดหมายเพิ่ม</button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {(() => { const sibs = siblingsOf(jo); return sibs.length > 1 ? (
                  <><div className="cd-sec">ใบงานเชื่อม ({sibs.length})</div>
                  <div className="job-group-chips" style={{ paddingTop: 0 }}>
                    {sibs.map((s) => <button key={s.job_no} className={"job-group-chip" + (s.job_no === jo.job_no ? " cur" : "")} onClick={() => setViewing(s)}>{s.job_no} · {STATUS[s.status]?.th || ""}</button>)}
                  </div></>
                ) : null; })()}

                {jo.details && <><div className="cd-sec">รายละเอียดงาน</div><div className="cd-v" style={{ whiteSpace: "pre-wrap" }}>{jo.details}</div></>}
                {jo.sales_note && <><div className="cd-sec">บรีฟจากฝ่ายขาย</div><div className="cd-v" style={{ whiteSpace: "pre-wrap" }}>{jo.sales_note}</div></>}
                {jo.sales_photos?.length > 0 && <div className="tl-photos" style={{ marginTop: 8 }}>{jo.sales_photos.map((u, i) => <AttachThumb key={i} url={u} />)}</div>}
              </div>
              <div className="modal-foot">
                {canEdit && <button className="btn-ghost danger" style={{ marginRight: "auto" }} onClick={() => { const j = jo; setViewing(null); del(j); }}><UIcon name="trash" size={15} /> ลบ</button>}
                {canEdit && <button className="btn-ghost" onClick={() => addLinked(jo)}><UIcon name="plus" size={15} /> ใบงานเชื่อม</button>}
                {canEdit && <button className="btn-primary" onClick={() => { const j = jo; setViewing(null); startEdit(j); }}><UIcon name="edit" size={15} color="#fff" /> แก้ไข</button>}
              </div>
            </div>
          </div>
        );
      })()}

      {approveCtx && (() => {
        const { jo, v } = approveCtx;
        return (
          <div className="confirm-overlay" onMouseDown={() => setApproveCtx(null)}>
            <div className="confirm-box" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="confirm-icon">✅</div>
              <div className="confirm-title">อนุมัติรอบนี้</div>
              <div className="confirm-msg">{jo.job_no} · {v.teamName || "ทีม"}<br />🗓 {scheduleLabel({ scheduled_at: v.scheduled_at, end_date: v.end_date, slot: v.slot })}<br /><br />งานรอบนี้…?</div>
              <div className="confirm-acts" style={{ flexDirection: "column" }}>
                <button className="btn-primary ok" style={{ width: "100%" }} onClick={() => doVisitStatus(jo, v, "done")}>✅ เสร็จสิ้นแล้ว · ปิดงาน</button>
                <button className="btn-primary" style={{ width: "100%", background: "#ea580c" }} onClick={() => doVisitStatus(jo, v, "reschedule")}>📅 ต้องนัดหมายเพิ่ม</button>
                <button className="btn-ghost" style={{ width: "100%" }} onClick={() => setApproveCtx(null)}>ยกเลิก</button>
              </div>
            </div>
          </div>
        );
      })()}

      {toast && <Toast t={toast} />}
    </div>
  );
}

function Toast({ t }) {
  return <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: t.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center" }}>{t.m}</div>;
}
