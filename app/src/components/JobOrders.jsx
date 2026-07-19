import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listJobOrders, saveJobOrder, deleteJobOrder, setJobStatus, listCustomers, listTeams, listQuotations, uploadMaterialPhoto, listDocLinks, updateVisitStatus, updateJobStatus, lockJob, unlockJob, createLinkedJob, listProfiles, listJobTemplates, saveJobTemplate, deleteJobTemplate, listHandoverFlags, saveJobReview } from "../lib/api";
import { SLOTS, slotStartTime, jobsOverlap, scheduleLabel, JOB_TYPES, jobTypeDef, deriveJobStatus, JOB_STATUSES } from "../lib/schedule";
import { UIcon } from "../icons";
import JobTimeline, { Linkify } from "./JobTimeline";
import DocChips from "./DocChips";
import DocPeek from "./DocPeek";
import ChatCustomerLink from "./ChatCustomerLink";
import AttachThumb from "./AttachThumb";
import { InternalNoteField, InternalNoteTag } from "./InternalNote";
import { ATTACH_ACCEPT, matchText, matchPhone } from "../lib/format";
import { can } from "../lib/permissions";

const STATUS = Object.fromEntries(JOB_STATUSES.map(([v, l, cls]) => [v, { th: l, cls }]));
// quote_pending and cancelled are job-level only — not valid as visit statuses (DB check constraint)
const STATUS_OPTS = JOB_STATUSES.filter(([v]) => v !== "quote_pending" && v !== "cancelled").map(([v, l]) => [v, l]);
function genNo() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `JOB-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }
const mapLink = (addr) => (addr && addr.trim()) ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr.trim()) : "";

const blankVisit = () => ({ date: "", end_date: "", slot: "morning", time: "", status: "scheduled" });
const blankEd = () => ({ job_no: genNo(), quote_no: "", customer_id: "", site_id: "", title: "", job_type: "install", issue_date: new Date().toISOString().slice(0, 10), contact_name: "", contact_phone: "", address: "", map_url: "", details: "", sales_note: "", internal_note: "", sales_photos: [], assigned_team: "", visits: [blankVisit()], status: "pending" });

export default function JobOrders({ role, me, myTeam, focus, onFocusConsumed, prefill, onPrefillConsumed, schedule, onScheduleConsumed, surveyFor, onSurveyConsumed, onHandover, onCreatePrep, onMovement, onOpenQuote, onOpenBoq, onOpenDoc, onGoChat }) {
  const canEdit = can(role, "joborders", "edit");
  // ช่าง/หัวหน้าช่าง เห็นเฉพาะงานของทีมตัวเอง (งานตัวเอง) — ทีมหลังบ้านเห็นทุกงาน
  const fieldOnly = role === "tech" || role === "lead_tech";
  const canDelete = role === "admin"; // ลบจริงได้เฉพาะธุรการ
  // งานที่ถูกล็อก (อนุมัติ/ปิดงานแล้ว) แก้ไข/ปลดล็อกได้เฉพาะทีมออฟฟิศที่ดูแลใบงาน (ธุรการ/ผู้บริหาร/ฝ่ายขาย)
  const canOverrideLock = role === "admin" || role === "exec" || role === "sales";
  const canEditJob = (jo) => canEdit && (!jo.locked || canOverrideLock);
  const [openTl, setOpenTl] = React.useState(null);
  const [upBrief, setUpBrief] = React.useState(false);
  const [list, setList] = React.useState([]);
  const [custs, setCusts] = React.useState([]);
  const [teams, setTeams] = React.useState([]);
  const [staff, setStaff] = React.useState([]);
  const [quotes, setQuotes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [ed, setEd] = React.useState(null);
  const [saving, setSaving] = React.useState(false);   // กันกดบันทึกซ้ำตอนเน็ตช้า (เดิมกด 2 ที = ได้ใบงาน/รอบเข้างานซ้ำ)
  const [statusF, setStatusF] = React.useState("all");
  const [typeF, setTypeF] = React.useState("all");
  const [teamF, setTeamF] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [viewing, setViewing] = React.useState(null); // job being viewed (detail modal)
  const [peek, setPeek] = React.useState(null);       // {type,no} — พรีวิวเอกสารเชื่อมโยงเป็นแผงด้านขวา ก่อนเปิดหน้าเต็ม
  const [approveCtx, setApproveCtx] = React.useState(null); // { jo, v } → approval choice popup
  // คะแนนงาน/ธงเคลม — เดิมตั้งได้เฉพาะหน้าช่างซัพ ทีมประจำจึงกรอกไม่ได้เลย
  // ทั้งที่สกอร์การ์ด HR หักคะแนน "งานเคลม" ของทุกทีมเท่ากัน
  const [apRating, setApRating] = React.useState(0);
  const [apClaim, setApClaim] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [docLinks, setDocLinks] = React.useState({ byQuote: {} });
  const [templates, setTemplates] = React.useState([]);
  const [hoFlags, setHoFlags] = React.useState({});   // job_no → { any, submitted, signed } ใบส่งมอบงาน
  const [tplPick, setTplPick] = React.useState(false); // template picker modal open

  async function load() {
    setLoading(true);
    try { const [j, c, t, q, dl, ps, tpl, hf] = await Promise.all([listJobOrders(), listCustomers(), listTeams(), listQuotations(), listDocLinks(), listProfiles().catch(() => []), listJobTemplates().catch(() => []), listHandoverFlags().catch(() => ({}))]); setList(j); setCusts(c); setTeams(t); setQuotes(q); setDocLinks(dl); setStaff(ps || []); setTemplates(tpl || []); setHoFlags(hf || {}); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);

  // ---------- job templates (แม่แบบงาน) ----------
  async function reloadTemplates() { try { setTemplates(await listJobTemplates()); } catch { /* ignore */ } }
  function applyTemplate(t) {
    setEd((e) => ({
      ...e,
      job_type: t.job_type || e.job_type,
      title: e.title?.trim() ? e.title : (t.title || ""),
      details: e.details?.trim() ? `${e.details}\n${t.details || ""}`.trim() : (t.details || ""),
    }));
    setTplPick(false);
    flash(`ใช้แม่แบบ "${t.name}" แล้ว`);
  }
  async function saveAsTemplate() {
    if (!ed) return;
    if (!ed.details?.trim() && !ed.title?.trim()) return flash("ใส่ชื่องาน/รายละเอียดก่อนบันทึกเป็นแม่แบบ", true);
    const name = await confirmDialog({ title: "บันทึกเป็นแม่แบบ", message: "ตั้งชื่อแม่แบบ (ดึงประเภทงาน/ชื่องาน/รายละเอียดปัจจุบันไปเก็บไว้ใช้ซ้ำ)", confirmText: "บันทึก", danger: false, prompt: { label: "ชื่อแม่แบบ", placeholder: "เช่น ล้างแอร์ 24000 BTU" } });
    if (name === false || !String(name).trim()) return;
    try { await saveJobTemplate({ name: String(name).trim(), job_type: ed.job_type, title: ed.title, details: ed.details }); await reloadTemplates(); flash("บันทึกแม่แบบแล้ว ✓"); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e) + " (รัน 070_job_templates.sql แล้วหรือยัง?)", true); }
  }
  async function removeTemplate(t) {
    if (!await confirmDialog(`ลบแม่แบบ "${t.name}"?`)) return;
    try { await deleteJobTemplate(t.id); await reloadTemplates(); flash("ลบแม่แบบแล้ว"); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }
  // open focused on a specific job order (from the dashboard report link)
  React.useEffect(() => { if (!focus) return; setEd(null); setStatusF("all"); setTeamF("all"); setTypeF("all"); setDateFrom(""); setDateTo(""); setQ(focus); setOpenTl(focus); onFocusConsumed && onFocusConsumed(); }, [focus]);

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
      job_type: q.job_type || "install",   // ประเภทงานติดมาจาก BOQ → ใบเสนอราคา → ใบงาน (CRM)
      title: q.title || "", internal_note: q.internal_note || "",
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
    // เก็บ id + สถานะตอนโหลด (_orig) — ตอนบันทึก saveJobOrder ใช้ตัดสิน: ฟอร์มไม่ได้แตะสถานะ → ใช้สถานะสดจาก DB
    // (กันทับสถานะที่ช่างเพิ่งกด) · ฟอร์มตั้งใจแก้ (นัดหมายเพิ่ม/ปลดล็อกรอบ/dropdown) → ค่าฟอร์มชนะ
    return { id: v.id, _orig: v.status || "scheduled", assigned_team: v.assigned_team || "", date: v.visit_date || "", end_date: v.end_date || "", slot: v.slot || "morning", time: dt ? `${p(dt.getHours())}:${p(dt.getMinutes())}` : "", status: v.status || "scheduled" };
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
    setEd({ ...jo, _edit: true, _visitIdsLoaded: (jo.visits || []).map((v) => v.id).filter(Boolean), job_type: jo.job_type || "install", customer_id: jo.customer_id || "", site_id: jo.site_id || "",
      issue_date: jo.issue_date || (jo.created_at || "").slice(0, 10),
      assigned_team: jo.assigned_team || jo.visits?.[0]?.assigned_team || "",
      contact_name: jo.contact_name || "", contact_phone: jo.contact_phone || "", address: jo.address || "", map_url: jo.map_url || "", details: jo.details || "", title: jo.title || "",
      sales_note: jo.sales_note || "", internal_note: jo.internal_note || "", sales_photos: jo.sales_photos || [], visits, status: jo.status || "pending" });
  }
  const setVisit = (i, k, v) => setEd((e) => ({ ...e, visits: e.visits.map((r, j) => j === i ? { ...r, [k]: v } : r) }));
  const addVisit = () => setEd((e) => ({ ...e, visits: [...e.visits, blankVisit()] }));
  // tap a free slot in the side panel → fill the first empty รอบ, else add a new รอบ
  const pickSlot = (date, slot) => setEd((e) => {
    const visits = [...(e.visits || [])];
    const idx = visits.findIndex((v) => !v.date && v.status !== "done");
    if (idx >= 0) visits[idx] = { ...visits[idx], date, slot };
    else visits.push({ ...blankVisit(), date, slot });
    return { ...e, visits };
  });
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
    // เลือกไซต์แล้ว ชื่อผู้ติดต่อ/เบอร์/ที่อยู่ ตามไซต์นั้น — ไซต์ไม่มีผู้ติดต่อค่อยถอยไปผู้ติดต่อหลักของลูกค้า
    const ct0 = cust?.contacts?.[0];
    setEd((e) => ({ ...e, site_id: id, address: addr || e.address, map_url: s?.map_url || mapLink(addr) || e.map_url,
      contact_name: s?.contact_name || ct0?.name || e.contact_name, contact_phone: s?.phone || ct0?.phone || e.contact_phone }));
  }

  async function save() {
    if (!ed.title?.trim() && !ed.customer_id) return flash("ใส่ลูกค้าหรือชื่องาน", true);
    // กด "ตั้งวันนัดหมายเพิ่ม" แล้วไม่ใส่วัน → รอบเปล่าถูกทิ้งตอนบันทึก ใบกลายเป็น "เสร็จปิดงาน" เงียบ ๆ งานหลุดคิวถาวร
    const dated = (ed.visits || []).filter((v) => v.date);
    const blanks = (ed.visits || []).length - dated.length;
    if (blanks > 0 && dated.length > 0 && dated.every((v) => v.status === "done" || v.status === "cancelled")) {
      if (!await confirmDialog({
        title: "ยังไม่ได้ใส่วันนัดของรอบใหม่",
        message: `มีรอบใหม่ที่ยังไม่ได้ระบุวัน ${blanks} รอบ — ถ้าบันทึกตอนนี้รอบนั้นจะหายไป และใบงานจะกลายเป็น "เสร็จปิดงาน" ทันที (งานหลุดคิว ไม่มีใครตามต่อ)\n\nกด "กลับไปใส่วัน" เพื่อระบุวันนัด หรือ "ปิดงานเลย" ถ้าตั้งใจจบงานจริง`,
        confirmText: "ปิดงานเลย", cancelText: "กลับไปใส่วัน", danger: true,
      })) return;
    }
    if (ed._edit && !await confirmDialog(`ยืนยันบันทึกการแก้ไขใบงาน ${ed.job_no} ?`)) return;
    // build the visit rows (only ones with a date) — each = วัน + รอบเวลา; ทีมเดียวทั้งใบ
    // (รอบที่เสร็จแล้วคงทีมเดิมไว้ เผื่อมีการเปลี่ยนทีมของใบภายหลัง)
    const visitRows = (ed.visits || []).filter((v) => v.date).map((v) => {
      const slot = v.slot || "custom";
      const time = slot === "custom" ? (v.time || "08:00") : slotStartTime(slot);
      const team = v.status === "done" ? (v.assigned_team || ed.assigned_team || null) : (ed.assigned_team || null);
      return { id: v.id || null, _orig: v._orig || null, visit_date: v.date, end_date: (v.end_date && v.end_date > v.date) ? v.end_date : null, slot, scheduled_at: new Date(`${v.date}T${time}:00`).toISOString(), assigned_team: team, status: v.status || "scheduled" };
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
    // overall job status is derived from the visits' own statuses;
    // with no scheduled รอบ yet, keep the chosen pre-work stage (รอทำใบเสนอราคา / รอจ่ายงาน)
    const status = visitRows.length ? deriveJobStatus(visitRows) : (ed.status === "quote_pending" ? "quote_pending" : "pending");
    try {
      setSaving(true);
      await saveJobOrder({ ...ed, assigned_team: ed.assigned_team || null, scheduled_at, end_date, slot, status, visits: visitRows, visitIdsLoaded: ed._visitIdsLoaded || null }, me);
      flash(visitRows.length > 1 ? `บันทึก · ${visitRows.length} รอบเข้างาน ✓` : (ed.assigned_team ? `บันทึก · ส่งงานให้ทีม ${tn} แล้ว ✓` : "บันทึกใบงานแล้ว"));
      setEd(null); await load();
    }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    finally { setSaving(false); }
  }
  async function del(jo) { const reason = await confirmDialog({ title: `ลบถาวรใบงาน ${jo.job_no}?`, message: "ข้อมูลจะถูกเก็บไว้ในประวัติการลบ", confirmText: "ลบ", prompt: { label: "เหตุผลที่ลบ", placeholder: "เช่น ทำผิด · ซ้ำ", required: true } }); if (reason === false) return; try { await deleteJobOrder(jo.job_no, reason); flash("ลบแล้ว"); await load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }
  async function cancelJob(jo) { const reason = await confirmDialog({ title: `ยกเลิกใบงาน ${jo.job_no}?`, message: "เก็บประวัติไว้", confirmText: "ยกเลิกใบนี้", prompt: { label: "เหตุผลที่ยกเลิก", placeholder: "เช่น ลูกค้าเลื่อนงาน · เสนอใหม่", required: true } }); if (reason === false) return; try { await setJobStatus(jo.job_no, "cancelled", reason); flash("ยกเลิกแล้ว"); await load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); } }
  async function markQuoteDone(jo) {
    try { await updateJobStatus(jo.job_no, "done", me); flash(`${jo.job_no} · ทำใบเสนอราคาเสร็จแล้ว ✓`); await load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  // linked job orders (A/B/C) sharing a group — for assigning extra teams, with a shared timeline
  const groupKey = (j) => j.group_no || j.job_no;
  const siblingsOf = (j) => list.filter((x) => groupKey(x) === groupKey(j)).sort((a, b) => a.job_no.localeCompare(b.job_no));
  async function addLinked(jo) {
    if (!await confirmDialog({ title: "สร้างใบงานเชื่อม (มอบทีมเพิ่ม) ?", message: `จาก ${jo.job_no} · คัดลอกลูกค้า/งาน แล้วให้กำหนดทีม+รอบของใบใหม่`, danger: false, confirmText: "สร้างใบเชื่อม" })) return;
    try { const newNo = await createLinkedJob(jo); flash(`สร้างใบงานเชื่อม ${newNo} แล้ว`); await load(); setViewing(null); const fresh = await listJobOrders(); setList(fresh); startEdit(fresh.find((x) => x.job_no === newNo)); }
    catch (e) { flash("สร้างไม่สำเร็จ: " + (e.message || e), true); }
  }
  // ก่อนปิดงาน: เตือนถ้ายังไม่มีใบส่งมอบงานที่ส่งแล้วและลูกค้าเซ็นรับ
  // ⚠️ เตือนอย่างเดียว ห้ามบล็อก — งานล้าง/ซ่อมเล็กหลายงานลูกค้าไม่สะดวกเซ็น ถ้าบล็อกใบจะปิดไม่ได้
  //    แล้วสถิติงานเสร็จ/สกอร์การ์ดทีม/รายงานงานค้างเพี้ยนทั้งชุด และคนจะเลี่ยงไปแก้สถานะทางอื่นแทน
  async function approveClose(jo, v) {
    const f = hoFlags[jo.job_no] || {};
    if (!f.signed) {
      const why = !f.any ? "ยังไม่มีใบส่งมอบงานสำหรับใบงานนี้"
        : f.submitted ? "มีใบส่งมอบงานแล้ว แต่ยังไม่มีลายเซ็นลูกค้า"
        : "ใบส่งมอบงานยังเป็นฉบับร่าง (ช่างยังไม่ได้ส่ง)";
      if (!await confirmDialog({
        title: "ปิดงานโดยยังไม่มีใบส่งมอบที่ลูกค้าเซ็น?",
        message: `${jo.job_no} — ${why}\n\nใบส่งมอบที่ลูกค้าเซ็นคือหลักฐานว่ารับงานแล้ว ถ้ามีข้อโต้แย้งภายหลังจะไม่มีอะไรยืนยัน\nถ้างานนี้ลูกค้าไม่สะดวกเซ็น กดยืนยันเพื่อปิดงานต่อได้`,
        confirmText: "ปิดงานเลย", cancelText: "ไปทำใบส่งมอบก่อน",
      })) return;
    }
    await doVisitStatus(jo, v, "done", null, true);
  }
  // office sets ONE รอบ (visit) status — siblings untouched; modal/list refresh in place
  async function doVisitStatus(jo, v, status, jobOverride, shouldLock) {
    setApproveCtx(null);
    // ล็อกเป็น "ระดับใบ" — ถ้าใบยังมีรอบอื่นที่ช่างต้องไปทำต่อ ล็อกแล้วรอบนั้นเดินต่อไม่ได้
    // ⇒ ล็อกเฉพาะตอนที่รอบอื่นจบหมดแล้วจริง ๆ
    const others = (jo.visits || []).filter((x) => x.id !== v.id);
    const othersActive = others.some((x) => !["done", "cancelled"].includes(x.status));
    let lock = shouldLock;
    if (shouldLock && othersActive) {
      lock = false;
      flash(`อนุมัติรอบนี้แล้ว · ใบนี้ยังมีอีก ${others.filter((x) => !["done", "cancelled"].includes(x.status)).length} รอบที่ยังไม่จบ จึงยังไม่ล็อกใบ`);
    }
    try {
      // จบใน RPC เดียว (mig 150): เปลี่ยนรอบ + override สถานะใบ (เช่น รอทำใบเสนอราคา) + ล็อก — เน็ตสะดุดก็ไม่ค้างครึ่งทาง
      await updateVisitStatus(v.id, jo.job_no, status, me, { jobOverride: jobOverride || null, lock: lock === true ? true : lock === false ? false : null });
      if (!(shouldLock && othersActive)) {   // เคสนั้นแจ้งไปแล้วว่ายังไม่ล็อกเพราะมีรอบค้าง
        flash(lock ? "อนุมัติ · ปิดงานแล้ว (ล็อก) ✓"
          : jobOverride === "quote_pending" ? "อนุมัติรอบนี้ · ส่งไปรอทำใบเสนอราคา ✓"
          : status === "done" ? "อนุมัติ · ปิดงานรอบนี้แล้ว ✓" : "ส่งรอบนี้ไปนัดหมายเพิ่มแล้ว");
      }
      // คะแนนงาน/ธงเคลมเป็นค่าระดับ "ใบงาน" ไม่ใช่ระดับรอบ — เขียนเฉพาะตอนออฟฟิศแก้จริง กันรอบหลังทับรอบแรก
      if ((apRating || 0) !== (jo.rating || 0) || apClaim !== !!jo.is_claim) {
        try { await saveJobReview(jo.job_no, apRating || null, apClaim); } catch (e) { flash("บันทึกคะแนนงานไม่สำเร็จ: " + (e.message || e), true); }
      }
      const fresh = await listJobOrders(); setList(fresh);
      setViewing((cur) => cur ? (fresh.find((x) => x.job_no === jo.job_no) || null) : cur);
    } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function doUnlock(jo) {
    try {
      await unlockJob(jo.job_no);
      flash(`${jo.job_no} · ปลดล็อกแล้ว ✓`);
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
        <div className="jo-edit-layout">
        <div className="card" style={{ maxWidth: 800, flex: "1 1 540px" }}>
          {canEdit && (
            <div className="jo-tpl-bar">
              <button type="button" className="btn-ghost sm" onClick={() => setTplPick(true)}>📋 ใช้แม่แบบ{templates.length ? ` (${templates.length})` : ""}</button>
              <button type="button" className="btn-ghost sm" onClick={saveAsTemplate}>💾 บันทึกเป็นแม่แบบ</button>
            </div>
          )}
          <div className="fld-row">
            <label className="fld"><span>เลขที่ใบงาน</span><input className="inp" value={ed.job_no} onChange={(e) => setF("job_no", e.target.value)} /></label>
            <label className="fld"><span>วันที่ออกใบงาน</span><input className="inp" type="date" value={ed.issue_date || ""} onChange={(e) => setF("issue_date", e.target.value)} /></label>
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
          {/* ผูกใบเสนอราคาย้อนหลังได้ — ใบงานที่ไม่ผูก ต้นทุนวัสดุที่เบิกจะตกหล่นจากหน้ากำไร/งาน (คำเตือนสีแดง) */}
          <label className="fld"><span>ใบเสนอราคาที่ผูก <small style={{ color: "var(--ink-3)", fontWeight: 400 }}>(ใช้คิดกำไร + เชื่อมเอกสาร/สถานะสั่งของ — งานแอร์ควรผูกเสมอ)</small></span>
            <Combo className="inp" value={ed.quote_no || ""} onChange={(e) => setF("quote_no", e.target.value)}>
              <option value="">— ไม่ผูกใบเสนอราคา —</option>
              {(() => {
                const opts = quotes.filter((q) => q.status === "approved" && (!ed.customer_id || String(q.customer_id) === String(ed.customer_id)));
                if (ed.quote_no && !opts.some((q) => q.quote_no === ed.quote_no)) {
                  const cur = quotes.find((q) => q.quote_no === ed.quote_no);
                  opts.unshift(cur || { quote_no: ed.quote_no, customerName: "", title: "" });
                }
                return opts.map((q) => <option key={q.quote_no} value={q.quote_no}>{q.quote_no}{q.customerName ? ` · ${q.customerName}` : ""}{q.title ? ` · ${q.title}` : ""}</option>);
              })()}
            </Combo>
          </label>
          <div className="fld-row">
            <label className="fld"><span>ผู้ติดต่อ</span><input className="inp" value={ed.contact_name} onChange={(e) => setF("contact_name", e.target.value)} /></label>
            <label className="fld"><span>เบอร์โทร</span><input className="inp" value={ed.contact_phone} onChange={(e) => setF("contact_phone", e.target.value)} /></label>
          </div>
          <label className="fld"><span>ที่อยู่หน้างาน</span><textarea className="inp" rows={2} style={{ resize: "vertical" }} value={ed.address} onChange={(e) => setF("address", e.target.value)} /></label>
          <label className="fld"><span>ลิงก์แผนที่ (Google Maps)</span><input className="inp" value={ed.map_url} onChange={(e) => setF("map_url", e.target.value)} placeholder="วางลิงก์แผนที่" /></label>
          <label className="fld"><span>รายละเอียดงาน / รายการที่ต้องทำ</span><textarea className="inp" rows={4} style={{ resize: "vertical" }} value={ed.details} onChange={(e) => setF("details", e.target.value)} /></label>

          <label className="fld"><span>โน้ตถึงทีมช่าง (ฝ่ายขาย → ช่าง)</span>
            <textarea className="inp" rows={2} style={{ resize: "vertical" }} value={ed.sales_note} onChange={(e) => setF("sales_note", e.target.value)} placeholder="ข้อความ/ข้อควรระวังถึงช่าง เช่น ลูกค้าสะดวกช่วงบ่าย, จอดรถหลังตึก · วางลิงก์เว็บ/หมุดแผนที่ได้ ช่างกดเปิดได้เลย" /></label>
          <InternalNoteField value={ed.internal_note} onChange={(v) => setF("internal_note", v)} />
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
          {(() => {
            const dated = (ed.visits || []).filter((v) => v.date);
            if (dated.length) {
              const s = deriveJobStatus(dated); const d = STATUS[s] || STATUS.pending;
              return <div className="fld"><span>สถานะงาน (ภาพรวม · คำนวณจากรอบ)</span><div><span className={"job-badge " + d.cls}>{d.th}</span></div></div>;
            }
            // no รอบ scheduled yet → pick the pre-work stage manually
            const cur = ed.status === "quote_pending" ? "quote_pending" : "pending";
            return (
              <div className="fld"><span>สถานะงาน (ยังไม่กำหนดรอบ — เลือกขั้นเริ่มต้น)</span>
                <Combo className="inp" value={cur} onChange={(e) => setF("status", e.target.value)}>
                  <option value="pending">รอจ่ายงาน</option>
                  <option value="quote_pending">รอทำใบเสนอราคา</option>
                </Combo>
              </div>
            );
          })()}

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn-ghost" onClick={() => setEd(null)}>ยกเลิก</button>
            <button className="btn-primary" style={{ flex: 1 }} disabled={saving} onClick={save}><UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> {saving ? "กำลังบันทึก…" : "บันทึกใบงาน"}</button>
          </div>
        </div>
        <TeamSchedulePanel teamId={ed.assigned_team} team={teams.find((t) => t.id === ed.assigned_team)} jobs={list} edVisits={ed.visits} excludeJobNo={ed.job_no} onPick={pickSlot} />
        </div>
        {tplPick && (
          <div className="modal-overlay" onClick={() => setTplPick(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
              <div className="modal-head"><div className="modal-title">📋 เลือกแม่แบบงาน</div><button className="drawer-close" onClick={() => setTplPick(false)}><UIcon name="x" size={20} /></button></div>
              <div className="modal-body">
                {templates.length === 0 ? <div className="empty sm">ยังไม่มีแม่แบบ — กรอกงานแล้วกด “บันทึกเป็นแม่แบบ” เพื่อสร้างอันแรก</div> : (
                  <div className="tpl-list">
                    {templates.map((t) => { const td = jobTypeDef(t.job_type); return (
                      <div key={t.id} className="tpl-row">
                        <button type="button" className="tpl-pick" onClick={() => applyTemplate(t)}>
                          <span className="tpl-type" style={{ background: td[3] }}>{td[2]} {td[1]}</span>
                          <span className="tpl-mid">
                            <span className="tpl-name">{t.name}</span>
                            {(t.title || t.details) && <span className="tpl-detail">{(t.details || t.title || "").replace(/\n/g, " · ").slice(0, 80)}</span>}
                          </span>
                        </button>
                        {canEdit && <button type="button" className="btn-ghost sm danger" onClick={() => removeTemplate(t)}>ลบ</button>}
                      </div>
                    ); })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {toast && <Toast t={toast} />}
      </div>
    );
  }

  // ---------- LIST ----------
  // field techs see only their own team's jobs (no team → nothing)
  const baseList = fieldOnly ? list.filter((j) => j.assigned_team && j.assigned_team === myTeam) : list;
  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ใบงาน <span className="page-title-en">Job Orders</span></h1><p className="page-sub">{baseList.length} ใบ · มอบหมาย & จัดคิวงานช่าง</p></div>
        <div className="cat-head-actions">
          <div className="jo-datefilter">
            <UIcon name="calendar" size={15} color="var(--ink-3)" />
            <input className="inp" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="ตั้งแต่วันที่" />
            <span className="jo-date-dash">–</span>
            <input className="inp" type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} title="ถึงวันที่" />
            <button className="btn-ghost sm" onClick={() => { const d = new Date(), p = (n) => String(n).padStart(2, "0"), t = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; setDateFrom(t); setDateTo(t); }}>วันนี้</button>
            <button className="btn-ghost sm" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); const p = (n) => String(n).padStart(2, "0"), t = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; setDateFrom(t); setDateTo(t); }}>พรุ่งนี้</button>
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
          style={statusF === "all" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ทั้งหมด ({baseList.length})</button>
        {JOB_STATUSES.map(([v, l, , col]) => {
          const n = baseList.filter((j) => j.status === v).length;
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

      {(() => {
        if (fieldOnly) return null; // ช่างเห็นเฉพาะทีมตัวเองอยู่แล้ว ไม่ต้องมีตัวกรองทีม
        const jobTeamIds = new Set(baseList.map((j) => j.assigned_team).filter(Boolean));
        const teamOpts = teams.filter((t) => jobTeamIds.has(t.id));
        if (!teamOpts.length) return null;
        return (
        <div className="cat-filter">
          <button className={"cat-chip" + (teamF === "all" ? " on" : "")} onClick={() => setTeamF("all")}
            style={teamF === "all" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ทุกทีม</button>
          {teamOpts.map((t) => (
            <button key={t.id} className={"cat-chip" + (teamF === t.id ? " on" : "")} onClick={() => setTeamF(t.id)}
              style={teamF === t.id ? { background: t.color, color: "#fff", borderColor: t.color } : {}}>{(t.name || t.id).replace("Team ", "")}</button>
          ))}
        </div>
      ); })()}

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
        const fl = baseList.filter((jo) => (statusF === "all" || jo.status === statusF)
          && (typeF === "all" || (jo.job_type || "install") === typeF)
          && (teamF === "all" || jo.assigned_team === teamF)
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
              <div className="job-card-head jo-card-head" style={{ cursor: "pointer" }} onClick={() => setViewing(jo)} title="กดดูรายละเอียด">
                <div className="job-card-id"><span className="job-no">{jo.job_no}</span>
                  {(() => { const td = jobTypeDef(jo.job_type); return <span className="job-type-chip" style={{ background: td[3] }}>{td[2]} {td[1]}</span>; })()}
                  <span className={"job-badge " + st.cls}>{st.th}</span>{jo.locked && <span className="job-badge" style={{ background: "#64748b", color: "#fff" }}>🔒 ล็อก</span>}{(() => { const f = hoFlags[jo.job_no]; if (!f?.any) return null; return f.signed ? <span className="job-badge b-green" title="มีใบส่งมอบงานที่ส่งแล้วและลูกค้าเซ็นรับ">📝 ใบส่งมอบ ✓</span> : <span className="job-badge b-amber" title={f.submitted ? "ส่งใบส่งมอบแล้วแต่ยังไม่มีลายเซ็นลูกค้า" : "ใบส่งมอบยังเป็นฉบับร่าง"}>📝 ยังไม่เซ็น</span>; })()}
                  {/* สถานะการสั่งของสำหรับงานนี้ (ผ่านใบเสนอราคา ↔ ใบสั่งซื้อ) — ฝ่ายขาย/ทีมช่างเห็นทันทีว่าสั่งแอร์หรือยัง */}
                  {jo.quote_no && (() => {
                    const ch = docLinks.byQuote[jo.quote_no] || {};
                    const n = (ch.poNos || []).length;
                    if (!n) return jo.job_type === "install" && jo.status !== "done" && jo.status !== "cancelled"
                      ? <span className="job-badge b-red" title="งานติดตั้งแต่ยังไม่มีใบสั่งซื้อผูกใบเสนอราคานี้">🛒 ยังไม่สั่งของ</span> : null;
                    return ch.poOpen > 0
                      ? <span className="job-badge b-amber" title="มีใบสั่งซื้อแล้ว แต่ยังรอรับของ — กดชิป 'สั่งซื้อ' ด้านล่างเพื่อเปิดดู">🛒 สั่งแล้ว {n} ใบ · รอรับของ {ch.poOpen}</span>
                      : <span className="job-badge b-green" title="ใบสั่งซื้อทุกใบรับของครบแล้ว">🛒 รับของครบ ({n} ใบ)</span>;
                  })()}</div>
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
              {(() => { const ch = docLinks.byQuote[jo.quote_no] || {}; return <DocChips jobStatusBy={docLinks.jobStatusBy || {}} boqNo={jo.boq_no} quoteNo={jo.quote_no} jobNos={ch.jobNos} invoiceNos={ch.invoiceNos} receiptNos={ch.receiptNos} poNos={ch.poNos} self={{ type: "job", no: jo.job_no }}
                onOpen={(t, n) => setPeek({ type: t, no: n })} />; })()}
              <InternalNoteTag note={jo.internal_note} role={role} />
              {(() => { const sibs = siblingsOf(jo); return sibs.length > 1 ? (
                <div className="job-group-chips"><span style={{ fontSize: 12, color: "var(--ink-2)" }}>🔗 ใบงานเชื่อม:</span>
                  {sibs.map((s) => <button key={s.job_no} className={"job-group-chip" + (s.job_no === jo.job_no ? " cur" : "")} onClick={() => setViewing(s)}>{s.job_no}</button>)}
                </div>
              ) : null; })()}
              {canEditJob(jo) && jo.status === "awaiting_approval" && (
                <div className="job-lines"><div className="job-actions">
                  <button className="btn-primary sm ok" onClick={() => setViewing(jo)}><UIcon name="check" size={14} color="#fff" strokeWidth={2.4} /> ตรวจ & อนุมัติรายรอบ</button>
                </div></div>
              )}
              {canEditJob(jo) && jo.status === "reschedule" && (
                <div className="job-lines"><div className="job-actions">
                  <button className="btn-primary sm" onClick={() => startReschedule(jo)}><UIcon name="calendar" size={14} color="#fff" /> ตั้งวันนัดหมายเพิ่ม</button>
                </div></div>
              )}
              {canEditJob(jo) && jo.status === "quote_pending" && jo.quote_no && (
                <div className="job-lines"><div className="job-actions">
                  <button className="btn-primary sm ok" onClick={() => markQuoteDone(jo)} style={{ background: "#16a34a" }}>
                    <UIcon name="check" size={14} color="#fff" strokeWidth={2.4} /> ใบเสนอราคาเสร็จแล้ว → ปิดงาน
                  </button>
                </div></div>
              )}
              <div className="job-lines"><div className="job-actions">
                <ChatCustomerLink role={role} customerId={jo.customer_id} onGoChat={onGoChat} />
                <button className="btn-ghost sm" onClick={() => setOpenTl(openTl === jo.job_no ? null : jo.job_no)}>
                  <UIcon name="clipboard" size={14} /> {openTl === jo.job_no ? "ซ่อนความเคลื่อนไหว" : "ความเคลื่อนไหว"}
                </button>
                {onCreatePrep && can(role, "prep", "edit") && jo.status !== "cancelled" &&
                  <button className="btn-ghost sm" style={{ color: "#0369a1", borderColor: "#bae6fd", background: "#f0f9ff" }}
                    title={jo.quote_no ? "สร้างใบเตรียมวัสดุของงานนี้ — ดึงรายการจากใบเสนอราคาที่ผูกให้อัตโนมัติ" : "สร้างใบเตรียมวัสดุของงานนี้ (งานไม่มีใบเสนอราคา — เพิ่มรายการเอง)"}
                    onClick={() => onCreatePrep(jo)}>📋 เตรียมวัสดุ</button>}
                {onMovement && can(role, "movements", "edit") && jo.status !== "cancelled" &&
                  <button className="btn-ghost sm" style={{ color: "#7c3aed", borderColor: "#ddd6fe", background: "#f5f3ff" }}
                    title="เบิกวัสดุเพิ่มสำหรับงานนี้ — เปิดหน้าความเคลื่อนไหวสินค้า โหมดเบิก ผูกเลขงาน+ทีมให้อัตโนมัติ"
                    onClick={() => onMovement(jo, "withdraw")}>📦 เบิกวัสดุ</button>}
                {onMovement && can(role, "movements", "edit") && jo.status !== "cancelled" &&
                  <button className="btn-ghost sm" style={{ color: "#16a34a" }} title="คืนวัสดุที่เบิกไปสำหรับงานนี้กลับเข้าคลัง" onClick={() => onMovement(jo, "return")}>↩️ คืนวัสดุ</button>}
                {onMovement && can(role, "movements", "edit") && !["tech", "lead_tech"].includes(role) && jo.status !== "cancelled" &&
                  <button className="btn-ghost sm" style={{ color: "#dc2626" }} title="บันทึกวัสดุตัดเสีย/เสียหายของงานนี้" onClick={() => onMovement(jo, "damage")}>⚠️ ตัดเสีย</button>}
                {canEditJob(jo) && jo.status !== "cancelled" && <button className="btn-ghost sm" onClick={() => addLinked(jo)}><UIcon name="plus" size={14} /> ใบงานเชื่อม</button>}
                {canEditJob(jo) && jo.status !== "cancelled" && <button className="btn-ghost sm" onClick={() => startEdit(jo)}><UIcon name="edit" size={14} /> แก้ไข</button>}
                {canEditJob(jo) && jo.status !== "cancelled" && <button className="btn-ghost sm" onClick={() => cancelJob(jo)}>ยกเลิก</button>}
                {jo.locked && canOverrideLock && <button className="btn-ghost sm" onClick={() => doUnlock(jo)}>🔓 ปลดล็อก</button>}
                {canDelete && <button className="btn-ghost sm danger" title="ลบถาวร (ธุรการ)" onClick={() => del(jo)}><UIcon name="trash" size={14} /> ลบ</button>}
              </div></div>
              {/* หัวหน้าช่าง/ธุรการวัสดุ: ดูใบงาน + คอมเมนต์ในความเคลื่อนไหวได้ทุกใบ แต่แก้สถานะ/แก้ไขใบงานไม่ได้ (ปุ่มพวกนั้น gate ด้วย canEdit) — RLS jl_insert (mig 065) เปิดให้ stock อยู่แล้ว */}
              {openTl === jo.job_no && <JobTimeline jobNo={jo.job_no} groupNo={groupKey(jo)} linked={!!jo.group_no} canPost={canEdit || role === "lead_tech" || role === "stock"} author={me} flash={flash} />}
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
                      {/* งานยกเลิกแล้ว ห้ามมีปุ่มอนุมัติ/นัดต่อ — กติกาบ้าน: เอกสารยกเลิกล็อกทุกการกระทำ */}
                      {canEditJob(jo) && jo.status !== "cancelled" && v.status === "awaiting_approval" && (
                        <div className="myjob-visit-acts" style={{ marginTop: 7 }}>
                          <button className="btn-primary sm ok" onClick={() => { setApproveCtx({ jo, v }); setApRating(jo.rating || 0); setApClaim(!!jo.is_claim); }}>✓ อนุมัติรอบนี้</button>
                        </div>
                      )}
                      {canEditJob(jo) && jo.status !== "cancelled" && v.status === "reschedule" && (
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
                {jo.sales_note && <><div className="cd-sec">บรีฟจากฝ่ายขาย</div><div className="cd-v" style={{ whiteSpace: "pre-wrap" }}><Linkify text={jo.sales_note} /></div></>}
                {jo.sales_photos?.length > 0 && <div className="tl-photos" style={{ marginTop: 8 }}>{jo.sales_photos.map((u, i) => <AttachThumb key={i} url={u} />)}</div>}
              </div>
              <div className="modal-foot">
                {canDelete && <button className="btn-ghost danger" style={{ marginRight: "auto" }} onClick={() => { const j = jo; setViewing(null); del(j); }}><UIcon name="trash" size={15} /> ลบ</button>}
                {onHandover && <button className="btn-ghost" onClick={() => { const j = jo; setViewing(null); onHandover(j); }}><UIcon name="catalog" size={15} /> ใบส่งมอบงาน</button>}
                {jo.locked && canOverrideLock && <button className="btn-ghost" onClick={() => doUnlock(jo)}>🔓 ปลดล็อก</button>}
                {canEditJob(jo) && <button className="btn-ghost" onClick={() => addLinked(jo)}><UIcon name="plus" size={15} /> ใบงานเชื่อม</button>}
                {canEditJob(jo) && <button className="btn-primary" onClick={() => { const j = jo; setViewing(null); startEdit(j); }}><UIcon name="edit" size={15} color="#fff" /> แก้ไข</button>}
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
              {/* คะแนนงาน/งานเคลม — ระดับ "ใบงาน" ไม่ใช่ระดับรอบ · ทุกทีมกรอกได้ ไม่ใช่เฉพาะทีมซัพ */}
              <div className="sub-review" style={{ margin: "0 0 10px" }}>
                <div className="fld"><span>คะแนนงาน (ไม่บังคับ · กดดาวเดิมซ้ำ = ล้าง)</span>
                  <div className="sub-stars">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" className={"sub-star" + (apRating >= n ? " on" : "")}
                        onClick={() => setApRating((r) => (r === n ? 0 : n))}>★</button>
                    ))}
                  </div>
                </div>
                <label className="sub-claim"><input type="checkbox" checked={apClaim} onChange={(e) => setApClaim(e.target.checked)} /> งานนี้เป็นงานเคลม/แก้ซ้ำ</label>
              </div>
              <div className="confirm-acts" style={{ flexDirection: "column" }}>
                <button className="btn-primary ok" style={{ width: "100%" }} onClick={() => approveClose(jo, v)}>✅ เสร็จ ปิดงาน</button>
                <button className="btn-primary" style={{ width: "100%", background: "#0891b2" }} onClick={() => doVisitStatus(jo, v, "reschedule", null, true)}>📅 เสร็จ รอนัดหมายเพิ่ม</button>
                <button className="btn-primary" style={{ width: "100%", background: "#ea580c" }} onClick={() => doVisitStatus(jo, v, "done", "quote_pending", false)}>📝 เสร็จ รอทำใบเสนอราคา</button>
                <button className="btn-ghost" style={{ width: "100%" }} onClick={() => setApproveCtx(null)}>ยกเลิก</button>
              </div>
            </div>
          </div>
        );
      })()}

      {peek && <DocPeek type={peek.type} no={peek.no} onClose={() => setPeek(null)}
        onOpenFull={() => { const p = peek; setPeek(null); onOpenDoc && onOpenDoc(p.type, p.no); }} />}

      {toast && <Toast t={toast} />}
    </div>
  );
}

function Toast({ t }) {
  return <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: t.bad ? "#dc2626" : "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 200, maxWidth: "90%", textAlign: "center" }}>{t.m}</div>;
}

// side panel: the selected team's availability for the next 3 weeks — tap a free slot to book it
const _isoYmd = (s) => { if (!s) return ""; const d = new Date(s); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const _isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const _dShow = (ymd) => { const d = new Date(ymd + "T00:00:00"); return d.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" }); };
const PANEL_DAYS = 21;

function TeamSchedulePanel({ teamId, team, jobs, edVisits, excludeJobNo, onPick }) {
  if (!teamId) return <div className="jo-sched-panel"><div className="jo-sched-empty">เลือกทีมช่างก่อน เพื่อดูช่องว่างของทีม</div></div>;
  const col = team?.color || "#1f74e0";

  // occupancy by date → which slot is taken (full/custom block the whole day)
  const occ = {};
  const mark = (date, slot, info) => {
    const o = occ[date] || (occ[date] = {});
    if (slot === "morning") o.morning = o.morning || info;
    else if (slot === "afternoon") o.afternoon = o.afternoon || info;
    else { o.morning = o.morning || info; o.afternoon = o.afternoon || info; }
  };
  (jobs || []).forEach((j) => {
    if (j.job_no === excludeJobNo || j.status === "cancelled") return;
    const vs = (j.visits && j.visits.length) ? j.visits : [{ assigned_team: j.assigned_team, scheduled_at: j.scheduled_at, end_date: j.end_date, slot: j.slot, status: j.status, visit_date: j.scheduled_at ? _isoYmd(j.scheduled_at) : null }];
    vs.forEach((v) => {
      const t = v.assigned_team || j.assigned_team;
      if (t !== teamId || v.status === "cancelled") return;
      const startYmd = v.visit_date || (v.scheduled_at ? _isoYmd(v.scheduled_at) : null);
      if (!startYmd) return;
      const endYmd = (v.end_date && v.end_date > startYmd) ? v.end_date : startYmd;
      const info = { job_no: j.job_no, customer: j.customerName };
      let d = new Date(startYmd + "T00:00:00"); const e = new Date(endYmd + "T00:00:00");
      while (d <= e) { mark(_isoLocal(d), v.slot, info); d.setDate(d.getDate() + 1); }
    });
  });

  // this job's own picks (so we don't offer them again + show as "เลือกแล้ว")
  const mine = {};
  (edVisits || []).forEach((v) => { if (v.date) (mine[v.date] = mine[v.date] || new Set()).add(v.slot); });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = []; for (let i = 0; i < PANEL_DAYS; i++) { const d = new Date(today); d.setDate(d.getDate() + i); days.push(_isoLocal(d)); }

  const chip = (date, slotId, label) => {
    const o = occ[date] || {};
    const taken = slotId === "full" ? (o.morning || o.afternoon) : o[slotId];
    const mineHere = mine[date] && (mine[date].has(slotId) || mine[date].has("full"));
    if (mineHere) return <span className="jo-av-chip mine">🟠 {label} · เลือกแล้ว</span>;
    if (taken) return <span className="jo-av-chip booked" title={`${taken.job_no} ${taken.customer || ""}`}>{label} · มีงาน</span>;
    return <button type="button" className="jo-av-chip free" onClick={() => onPick && onPick(date, slotId)}>＋ {label} ว่าง</button>;
  };

  return (
    <div className="jo-sched-panel">
      <div className="jo-sched-head" style={{ borderColor: col }}>
        <b style={{ color: col }}>ลงคิวทีม {team?.name?.replace("Team ", "") || teamId}</b>
        <span>แตะช่องว่างเพื่อลงคิว</span>
      </div>
      <div className="jo-sched-hint">🟢 ว่าง (กดเพื่อเลือก) · 🔴 มีงานแล้ว · 🟠 รอบที่กำลังลง</div>
      <div className="jo-av-list">
        {days.map((d) => {
          const o = occ[d] || {};
          const bothFree = !o.morning && !o.afternoon && !mine[d];
          return (
            <div className="jo-av-day" key={d}>
              <div className="jo-av-date">{_dShow(d)}</div>
              <div className="jo-av-slots">
                {chip(d, "morning", "เช้า")}
                {chip(d, "afternoon", "บ่าย")}
                {bothFree && <button type="button" className="jo-av-chip full" onClick={() => onPick && onPick(d, "full")}>＋ เต็มวัน</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
